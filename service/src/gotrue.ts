/**
 * GoTrue, vu du service : juger le jeton de session que la page d'accord
 * vient d'obtenir en se connectant.
 *
 * Choix non évidents :
 * - **GoTrue juge le jeton** (`GET /user` sur le réseau interne) : signature,
 *   expiration, session encore vivante. Le service ne détient pas la clé de
 *   GoTrue et n'en a pas besoin.
 * - **La fraîcheur vient du jeton lui-même** : une fois GoTrue d'accord, on
 *   lit son claim `amr` (méthodes de connexion et leurs dates). La page
 *   d'accord exige une connexion faite APRÈS la demande d'autorisation —
 *   sinon un jeton d'app volé (une heure de vie) deviendrait un accès
 *   d'assistant de 90 jours.
 *
 * Invariant : une panne de GoTrue est une erreur (500 sans détail), jamais un
 * accord.
 */

export interface Personne {
  id: string
  email: string
  anonyme: boolean
  /** Date (secondes) de la connexion la plus récente portée par le jeton. */
  connecteLe: number
}

export type JugeJeton = (jeton: string) => Promise<Personne | null>

interface ReponseUser {
  id?: unknown
  email?: unknown
  is_anonymous?: unknown
  email_confirmed_at?: unknown
}

function chargeUtile(jeton: string): Record<string, unknown> | null {
  const morceau = jeton.split('.')[1]
  if (!morceau) return null
  try {
    return JSON.parse(Buffer.from(morceau, 'base64url').toString('utf8')) as Record<string, unknown>
  }
  catch {
    return null
  }
}

/** Date de la connexion la plus récente que porte le claim `amr`. */
export function derniereConnexion(jeton: string): number {
  const amr = chargeUtile(jeton)?.amr
  if (!Array.isArray(amr)) return 0
  return Math.max(0, ...amr
    .map(m => Number((m as { timestamp?: unknown }).timestamp))
    .filter(Number.isFinite))
}

export function jugeGotrue(urlGotrue: string): JugeJeton {
  return async (jeton) => {
    if (!jeton || jeton.length > 8192) return null
    const reponse = await fetch(`${urlGotrue}/user`, {
      headers: { authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (reponse.status === 401 || reponse.status === 403 || reponse.status === 404) return null
    if (!reponse.ok) throw new Error(`gotrue /user : ${reponse.status}`)
    const u = await reponse.json() as ReponseUser
    if (typeof u.id !== 'string') return null
    return {
      id: u.id,
      email: typeof u.email === 'string' ? u.email : '',
      anonyme: u.is_anonymous === true || typeof u.email !== 'string' || !u.email_confirmed_at,
      connecteLe: derniereConnexion(jeton),
    }
  }
}
