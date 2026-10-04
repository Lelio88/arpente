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
 *
 * Invariant : aucune valeur de secret n'est journalisée.
 */

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
  }
}
