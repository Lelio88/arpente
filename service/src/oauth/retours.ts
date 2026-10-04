/**
 * Adresses de retour des assistants IA reconnus : la liste blanche de l'OAuth.
 * Port de `redirects.go` de Lumis (même liste que LLMarmite et DeckHand).
 *
 * Un assistant qui s'inscrit (inscription dynamique, ouverte à tous) choisit
 * son nom et son adresse de retour. Le nom ne prouve rien ; l'adresse, si :
 * c'est là que le code d'autorisation est remis. On n'inscrit donc que les
 * clients dont TOUTES les adresses sont celles d'un assistant connu, et c'est
 * l'adresse vérifiée qui désigne l'assistant à l'utilisateur, jamais le nom
 * qu'il se donne.
 *
 * Choix non évidents :
 * - chemin compris, pas seulement le domaine : un domaine seul laisserait
 *   passer une redirection ouverte de ce domaine ;
 * - la boucle locale (localhost, 127.0.0.1, [::1], tout port, tout chemin)
 *   est admise : Claude Code, Cursor et VS Code écoutent sur la machine
 *   même, et un code remis là ne quitte pas l'ordinateur de l'utilisateur ;
 * - ChatGPT : `connector_platform_oauth_redirect` quand il voit `iss` dans la
 *   réponse d'autorisation (ce serveur l'y met), `connector/oauth/{id}` sinon —
 *   un seul segment simple, jamais un sous-chemin ni un caractère encodé.
 */

interface Reconnaisseur {
  nom: string
  correspond: (u: URL) => boolean
}

const BOUCLE_LOCALE = new Set(['localhost', '127.0.0.1', '[::1]'])
const CONNECTEUR_CHATGPT = /^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/

const RECONNUS: Reconnaisseur[] = [
  {
    nom: 'Claude (claude.ai, Claude Desktop, mobile)',
    correspond: u => u.protocol === 'https:' && (u.hostname === 'claude.ai' || u.hostname === 'claude.com')
      && u.port === '' && u.pathname === '/api/mcp/auth_callback',
  },
  {
    nom: 'ChatGPT',
    correspond: u => u.protocol === 'https:' && u.hostname === 'chatgpt.com' && u.port === ''
      && (u.pathname === '/connector_platform_oauth_redirect' || CONNECTEUR_CHATGPT.test(u.pathname)),
  },
  {
    nom: 'VS Code',
    correspond: u => u.protocol === 'https:' && u.hostname === 'vscode.dev' && u.port === ''
      && u.pathname === '/redirect',
  },
  {
    nom: 'Cursor',
    correspond: u => u.protocol === 'cursor:' && u.host === 'anysphere.cursor-mcp'
      && u.pathname === '/oauth/callback',
  },
  {
    nom: 'un outil installé sur cet ordinateur (Claude Code, Cursor, VS Code…)',
    correspond: u => u.protocol === 'http:' && BOUCLE_LOCALE.has(u.hostname),
  },
]

/** Le nom de l'assistant qui possède cette adresse de retour, ou `null`. */
export function reconnaitre(brute: string): string | null {
  let u: URL
  try {
    u = new URL(brute)
  }
  catch {
    return null
  }
  // « https://claude.ai@mechant.example/… », fragment, port hors bornes : jamais.
  if (u.username || u.password || u.hash || brute.includes('#')) return null
  return RECONNUS.find(r => r.correspond(u))?.nom ?? null
}

/** Ajoute des paramètres à une adresse de retour en gardant les siens. */
export function avecParametres(brute: string, parametres: Record<string, string | undefined>): string {
  const u = new URL(brute)
  for (const [cle, valeur] of Object.entries(parametres)) {
    if (valeur) u.searchParams.set(cle, valeur)
  }
  return u.toString()
}
