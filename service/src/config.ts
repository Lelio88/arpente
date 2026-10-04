/**
 * Configuration du service, lue une fois au démarrage dans l'environnement.
 *
 * Choix non évidents :
 * - **Échec au démarrage plutôt qu'à la première requête** : une variable
 *   manquante ou un secret trop court arrêtent le processus avec un message
 *   clair (sans jamais afficher la valeur).
 * - **`ASSISTANT_SECRET` est un secret à part**, jamais le `JWT_SECRET` de
 *   GoTrue : un conteneur compromis ne doit pas pouvoir forger de jetons
 *   Supabase, seulement des jetons d'assistant.
 * - **`OAUTH_ACTIF`** coupe les routes de l'assistant tant que la bascule des
 *   comptes n'a pas eu lieu : le service peut tourner (passerelle de
 *   connexion, suppression de compte) avant que l'assistant soit ouvert.
 * - **Compte d'examen** (`EXAMEN_*`, les trois ensemble ou aucun) : l'adresse
 *   que les examinateurs de Google Play saisissent, avec un code fixe, faute
 *   de pouvoir recevoir un e-mail. Voir la passerelle.
 *
 * Invariant : aucune valeur de secret n'est journalisée.
 */

/** Compte réservé à l'examen Google Play : un code fixe au lieu d'un e-mail. */
export interface CompteExamen {
  /** En minuscules, comme la passerelle normalise les adresses. */
  adresse: string
  /** Six chiffres, donnés à Google dans la Play Console. */
  code: string
  /** Mot de passe GoTrue du compte, connu du seul service. */
  motDePasse: string
}

export interface Config {
  port: number
  hote: string
  /** Adresse publique de l'API, sans barre finale : l'émetteur OAuth. */
  urlPublique: string
  /** Adresse de la ressource MCP : `${urlPublique}/mcp`, l'audience des jetons. */
  urlRessource: string
  /** Base de données, sous le rôle arpente_assistant. */
  urlBase: string
  /** GoTrue sur le réseau interne (http://auth:9999). */
  urlGotrue: string
  secretAssistant: string
  /** Clé publique du widget Turnstile ; vide en local sans captcha. */
  cleTurnstile: string
  /** Identifiant OAuth « Web » de Google ; vide = pas de bouton Google. */
  clientGoogle: string
  /** Page publique qui documente l'assistant. */
  urlDocumentation: string
  oauthActif: boolean
  examen: CompteExamen | null
}

const SECRET_MIN = 32

function requise(env: NodeJS.ProcessEnv, nom: string): string {
  const valeur = env[nom]?.trim()
  if (!valeur) throw new Error(`variable d'environnement manquante : ${nom}`)
  return valeur
}

function sansBarreFinale(url: string): string {
  return url.replace(/\/+$/, '')
}

function lireExamen(env: NodeJS.ProcessEnv): CompteExamen | null {
  const adresse = env.EXAMEN_ADRESSE?.trim().toLowerCase() ?? ''
  const code = env.EXAMEN_CODE?.trim() ?? ''
  const motDePasse = env.EXAMEN_MOT_DE_PASSE?.trim() ?? ''
  if (!adresse && !code && !motDePasse) return null
  if (!adresse.includes('@') || !/^\d{6}$/.test(code) || motDePasse.length < SECRET_MIN) {
    throw new Error(`compte d'examen incomplet : EXAMEN_ADRESSE, EXAMEN_CODE (6 chiffres) et EXAMEN_MOT_DE_PASSE (${SECRET_MIN} caractères au moins) vont ensemble`)
  }
  return { adresse, code, motDePasse }
}

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const urlPublique = sansBarreFinale(requise(env, 'PUBLIC_URL'))
  const parsee = new URL(urlPublique)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsee.hostname)
  if (parsee.protocol !== 'https:' && !local) {
    throw new Error('PUBLIC_URL doit être en https hors du poste de développement')
  }

  const secretAssistant = requise(env, 'ASSISTANT_SECRET')
  if (secretAssistant.length < SECRET_MIN) {
    throw new Error(`ASSISTANT_SECRET doit compter au moins ${SECRET_MIN} caractères`)
  }

  const port = Number(env.PORT ?? '3012')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT invalide')
  }

  return {
    port,
    hote: env.HOST?.trim() || '127.0.0.1',
    urlPublique,
    urlRessource: `${urlPublique}/mcp`,
    urlBase: requise(env, 'DATABASE_URL'),
    urlGotrue: sansBarreFinale(requise(env, 'GOTRUE_URL')),
    secretAssistant,
    cleTurnstile: env.TURNSTILE_SITE_KEY?.trim() ?? '',
    clientGoogle: env.GOOGLE_WEB_CLIENT_ID?.trim() ?? '',
    urlDocumentation: env.DOCUMENTATION_URL?.trim() || 'https://arpente.heianenterprise.com/assistant.html',
    oauthActif: env.OAUTH_ACTIF === 'true',
    examen: lireExamen(env),
  }
}
