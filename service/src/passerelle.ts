/**
 * Passerelle devant les deux points de GoTrue qu'utilise la connexion par
 * code : `POST /auth/v1/otp` (envoyer un code) et `POST /auth/v1/verify`
 * (le vérifier). Caddy les envoie ici ; tout le reste de GoTrue passe en
 * direct, sous sa liste d'admission. Modèle : Agora, `worker/authgate`.
 *
 * Pourquoi (bonnes-pratiques C1, C2) :
 * - **Ne rien révéler de l'existence d'un compte.** GoTrue répond à `/otp`
 *   différemment selon l'adresse : une adresse neuve passe par une
 *   inscription interne (plus lente), une adresse connue non, et un 429 par
 *   adresse n'existe que pour une adresse déjà servie. La passerelle répond
 *   donc toujours `{}` en 200, au bout du même délai, quoi que réponde GoTrue
 *   — sauf les erreurs qui ne dépendent que de la saisie (CAPTCHA refusé,
 *   adresse mal formée, limite par adresse IP), rendues aussitôt.
 * - **Limiter les essais par adresse e-mail.** GoTrue ne compte que par
 *   adresse IP : rien n'empêche des milliers d'essais répartis sur un même
 *   code à 6 chiffres. Pause de 15 minutes après 5 échecs pour une adresse
 *   depuis une même IP (un tiers qui se trompe exprès ne bloque que lui), ou
 *   20 toutes IP confondues ; l'essai est compté avant d'être relayé.
 *
 * Choix non évidents :
 * - au-delà du délai, la réponse part sans attendre GoTrue, dont la requête
 *   continue détachée : le titulaire reçoit son code même si l'envoi SMTP est
 *   lent. Ces envois détachés sont plafonnés (`MAX_EN_COURS`) : au-delà, 503,
 *   une réponse qui ne dépend que de la charge ;
 * - plafonds par IP sur les envois et les vérifications ; ils ne dépendent
 *   pas de l'adresse, donc ne disent rien d'un compte ;
 * - l'adresse est mise en minuscules et n'admet que l'ASCII, sans guillemets
 *   ni chevrons : la clé des compteurs et ce que reçoit GoTrue sont la même
 *   chaîne, et une variante d'écriture n'ouvre pas un compteur neuf ;
 * - les adresses ne sont gardées en mémoire que sous forme d'empreinte ;
 * - `X-Forwarded-For`, posé par Caddy, est relayé tel quel : GoTrue limite par
 *   client d'après lui (`GOTRUE_RATE_LIMIT_HEADER`).
 *
 * **Compte d'examen** (`config.examen`) : les examinateurs de Google Play ne
 * reçoivent pas d'e-mail et n'ont pas le droit de créer un compte. Pour UNE
 * adresse, définie sur le serveur, `/otp` n'envoie rien (même réponse, même
 * délai) et `/verify` accepte un code fixe : la passerelle ouvre alors la
 * session elle-même, par le mot de passe du compte que seul le service
 * connaît (GoTrue sur le réseau interne ; le grant `password` reste fermé au
 * public par Caddy). Un code fixe ne s'use pas comme un code de 15 minutes :
 * en plus des compteurs ordinaires, au plus `MAX_ECHECS_EXAMEN` échecs par
 * jour, toutes IP confondues. Toutes les autres adresses suivent le chemin
 * ordinaire. Avec le CAPTCHA, GoTrue exige un jeton Turnstile pour le grant
 * `password` aussi : celui que l'app joint à la demande de code (que la
 * passerelle ne relaie pas, n'ayant rien à envoyer) est gardé quelques
 * minutes par IP, puis joint UNE fois à la connexion — un jeton Turnstile ne
 * sert qu'une fois et vit cinq minutes.
 *
 * Invariant : aucun corps (adresse, code, jeton) n'est journalisé.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import express, { type Request, type Response, type Router } from 'express'
import type { CompteExamen } from './config'
import { journal, messageErreur } from './journal'
import { Fenetre } from './limites'

export const DELAI_ENVOI_MS = 1_500
export const PLANCHER_VERIFICATION_MS = 300
const MAX_EN_COURS = 32
const DELAI_GOTRUE_MS = 30_000
const PAUSE_ECHECS_MS = 15 * 60 * 1000
/** Échecs tolérés pour une adresse depuis une même IP : au-delà, pause. */
export const MAX_ECHECS_ADRESSE_IP = 5
/** Échecs tolérés pour une adresse toutes IP confondues : le frein d'un essai réparti. */
export const MAX_ECHECS_ADRESSE = 20
/** Par adresse IP, sur 10 minutes : envois de code, vérifications. */
export const ENVOIS_PAR_IP = 10
export const VERIFICATIONS_PAR_IP = 30
const FENETRE_IP_MS = 10 * 60 * 1000
/** Compte d'examen : échecs tolérés par jour, toutes IP confondues (un code fixe n'expire pas). */
export const MAX_ECHECS_EXAMEN = 10
const FENETRE_EXAMEN_MS = 24 * 3600 * 1000
/** Un jeton Turnstile vit 300 s : gardé un peu moins, pour ne jamais joindre un jeton mort. */
const VIE_CAPTCHA_EXAMEN_MS = 290_000
const MAX_CAPTCHAS_EXAMEN = 100
// ASCII seulement, sans guillemets ni chevrons : une variante d'écriture que
// GoTrue ramènerait à la même adresse (« <a@b.c> », « "a"@b.c », un İ turc
// que Go et JavaScript ne mettent pas en minuscule de la même façon) aurait
// sinon son propre compteur d'échecs.
const ADRESSE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/
const CODE = /^\d{6}$/

/** Erreurs de `/otp` qui ne dépendent que de la saisie : rendues telles quelles. */
const SANS_DANGER = new Set(['captcha_failed', 'validation_failed', 'email_address_invalid', 'over_request_rate_limit'])

interface RelaiGotrue {
  statut: number
  corps: string
  version: string | null
}

const attendre = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/** Le jeton CAPTCHA tel que GoTrue l'attend, sans rien d'autre. */
function securite(corps: Record<string, unknown>): { captcha_token?: string } {
  const s = corps.gotrue_meta_security as { captcha_token?: unknown } | undefined
  return typeof s?.captcha_token === 'string' ? { captcha_token: s.captcha_token.slice(0, 4096) } : {}
}

/** L'adresse telle qu'elle part à GoTrue et sert de clé : sans blancs, en minuscules. */
function adresseNormalisee(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  const adresse = valeur.trim().toLowerCase()
  return adresse.length <= 254 && ADRESSE.test(adresse) ? adresse : null
}

function empreinte(valeur: string): string {
  return createHash('sha256').update(valeur).digest('hex')
}

function codeErreur(corps: string): string {
  try {
    const j = JSON.parse(corps) as { error_code?: unknown, code?: unknown }
    return typeof j.error_code === 'string' ? j.error_code : (typeof j.code === 'string' ? j.code : '')
  }
  catch {
    return ''
  }
}

function repondre(res: Response, statut: number, corps: string, version: string | null): void {
  res.status(statut).type('application/json').set('Cache-Control', 'no-store')
  if (version) res.set('X-Supabase-Api-Version', version)
  res.send(corps)
}

/** Une erreur au format de GoTrue (API 2024-01-01). */
function erreurGotrue(statut: number, code: string, message: string): string {
  return JSON.stringify({ code: statut, error_code: code, msg: message })
}

const TROP_D_ESSAIS = erreurGotrue(429, 'over_request_rate_limit', 'Trop d\'essais : réessaie dans quelques minutes.')
/** Le refus de GoTrue pour un code faux ou expiré, mot pour mot. */
const CODE_REFUSE = erreurGotrue(403, 'otp_expired', 'Token has expired or is invalid')

function memeCode(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function routeurPasserelle(
  urlGotrue: string,
  maintenant: () => number = () => Date.now(),
  examen: CompteExamen | null = null,
): Router {
  const estExamen = (adresse: string): boolean => examen !== null && adresse === examen.adresse
  // Deux compteurs d'échecs : par adresse ET par IP (un tiers qui se trompe
  // exprès ne bloque que lui-même), et par adresse seule, plus haut (le frein
  // d'un essai réparti sur de nombreuses IP).
  const echecsAdresseIp = new Fenetre(MAX_ECHECS_ADRESSE_IP, PAUSE_ECHECS_MS)
  const echecsAdresse = new Fenetre(MAX_ECHECS_ADRESSE, PAUSE_ECHECS_MS)
  const envoisIp = new Fenetre(ENVOIS_PAR_IP, FENETRE_IP_MS)
  const verificationsIp = new Fenetre(VERIFICATIONS_PAR_IP, FENETRE_IP_MS)
  const echecsExamen = new Fenetre(MAX_ECHECS_EXAMEN, FENETRE_EXAMEN_MS)
  // Jeton CAPTCHA de la dernière demande de code d'examen, par IP (voir l'en-tête).
  const captchasExamen = new Map<string, { jeton: string, expire: number }>()
  let enCours = 0

  function garderCaptchaExamen(ip: string, jeton: string | undefined): void {
    if (!jeton) return
    if (captchasExamen.size >= MAX_CAPTCHAS_EXAMEN) captchasExamen.clear()
    captchasExamen.set(ip, { jeton, expire: maintenant() + VIE_CAPTCHA_EXAMEN_MS })
  }

  /** Le jeton gardé pour cette IP, retiré au passage : il ne sert qu'une fois. */
  function prendreCaptchaExamen(ip: string): { captcha_token?: string } {
    const garde = captchasExamen.get(ip)
    captchasExamen.delete(ip)
    return garde && garde.expire > maintenant() ? { captcha_token: garde.jeton } : {}
  }

  async function relayer(req: Request, chemin: string, corps: Record<string, unknown>): Promise<RelaiGotrue> {
    const entetes: Record<string, string> = { 'content-type': 'application/json' }
    const version = req.get('x-supabase-api-version')
    if (version) entetes['x-supabase-api-version'] = version
    const transfert = req.get('x-forwarded-for')
    if (transfert) entetes['x-forwarded-for'] = transfert
    const reponse = await fetch(`${urlGotrue}${chemin}`, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_GOTRUE_MS),
    })
    return { statut: reponse.status, corps: await reponse.text(), version: reponse.headers.get('x-supabase-api-version') }
  }

  async function envoyerCode(req: Request, res: Response): Promise<void> {
    const debut = maintenant()
    const corps = (req.body ?? {}) as Record<string, unknown>
    const adresse = adresseNormalisee(corps.email)
    if (!adresse || 'phone' in corps) {
      repondre(res, 400, erreurGotrue(400, 'validation_failed', 'Adresse e-mail invalide.'), null)
      return
    }
    const version = req.get('x-supabase-api-version') ?? null
    // Refus qui ne dépendent que de l'IP ou de la charge, jamais de l'adresse :
    // ils ne disent rien d'un compte.
    if (!envoisIp.autorise(req.ip ?? 'inconnue', maintenant())) {
      repondre(res, 429, TROP_D_ESSAIS, version)
      return
    }
    if (enCours >= MAX_EN_COURS) {
      repondre(res, 503, erreurGotrue(503, 'service_busy', 'Service momentanément chargé : réessaie dans un instant.'), version)
      return
    }
    const reponseUniforme = async (): Promise<void> => {
      await attendre(Math.max(0, debut + DELAI_ENVOI_MS - maintenant()))
      repondre(res, 200, '{}', version)
    }
    // Compte d'examen : aucun e-mail à envoyer, mais la réponse de tout le monde.
    if (estExamen(adresse)) {
      garderCaptchaExamen(req.ip ?? 'inconnue', securite(corps).captcha_token)
      await reponseUniforme()
      return
    }
    enCours++
    // Corps reconstruit : create_user forcé (sinon GoTrue répond autrement à
    // une adresse inconnue), ni métadonnées ni adresse de redirection.
    const relai = relayer(req, '/otp', { email: adresse, create_user: true, gotrue_meta_security: securite(corps) })
      .catch((erreur: unknown) => {
        journal.avertissement('passerelle_otp_injoignable', { message: messageErreur(erreur) })
        return null
      })
      .finally(() => { enCours-- })
    const premier = await Promise.race([relai, attendre(DELAI_ENVOI_MS).then(() => 'delai' as const)])
    if (premier && premier !== 'delai' && premier.statut >= 400 && SANS_DANGER.has(codeErreur(premier.corps))) {
      repondre(res, premier.statut, premier.corps, premier.version)
      return
    }
    await reponseUniforme()
  }

  async function verifierCode(req: Request, res: Response): Promise<void> {
    const debut = maintenant()
    const corps = (req.body ?? {}) as Record<string, unknown>
    const adresse = adresseNormalisee(corps.email)
    const version = req.get('x-supabase-api-version') ?? null
    // Seul le code reçu par e-mail passe : ni lien, ni token_hash, ni téléphone.
    if (corps.type !== 'email' || !adresse || typeof corps.token !== 'string' || !CODE.test(corps.token)
      || 'token_hash' in corps || 'phone' in corps) {
      repondre(res, 400, erreurGotrue(400, 'validation_failed', 'Code à 6 chiffres attendu.'), null)
      return
    }
    const ip = req.ip ?? 'inconnue'
    if (!verificationsIp.autorise(ip, maintenant())) {
      repondre(res, 429, TROP_D_ESSAIS, version)
      return
    }
    const cleAdresse = empreinte(adresse)
    const cleAdresseIp = empreinte(`${adresse}|${ip}`)
    const examinateur = estExamen(adresse)
    if (echecsAdresseIp.compte(cleAdresseIp, maintenant()) >= MAX_ECHECS_ADRESSE_IP
      || echecsAdresse.compte(cleAdresse, maintenant()) >= MAX_ECHECS_ADRESSE
      || (examinateur && echecsExamen.compte(cleAdresse, maintenant()) >= MAX_ECHECS_EXAMEN)) {
      repondre(res, 429, TROP_D_ESSAIS, version)
      return
    }
    // L'essai est compté AVANT d'être relayé : des requêtes parallèles ne
    // passent pas toutes sous le plafond. Un succès efface le compte.
    echecsAdresseIp.ajoute(cleAdresseIp, maintenant())
    echecsAdresse.ajoute(cleAdresse, maintenant())
    if (examinateur) echecsExamen.ajoute(cleAdresse, maintenant())
    const r = examinateur
      ? await connecterExamen(req, adresse, corps.token)
      : await relayer(req, '/verify', { type: 'email', email: adresse, token: corps.token })
    if (r.statut >= 200 && r.statut < 300) {
      echecsAdresseIp.oublie(cleAdresseIp)
      echecsAdresse.oublie(cleAdresse)
      echecsExamen.oublie(cleAdresse)
    }
    await attendre(Math.max(0, debut + PLANCHER_VERIFICATION_MS - maintenant()))
    repondre(res, r.statut, r.corps, r.version)
  }

  /**
   * Code fixe juste : session ouverte par le mot de passe du compte d'examen.
   * Faux : le refus mot pour mot de GoTrue, sans l'appeler.
   */
  async function connecterExamen(req: Request, adresse: string, code: string): Promise<RelaiGotrue> {
    if (!examen || !memeCode(code, examen.code)) {
      return { statut: 403, corps: CODE_REFUSE, version: req.get('x-supabase-api-version') ?? null }
    }
    const captcha = prendreCaptchaExamen(req.ip ?? 'inconnue')
    const r = await relayer(req, '/token?grant_type=password', {
      email: adresse,
      password: examen.motDePasse,
      ...(captcha.captcha_token ? { gotrue_meta_security: captcha } : {}),
    })
    if (r.statut >= 200 && r.statut < 300) return r
    // CAPTCHA absent, expiré ou refusé : une erreur de saisie, que l'app sait dire.
    if (codeErreur(r.corps) === 'captcha_failed') return r
    // Le compte d'examen est mal réglé (mot de passe, compte absent) : à corriger côté serveur.
    journal.erreur('passerelle_examen_refuse', { statut: r.statut })
    return { statut: 502, corps: erreurGotrue(502, 'unexpected_failure', 'Connexion momentanément impossible.'), version: r.version }
  }

  const avecErreurs = (f: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response): void => {
      f(req, res).catch((erreur: unknown) => {
        journal.erreur('passerelle_erreur', { route: req.path, message: messageErreur(erreur) })
        if (!res.headersSent) repondre(res, 502, erreurGotrue(502, 'unexpected_failure', 'Connexion momentanément impossible.'), null)
      })
    }

  const routeur = express.Router()
  const corpsJson = express.json({ limit: '8kb' })
  routeur.post('/auth/v1/otp', corpsJson, avecErreurs(envoyerCode))
  routeur.post('/auth/v1/verify', corpsJson, avecErreurs(verifierCode))
  return routeur
}
