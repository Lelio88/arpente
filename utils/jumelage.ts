/**
 * Jumelage d'un groupe Arpente avec un groupe d'une autre app du conteneur
 * (Agora, agendas partagés) : lire et construire les liens du protocole commun
 * (docs/liens-inter-apps.md du dépôt méta), et traduire un lien reçu par
 * l'app Android en route interne.
 *
 * Les deux apps ne se parlent pas : elles s'ouvrent l'une l'autre par des liens
 * préremplis, et la personne valide dans l'app d'arrivée.
 *
 * Choix non évidents :
 * - les paramètres voyagent dans le FRAGMENT : un code ouvre un groupe, et une
 *   requête finirait dans les journaux de GitHub Pages (qui sert nos pages de
 *   repli) quand l'app n'est pas installée ;
 * - un lien reçu n'est jamais gardé tel quel : seuls l'app (liste fermée) et un
 *   code validé par son format en sont tirés, et les adresses de l'autre app
 *   sont reconstruites depuis sa base fixe. Un lien forgé ne peut donc envoyer
 *   personne vers un autre site ;
 * - le nom proposé est du texte : caractères de contrôle et de mise en forme
 *   (dont l'inversion bidirectionnelle) retirés, 60 caractères au plus.
 *
 * Invariant : `lireLienJumelage` rend `null` pour tout lien à ne pas suivre —
 * jamais un lien à moitié valide.
 *
 * Fonctions pures, sans Vue ni Nuxt : vérifiées par verif/jumelage.ts.
 *
 * @example
 * const lien = lireLienJumelage(route.query)
 * if (lien?.type === 'demande') { … proposer de jumeler un groupe … }
 */

/** Les apps avec lesquelles un groupe peut se jumeler. */
export type AppJumelle = 'agora'

interface ConfigApp {
  /** Nom de l'app, une marque. */
  nom: string
  /** Code d'un groupe dans cette app. */
  formatCode: RegExp
  /** Adresse de jumelage : les paramètres suivent, en requête du fragment. */
  jumeler: string
  /** Adresse d'adhésion : le code suit. */
  rejoindre: string
}

const APPS: Record<AppJumelle, ConfigApp> = {
  agora: {
    nom: 'Agora',
    formatCode: /^[A-HJ-NP-Z2-9]{8}$/,
    // Agora route « par dièse » : son écran de jumelage est #/twin?…
    jumeler: 'https://agora.heianenterprise.com/#/twin?',
    rejoindre: 'https://agora.heianenterprise.com/#/join/',
  },
}

/** Le code d'un groupe Arpente (6 caractères, alphabet sans ambiguïté). */
export const FORMAT_CODE_ARPENTE = /^[A-HJ-NP-Z2-9]{6}$/
const FORMAT_ETAT = /^[A-Za-z0-9_-]{16,64}$/
const LONGUEUR_NOM = 60
/** Contrôle (Cc) et mise en forme (Cf : inversion bidirectionnelle, etc.). */
const CARACTERES_CACHES = /[\p{Cc}\p{Cf}]/gu

/** Domaine de nos pages, dont les liens ouvrent l'app (App Links). */
const DOMAINE = 'arpente.heianenterprise.com'

export function nomApp(app: AppJumelle): string {
  return APPS[app].nom
}

/** Une autre app propose de jumeler l'un de ses groupes avec un groupe Arpente. */
export interface DemandeJumelage {
  type: 'demande'
  app: AppJumelle
  /** Le code pour rejoindre le groupe de l'autre app. */
  code: string
  /** Le nom proposé ; `null` s'il n'en reste rien. */
  nom: string | null
  etat: string
}

/** L'autre app répond à un jumelage lancé depuis Arpente. */
export interface ReponseJumelage {
  type: 'reponse'
  app: AppJumelle
  code: string
  /** Le code Arpente envoyé dans la demande : il désigne le groupe. */
  pour: string
  etat: string
}

export type LienJumelage = DemandeJumelage | ReponseJumelage

type Parametres = Record<string, unknown>

function texte(parametres: Parametres, cle: string): string | null {
  const valeur = parametres[cle]
  return typeof valeur === 'string' ? valeur : null
}

function appJumelle(valeur: string | null): AppJumelle | null {
  return valeur !== null && Object.hasOwn(APPS, valeur) ? valeur as AppJumelle : null
}

/** Lit les paramètres d'un lien de jumelage ; `null` s'il ne faut pas le suivre. */
export function lireLienJumelage(parametres: Parametres): LienJumelage | null {
  const app = appJumelle(texte(parametres, 'de'))
  const code = texte(parametres, 'code')?.trim().toUpperCase() ?? null
  const etat = texte(parametres, 'etat')
  if (!app || !code || !APPS[app].formatCode.test(code) || !etat || !FORMAT_ETAT.test(etat)) {
    return null
  }
  const pour = texte(parametres, 'pour')
  if (pour !== null) {
    const pourMaj = pour.trim().toUpperCase()
    if (!FORMAT_CODE_ARPENTE.test(pourMaj)) return null
    return { type: 'reponse', app, code, pour: pourMaj, etat }
  }
  return { type: 'demande', app, code, nom: nettoyerNom(texte(parametres, 'nom')), etat }
}

/** Un nom de groupe reçu par lien, réduit à du texte lisible ; `null` s'il n'en reste rien. */
export function nettoyerNom(brut: string | null): string | null {
  if (brut === null) return null
  const propre = brut.replace(CARACTERES_CACHES, ' ').replace(/\s+/g, ' ').trim()
  if (!propre) return null
  const caracteres = Array.from(propre)
  return caracteres.length <= LONGUEUR_NOM
    ? propre
    : caracteres.slice(0, LONGUEUR_NOM).join('').trimEnd()
}

function fragment(parametres: Record<string, string>): string {
  return new URLSearchParams(parametres).toString()
}

/** La demande qu'Arpente envoie à `app` : rejoindre ce groupe avec `code`. */
export function lienDemande(app: AppJumelle, p: { code: string, nom: string, etat: string }): string {
  return APPS[app].jumeler + fragment({ de: 'arpente', code: p.code, nom: p.nom, etat: p.etat })
}

/** La réponse d'Arpente à une demande de `app` pour son groupe `pour`. */
export function lienReponse(app: AppJumelle, p: { code: string, pour: string, etat: string }): string {
  return APPS[app].jumeler + fragment({ de: 'arpente', code: p.code, pour: p.pour, etat: p.etat })
}

/** Rejoindre le groupe jumeau dans `app`. */
export function lienRejoindre(app: AppJumelle, code: string): string {
  return APPS[app].rejoindre + encodeURIComponent(code)
}

/**
 * Route interne d'un lien de nos pages ouvert dans l'app (App Link), ou `null`.
 * `jumeler.html#…` mène à l'écran de jumelage, `rejoindre.html#code=…` à
 * l'onglet Groupes, fenêtre « Rejoindre » ouverte. Les paramètres d'un
 * jumelage ne sont pas jugés ici : son écran les valide.
 */
export function routeDepuisLien(adresse: string): string | null {
  let url: URL
  try {
    url = new URL(adresse)
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== DOMAINE) return null
  const parametres = new URLSearchParams(url.hash.replace(/^#/, ''))
  if (url.pathname === '/jumeler.html') {
    const requete = parametres.toString()
    return requete ? `/groups/jumeler?${requete}` : '/groups/jumeler'
  }
  if (url.pathname === '/rejoindre.html') {
    const code = parametres.get('code')?.trim().toUpperCase() ?? ''
    return FORMAT_CODE_ARPENTE.test(code) ? `/groups?rejoindre=${code}` : '/groups'
  }
  return null
}

/** Un jeton neuf pour un jumelage lancé d'ici : 16 octets aléatoires, base64 URL. */
export function nouvelEtat(
  aleatoire: (taille: number) => Uint8Array = taille => crypto.getRandomValues(new Uint8Array(taille)),
): string {
  const octets = aleatoire(16)
  let binaire = ''
  for (const octet of octets) binaire += String.fromCharCode(octet)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── Demandes lancées depuis cet appareil ─────────────────────────────────

/** Une demande de jumelage partie d'ici, en attente de la réponse de l'autre app. */
export interface DemandeEnvoyee {
  app: AppJumelle
  groupId: string
  /** Le code Arpente envoyé : la réponse le rend dans `pour`. */
  code: string
  /** Horodatage d'envoi (ms) : une demande trop vieille ne vaut plus. */
  envoyeeLe: number
}

/** Une réponse vaut 24 h : au-delà, on relance le jumelage. */
export const DUREE_DEMANDE_MS = 24 * 60 * 60 * 1000

/**
 * La demande à laquelle répond `reponse` (même jeton, même app, même code, pas
 * périmée), ou `null`. Sans cette règle, un membre qui connaît le code du
 * groupe pourrait forger une réponse et faire rattacher un groupe à lui.
 */
export function demandeCorrespondante(
  demandes: Record<string, DemandeEnvoyee>,
  reponse: ReponseJumelage,
  maintenant: number,
): DemandeEnvoyee | null {
  const demande = Object.hasOwn(demandes, reponse.etat) ? demandes[reponse.etat] : undefined
  if (!demande) return null
  if (demande.app !== reponse.app || demande.code !== reponse.pour) return null
  if (maintenant - demande.envoyeeLe > DUREE_DEMANDE_MS) return null
  return demande
}
