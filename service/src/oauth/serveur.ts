/**
 * Le serveur d'autorisation OAuth 2.1 des assistants IA (claude.ai, ChatGPT,
 * Claude Code…), écrit à la main sur le patron éprouvé de Lumis
 * (`apps/api/assistant/oauth.go`, `token.go`) : le SDK MCP v2 ne fournit que
 * le côté ressource, et son ancien routeur d'autorisation est gelé.
 *
 * Choix non évidents :
 * - **Rien n'est gardé avant l'accord** : l'inscription rend un `client_id`
 *   signé, borné (≤ 5 adresses de retour reconnues, nom nettoyé), et la
 *   demande voyage signée jusqu'à la page d'accord.
 * - **L'accord se donne connecté à Arpente**, sur une page servie ici, sur la
 *   même origine que GoTrue. Le jeton de session de la page est jugé par
 *   GoTrue, et doit être né APRÈS la demande (claim `amr`) : un jeton d'app
 *   volé ne devient pas un accès de 90 jours.
 * - **`iss` dans chaque réponse d'autorisation** (RFC 9207) : ChatGPT prend
 *   alors son adresse de retour stable.
 * - **Rotation des jetons de rafraîchissement** : l'accès porte une
 *   génération ; un ancien jeton rejoué trahit une copie, et l'accès entier
 *   est supprimé.
 * - **`resource`** (RFC 8707) : l'adresse `/mcp`, ou l'origine nue que
 *   certains clients envoient ; l'audience des jetons reste toujours `/mcp`.
 *
 * Invariants : aucun jeton, code ni secret n'est journalisé ; une adresse de
 * retour non reconnue n'est jamais suivie — on répond 400 sur place ; un code
 * sert une fois, même quand son échange échoue.
 */
import { timingSafeEqual } from 'node:crypto'
import express, { type Request, type Response, type Router } from 'express'
import { journal, messageErreur } from '../journal'
import { Fenetre } from '../limites'
import type { JugeJeton } from '../gotrue'
import { nettoyerTexte } from '../texte'
import type { Autorisation, DepotAutorisations } from './autorisations'
import { Codes } from './codes'
import { empreinteClient, type Revendications, type Signataire } from './jetons'
import { defiValide, pkceCorrespond } from './pkce'
import { avecParametres, reconnaitre } from './retours'

export const CHEMINS = {
  ressource: '/mcp',
  metadonnees: '/.well-known/oauth-authorization-server',
  ressourceProtegee: '/.well-known/oauth-protected-resource',
  inscription: '/oauth/register',
  autorisation: '/oauth/authorize',
  accord: '/oauth/accord',
  jeton: '/oauth/token',
  revocation: '/oauth/revoke',
} as const

export const SCOPE = 'arpente'

const SECONDE = 1
const MINUTE = 60 * SECONDE
const JOUR = 24 * 60 * MINUTE

export const DUREES = {
  client: 5 * 365 * JOUR,
  demande: 10 * MINUTE,
  code: 5 * MINUTE,
  acces: 60 * MINUTE,
  rafraichissement: 30 * JOUR,
  /** Au terme, l'assistant redemande : un jeton volé ne vit pas indéfiniment. */
  autorisation: 90 * JOUR,
} as const

const BORNES = { nomClient: 80, retours: 5, longueurUri: 300, state: 500 } as const
/** Écart toléré entre l'horloge de GoTrue et la nôtre (même machine). */
const TOLERANCE_HORLOGE = 5

const METHODES_AUTH = new Set(['none', 'client_secret_post', 'client_secret_basic'])

export interface DependancesOAuth {
  signataire: Signataire
  autorisations: DepotAutorisations
  juge: JugeJeton
  /** Rend la page d'accord ; reçoit des textes déjà vérifiés. */
  pageAccord: (vue: { assistant: string, client: string } | { erreur: string }) => string
  maintenant?: () => number
}

interface Client {
  id: string
  nom: string
  retours: string[]
  methode: string
}

type Verdict = { ok: true, autorisation: Autorisation } | { ok: false, statut: number, code: string, description: string }

function json(res: Response, statut: number, corps: unknown): void {
  res.status(statut).set('Cache-Control', 'no-store').json(corps)
}

function erreurOAuth(res: Response, statut: number, code: string, description: string): void {
  json(res, statut, { error: code, error_description: description })
}

function seulementParmi(valeurs: unknown, permises: string[]): boolean {
  return valeurs === undefined || (Array.isArray(valeurs) && valeurs.every(v => permises.includes(v)))
}

function egalTempsConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

function chaine(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : ''
}

export function routeurOAuth(d: DependancesOAuth): Router {
  const maintenant = d.maintenant ?? (() => Date.now())
  const enSecondes = (): number => Math.floor(maintenant() / 1000)
  const codes = new Codes(maintenant)
  const inscriptions = new Fenetre(100, 60 * 60 * 1000)
  const autorisationsIp = new Fenetre(60, 10 * 60 * 1000)
  const jetonsIp = new Fenetre(60, 10 * 60 * 1000)
  const accordsIp = new Fenetre(60, 10 * 60 * 1000)
  const emetteur = d.signataire.emetteur
  const ressource = d.signataire.ressource

  async function client(clientId: string): Promise<Client | null> {
    const r = await d.signataire.verifier(clientId, 'client')
    if (!r || !Array.isArray(r.r)) return null
    return { id: clientId, nom: r.n ?? '', retours: r.r, methode: r.a ?? 'client_secret_post' }
  }

  function ressourceAdmise(valeur: string): boolean {
    const v = valeur.replace(/\/+$/, '')
    return v === '' || v === ressource || v === emetteur
  }

  async function demande(brute: string): Promise<{ r: Revendications, c: Client, assistant: string } | null> {
    const r = await d.signataire.verifier(brute, 'demande')
    if (!r?.cid || !r.ru) return null
    const c = await client(r.cid)
    const assistant = reconnaitre(r.ru)
    if (!c || !assistant || !c.retours.includes(r.ru)) return null
    return { r, c, assistant }
  }

  // ── découverte ───────────────────────────────────────────────────────
  function metadonnees(_req: Request, res: Response): void {
    json(res, 200, {
      issuer: emetteur,
      authorization_endpoint: emetteur + CHEMINS.autorisation,
      token_endpoint: emetteur + CHEMINS.jeton,
      registration_endpoint: emetteur + CHEMINS.inscription,
      revocation_endpoint: emetteur + CHEMINS.revocation,
      scopes_supported: [SCOPE],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [...METHODES_AUTH],
      revocation_endpoint_auth_methods_supported: [...METHODES_AUTH],
      authorization_response_iss_parameter_supported: true,
    })
  }

  // ── inscription dynamique (RFC 7591) ────────────────────────────────
  async function inscrire(req: Request, res: Response): Promise<void> {
    if (!inscriptions.autorise(req.ip ?? 'inconnue')) {
      erreurOAuth(res, 429, 'slow_down', 'Trop d\'inscriptions depuis cette adresse.')
      return
    }
    const corps = (req.body ?? {}) as Record<string, unknown>
    const retours = corps.redirect_uris
    if (!Array.isArray(retours) || retours.length === 0 || retours.length > BORNES.retours
      || !retours.every(u => typeof u === 'string' && u.length <= BORNES.longueurUri && reconnaitre(u))) {
      erreurOAuth(res, 400, 'invalid_redirect_uri',
        'Adresse de retour non reconnue : seuls les assistants connus peuvent se brancher.')
      return
    }
    const methode = chaine(corps.token_endpoint_auth_method) || 'client_secret_post'
    const portee = chaine(corps.scope)
    if (!METHODES_AUTH.has(methode)
      || !seulementParmi(corps.grant_types, ['authorization_code', 'refresh_token'])
      || !seulementParmi(corps.response_types, ['code'])
      || (portee !== '' && portee !== SCOPE)) {
      erreurOAuth(res, 400, 'invalid_client_metadata', 'Inscription non prise en charge.')
      return
    }
    const nom = nettoyerTexte(chaine(corps.client_name), BORNES.nomClient) || 'Assistant'
    const clientId = await d.signataire.signer({ typ: 'client', n: nom, r: retours as string[], a: methode }, DUREES.client)
    const reponse: Record<string, unknown> = {
      client_id: clientId,
      client_id_issued_at: enSecondes(),
      client_name: nom,
      redirect_uris: retours,
      token_endpoint_auth_method: methode,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: SCOPE,
    }
    if (methode !== 'none') {
      reponse.client_secret = d.signataire.secretClient(clientId)
      reponse.client_secret_expires_at = 0
    }
    json(res, 201, reponse)
  }

  // ── autorisation ────────────────────────────────────────────────────
  async function autoriser(req: Request, res: Response): Promise<void> {
    if (!autorisationsIp.autorise(req.ip ?? 'inconnue')) {
      res.status(429).type('text/plain').send('Trop de demandes depuis cette adresse.')
      return
    }
    const q = req.query as Record<string, unknown>
    const c = await client(chaine(q.client_id))
    if (!c) {
      res.status(400).type('text/plain').send('Assistant inconnu : il doit d\'abord s\'inscrire.')
      return
    }
    let retour = chaine(q.redirect_uri)
    let explicite = true
    if (!retour && c.retours.length === 1) {
      retour = c.retours[0]!
      explicite = false
    }
    if (!reconnaitre(retour) || !c.retours.includes(retour)) {
      res.status(400).type('text/plain').send('Adresse de retour non reconnue.')
      return
    }
    const state = chaine(q.state)
    const echec = (code: string, description: string): void => {
      res.redirect(302, avecParametres(retour, { error: code, error_description: description, state, iss: emetteur }))
    }
    const portee = chaine(q.scope)
    if (q.response_type !== 'code') return echec('unsupported_response_type', 'Seul response_type=code est pris en charge.')
    if (q.code_challenge_method !== 'S256' || !defiValide(chaine(q.code_challenge))) return echec('invalid_request', 'PKCE S256 obligatoire.')
    if (state.length > BORNES.state) return echec('invalid_request', 'state trop long.')
    if (portee !== '' && !portee.split(' ').every(s => s === SCOPE)) return echec('invalid_scope', `Seul le scope ${SCOPE} existe.`)
    if (!ressourceAdmise(chaine(q.resource))) return echec('invalid_target', 'Ce serveur ne sert que sa ressource /mcp.')

    const jeton = await d.signataire.signer({
      typ: 'demande', cid: c.id, ru: retour, rue: explicite, cc: chaine(q.code_challenge), st: state, sc: SCOPE,
    }, DUREES.demande)
    res.redirect(302, `${CHEMINS.accord}?demande=${encodeURIComponent(jeton)}`)
  }

  // ── page d'accord et décision ───────────────────────────────────────
  async function afficherAccord(req: Request, res: Response): Promise<void> {
    const dm = await demande(chaine(req.query.demande))
    const html = dm
      ? d.pageAccord({ assistant: dm.assistant, client: dm.c.nom })
      : d.pageAccord({ erreur: 'Cette demande a expiré ou n\'est pas valable : relance la connexion depuis ton assistant.' })
    res.status(dm ? 200 : 400).type('html').set('Cache-Control', 'no-store').send(html)
  }

  async function decider(req: Request, res: Response): Promise<void> {
    if (!accordsIp.autorise(req.ip ?? 'inconnue')) {
      json(res, 429, { erreur: 'Trop de demandes depuis cette adresse.' })
      return
    }
    const corps = (req.body ?? {}) as Record<string, unknown>
    const dm = await demande(chaine(corps.demande))
    if (!dm) {
      json(res, 400, { erreur: 'Cette demande a expiré : relance la connexion depuis ton assistant.' })
      return
    }
    const base = { state: dm.r.st ?? '', iss: emetteur }
    if (corps.decision === 'refuser') {
      json(res, 200, { redirection: avecParametres(dm.r.ru!, { ...base, error: 'access_denied' }) })
      return
    }
    if (corps.decision !== 'autoriser') {
      json(res, 400, { erreur: 'Décision inconnue.' })
      return
    }
    const jetonSession = chaine(req.get('authorization')).replace(/^Bearer\s+/i, '')
    const personne = await d.juge(jetonSession)
    if (!personne) {
      json(res, 401, { erreur: 'Connecte-toi à ton compte Arpente pour autoriser l\'assistant.' })
      return
    }
    if (personne.anonyme) {
      json(res, 403, { erreur: 'Il faut un compte Arpente (adresse e-mail ou Google) pour autoriser un assistant.' })
      return
    }
    if (personne.connecteLe + TOLERANCE_HORLOGE < (dm.r.iat ?? Infinity)) {
      json(res, 401, { erreur: 'Reconnecte-toi sur cette page pour confirmer que c\'est bien toi.' })
      return
    }
    const autorisation = await d.autorisations.remplacer({
      userId: personne.id,
      cleClient: empreinteClient(dm.c.id),
      nomClient: dm.c.nom || 'Assistant',
      assistant: nettoyerTexte(dm.assistant, 80),
      expireLe: new Date(maintenant() + DUREES.autorisation * 1000),
    })
    const code = codes.creer({
      cleClient: autorisation.cleClient,
      retour: dm.r.ru!,
      explicite: dm.r.rue === true,
      defi: dm.r.cc ?? '',
      autorisationId: autorisation.id,
    }, DUREES.code * 1000)
    json(res, 200, { redirection: avecParametres(dm.r.ru!, { ...base, code }) })
  }

  // ── jetons ──────────────────────────────────────────────────────────
  async function authentifier(req: Request): Promise<Client | null> {
    const corps = (req.body ?? {}) as Record<string, unknown>
    let id = chaine(corps.client_id)
    let secret = chaine(corps.client_secret)
    const basique = /^Basic\s+(.+)$/i.exec(chaine(req.get('authorization')))
    if (basique) {
      const [brutId, ...brutSecret] = Buffer.from(basique[1]!, 'base64').toString('utf8').split(':')
      try {
        id = decodeURIComponent(brutId ?? '')
        secret = decodeURIComponent(brutSecret.join(':'))
      }
      catch {
        return null
      }
    }
    const c = await client(id)
    if (!c) return null
    if (c.methode === 'none') return secret === '' ? c : null
    return egalTempsConstant(secret, d.signataire.secretClient(c.id)) ? c : null
  }

  async function autorisationVivante(id: string, cleClient: string): Promise<Autorisation | null> {
    const a = await d.autorisations.lire(id)
    if (!a || a.cleClient !== cleClient) return null
    if (a.expireLe.getTime() <= maintenant()) {
      await d.autorisations.supprimer(a.id)
      return null
    }
    return a
  }

  async function emettre(res: Response, cleClient: string, autorisationId: string, generation: number): Promise<void> {
    const commun = { cid: cleClient, sc: SCOPE, sub: autorisationId }
    const acces = await d.signataire.signer({ ...commun, typ: 'acces', aud: ressource }, DUREES.acces)
    const rafraichissement = await d.signataire.signer({ ...commun, typ: 'rafraichissement', gen: generation }, DUREES.rafraichissement)
    res.set('Pragma', 'no-cache')
    json(res, 200, {
      access_token: acces,
      token_type: 'Bearer',
      expires_in: DUREES.acces,
      refresh_token: rafraichissement,
      scope: SCOPE,
    })
  }

  async function echangerCode(req: Request, res: Response, c: Client): Promise<void> {
    const f = req.body as Record<string, unknown>
    const code = codes.prendre(chaine(f.code))
    const cle = empreinteClient(c.id)
    const retourDonne = chaine(f.redirect_uri)
    if (!code || code.cleClient !== cle) return erreurOAuth(res, 400, 'invalid_grant', 'Code invalide ou expiré.')
    if ((code.explicite || retourDonne !== '') && retourDonne !== code.retour) {
      return erreurOAuth(res, 400, 'invalid_grant', 'Adresse de retour différente de la demande.')
    }
    if (!pkceCorrespond(chaine(f.code_verifier), code.defi)) return erreurOAuth(res, 400, 'invalid_grant', 'Vérificateur PKCE incorrect.')
    if (!ressourceAdmise(chaine(f.resource))) return erreurOAuth(res, 400, 'invalid_target', 'Ce serveur ne sert que sa ressource /mcp.')
    const a = await autorisationVivante(code.autorisationId, cle)
    if (!a) return erreurOAuth(res, 400, 'invalid_grant', 'Accès révoqué : reconnecte l\'assistant.')
    await emettre(res, cle, a.id, a.generation)
  }

  async function echangerRafraichissement(req: Request, res: Response, c: Client): Promise<void> {
    const f = req.body as Record<string, unknown>
    const r = await d.signataire.verifier(chaine(f.refresh_token), 'rafraichissement')
    const cle = empreinteClient(c.id)
    if (!r?.sub || r.cid !== cle || typeof r.gen !== 'number') {
      return erreurOAuth(res, 400, 'invalid_grant', 'Jeton de rafraîchissement invalide.')
    }
    if (!ressourceAdmise(chaine(f.resource))) return erreurOAuth(res, 400, 'invalid_target', 'Ce serveur ne sert que sa ressource /mcp.')
    const a = await autorisationVivante(r.sub, cle)
    if (!a) return erreurOAuth(res, 400, 'invalid_grant', 'Accès révoqué : reconnecte l\'assistant.')
    if (!(await d.autorisations.tourner(a.id, r.gen))) {
      // Un ancien jeton présenté de nouveau : une copie circule. On retire tout.
      await d.autorisations.supprimer(a.id)
      journal.avertissement('assistant_rejeu_rafraichissement', { autorisation: a.id })
      return erreurOAuth(res, 400, 'invalid_grant', 'Jeton déjà utilisé : accès retiré par sécurité, reconnecte l\'assistant.')
    }
    await emettre(res, cle, a.id, r.gen + 1)
  }

  async function jeton(req: Request, res: Response): Promise<void> {
    if (!jetonsIp.autorise(req.ip ?? 'inconnue')) {
      erreurOAuth(res, 429, 'slow_down', 'Trop de demandes depuis cette adresse.')
      return
    }
    const c = await authentifier(req)
    if (!c) {
      res.set('WWW-Authenticate', 'Basic realm="assistant"')
      erreurOAuth(res, 401, 'invalid_client', 'Assistant non authentifié.')
      return
    }
    const type = chaine((req.body as Record<string, unknown>).grant_type)
    if (type === 'authorization_code') return echangerCode(req, res, c)
    if (type === 'refresh_token') return echangerRafraichissement(req, res, c)
    erreurOAuth(res, 400, 'unsupported_grant_type', 'authorization_code ou refresh_token.')
  }

  // ── révocation (RFC 7009) : toujours 200 ─────────────────────────────
  async function revoquer(req: Request, res: Response): Promise<void> {
    const c = await authentifier(req)
    if (!c) {
      erreurOAuth(res, 401, 'invalid_client', 'Assistant non authentifié.')
      return
    }
    const brut = chaine((req.body as Record<string, unknown>).token)
    const r = await d.signataire.verifier(brut, 'rafraichissement')
      ?? await d.signataire.verifier(brut, 'acces', ressource)
    if (r?.sub && r.cid === empreinteClient(c.id)) await d.autorisations.supprimer(r.sub)
    res.status(200).set('Cache-Control', 'no-store').end()
  }

  // ── montage ─────────────────────────────────────────────────────────
  const avecErreurs = (f: (req: Request, res: Response) => Promise<void> | void) =>
    (req: Request, res: Response): void => {
      Promise.resolve(f(req, res)).catch((erreur: unknown) => {
        journal.erreur('oauth_erreur', { route: req.path, message: messageErreur(erreur) })
        if (!res.headersSent) erreurOAuth(res, 500, 'server_error', 'Vérification impossible, réessaie.')
      })
    }
  const corpsJson = express.json({ limit: '16kb' })
  const corpsFormulaire = express.urlencoded({ extended: false, limit: '16kb' })

  const routeur = express.Router()
  routeur.get(CHEMINS.metadonnees, metadonnees)
  routeur.post(CHEMINS.inscription, corpsJson, avecErreurs(inscrire))
  routeur.get(CHEMINS.autorisation, avecErreurs(autoriser))
  routeur.get(CHEMINS.accord, avecErreurs(afficherAccord))
  routeur.post(CHEMINS.accord, corpsJson, avecErreurs(decider))
  routeur.post(CHEMINS.jeton, corpsFormulaire, corpsJson, avecErreurs(jeton))
  routeur.post(CHEMINS.revocation, corpsFormulaire, corpsJson, avecErreurs(revoquer))
  return routeur
}
