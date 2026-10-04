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
 *   code à 6 chiffres. Après 5 échecs pour une adresse, 15 minutes de pause.
 *
 * Choix non évidents :
 * - au-delà du délai, la réponse part sans attendre GoTrue, dont la requête
 *   continue détachée : le titulaire reçoit son code même si l'envoi SMTP est
 *   lent. Ces envois détachés sont plafonnés (`MAX_EN_COURS`) : au-delà, la
 *   réponse reste la même mais rien n'est relayé ;
 * - les adresses ne sont gardées en mémoire que sous forme d'empreinte ;
 * - `X-Forwarded-For`, posé par Caddy, est relayé tel quel : GoTrue limite par
 *   client d'après lui (`GOTRUE_RATE_LIMIT_HEADER`).
 *
 * Invariant : aucun corps (adresse, code, jeton) n'est journalisé.
 */
import { createHash } from 'node:crypto'
import express, { type Request, type Response, type Router } from 'express'
import { journal, messageErreur } from './journal'
import { Fenetre } from './limites'

export const DELAI_ENVOI_MS = 1_500
export const PLANCHER_VERIFICATION_MS = 300
const MAX_EN_COURS = 32
const DELAI_GOTRUE_MS = 30_000
const MAX_ECHECS = 5
const PAUSE_ECHECS_MS = 15 * 60 * 1000
const ADRESSE = /^[^\s@]{1,64}@[^\s@]{1,255}$/
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

function empreinte(adresse: string): string {
  return createHash('sha256').update(adresse.trim().toLowerCase()).digest('hex')
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

export function routeurPasserelle(urlGotrue: string, maintenant: () => number = () => Date.now()): Router {
  const echecs = new Fenetre(MAX_ECHECS, PAUSE_ECHECS_MS)
  let enCours = 0

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
    const adresse = typeof corps.email === 'string' ? corps.email : ''
    if (!ADRESSE.test(adresse) || 'phone' in corps) {
      repondre(res, 400, erreurGotrue(400, 'validation_failed', 'Adresse e-mail invalide.'), null)
      return
    }
    const version = req.get('x-supabase-api-version') ?? null
    const reponseUniforme = async (): Promise<void> => {
      await attendre(Math.max(0, debut + DELAI_ENVOI_MS - maintenant()))
      repondre(res, 200, '{}', version)
    }
    if (enCours >= MAX_EN_COURS) {
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
    const adresse = typeof corps.email === 'string' ? corps.email : ''
    const version = req.get('x-supabase-api-version') ?? null
    // Seul le code reçu par e-mail passe : ni lien, ni token_hash, ni téléphone.
    if (corps.type !== 'email' || !ADRESSE.test(adresse) || typeof corps.token !== 'string' || !CODE.test(corps.token)
      || 'token_hash' in corps || 'phone' in corps) {
      repondre(res, 400, erreurGotrue(400, 'validation_failed', 'Code à 6 chiffres attendu.'), null)
      return
    }
    const cle = empreinte(adresse)
    if (echecs.compte(cle, maintenant()) >= MAX_ECHECS) {
      repondre(res, 429, erreurGotrue(429, 'over_request_rate_limit',
        'Trop d\'essais pour cette adresse : réessaie dans quelques minutes.'), version)
      return
    }
    const r = await relayer(req, '/verify', { type: 'email', email: adresse, token: corps.token })
    if (r.statut >= 200 && r.statut < 300) echecs.oublie(cle)
    else if (r.statut !== 429) echecs.ajoute(cle, maintenant())
    await attendre(Math.max(0, debut + PLANCHER_VERIFICATION_MS - maintenant()))
    repondre(res, r.statut, r.corps, r.version)
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
