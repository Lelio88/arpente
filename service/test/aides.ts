/**
 * Doubles et aides des tests du service : accès d'assistant et groupes en
 * mémoire (avec le cloisonnement de la RLS), GoTrue simulé, horloge
 * réglable, et l'application entière montée sur un port libre.
 */
import { randomUUID, createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { creerApp } from '../src/app'
import type { Config } from '../src/config'
import { Catalogue, compilerContenu, type Ville } from '../src/contenu'
import type { JugeJeton, Personne } from '../src/gotrue'
import type {
  DepotGroupes, DetailGroupe, ParcoursAEnregistrer, ResultatVote, ResumeGroupe,
} from '../src/mcp/groupes'
import type { Autorisation, DepotAutorisations, NouvelleAutorisation } from '../src/oauth/autorisations'
import { Signataire } from '../src/oauth/jetons'

const ici = dirname(fileURLToPath(import.meta.url))
let catalogueEnCache: Catalogue | null = null

export async function catalogue(): Promise<Catalogue> {
  catalogueEnCache ??= new Catalogue(await compilerContenu(join(ici, '..', '..', 'content')))
  return catalogueEnCache
}

export class Horloge {
  constructor(public ms = Date.UTC(2026, 9, 5, 10, 0, 0)) {}
  maintenant = (): number => this.ms
  avancer(secondes: number): void { this.ms += secondes * 1000 }
}

export class AutorisationsMemoire implements DepotAutorisations {
  readonly lignes = new Map<string, Autorisation>()

  constructor(private readonly horloge: Horloge) {}

  async remplacer(n: NouvelleAutorisation): Promise<Autorisation> {
    for (const [id, a] of this.lignes) {
      if (a.userId === n.userId && a.cleClient === n.cleClient) this.lignes.delete(id)
    }
    const a: Autorisation = { id: randomUUID(), ...n, creeLe: new Date(this.horloge.ms), generation: 0 }
    this.lignes.set(a.id, a)
    return a
  }

  async lire(id: string): Promise<Autorisation | null> { return this.lignes.get(id) ?? null }

  async tourner(id: string, attendue: number): Promise<boolean> {
    const a = this.lignes.get(id)
    if (!a || a.generation !== attendue) return false
    this.lignes.set(id, { ...a, generation: a.generation + 1 })
    return true
  }

  async supprimer(id: string): Promise<void> { this.lignes.delete(id) }
  async noterUsage(): Promise<void> {}
}

interface Groupe {
  id: string
  nom: string
  ville: Ville
  statut: 'voting' | 'decided'
  membres: Map<string, string>
  votes: Set<string>
  envies: Map<string, { nombre: number | null, duree: number | null }>
  parcours: ParcoursAEnregistrer[]
}

/** Les groupes en mémoire, cloisonnés comme par la RLS : un non-membre ne voit rien. */
export class GroupesMemoire implements DepotGroupes {
  readonly groupes = new Map<string, Groupe>()

  creer(nom: string, ville: Ville, membres: Record<string, string>): string {
    const id = randomUUID()
    this.groupes.set(id, {
      id, nom, ville, statut: 'voting', membres: new Map(Object.entries(membres)),
      votes: new Set(), envies: new Map(), parcours: [],
    })
    return id
  }

  approuver(groupeId: string, userId: string, slug: string): void {
    this.groupes.get(groupeId)!.votes.add(`${userId}|${slug}`)
  }

  private membre(userId: string, groupeId: string): Groupe {
    const g = this.groupes.get(groupeId)
    if (!g || !g.membres.has(userId)) throw new Error('new row violates row-level security policy')
    return g
  }

  private resume(g: Groupe): ResumeGroupe {
    return { id: g.id, nom: g.nom, ville: g.ville, statut: g.statut, membres: g.membres.size }
  }

  async mesGroupes(userId: string): Promise<ResumeGroupe[]> {
    return [...this.groupes.values()].filter(g => g.membres.has(userId)).map(g => this.resume(g))
  }

  async detail(userId: string, groupeId: string): Promise<DetailGroupe | null> {
    const g = this.groupes.get(groupeId)
    if (!g || !g.membres.has(userId)) return null
    const approbations: Record<string, string[]> = {}
    for (const v of g.votes) {
      const [u, slug] = v.split('|') as [string, string]
      ;(approbations[slug] ??= []).push(u)
    }
    const dernier = g.parcours.at(-1)
    return {
      ...this.resume(g),
      pseudos: [...g.membres].map(([id, pseudo]) => ({ id, pseudo, moi: id === userId })),
      approbations,
      envies: [...g.envies].map(([u, e]) => ({ userId: u, ...e })),
      coches: [],
      parcoursArrete: dernier
        ? { etapes: dernier.etapes, distanceMetres: dernier.distanceMetres, dureeSecondes: dernier.dureeSecondes, arreteLe: '2026-10-05T10:00:00.000Z', par: userId }
        : null,
    }
  }

  async voter(userId: string, groupeId: string, slug: string): Promise<ResultatVote> {
    const g = this.membre(userId, groupeId)
    const cle = `${userId}|${slug}`
    if (g.votes.has(cle)) return 'deja'
    g.votes.add(cle)
    return 'fait'
  }

  async retirer(userId: string, groupeId: string, slug: string): Promise<ResultatVote> {
    return this.membre(userId, groupeId).votes.delete(`${userId}|${slug}`) ? 'fait' : 'deja'
  }

  async regler(userId: string, groupeId: string, nombre: number | null, duree: number | null) {
    const g = this.membre(userId, groupeId)
    const avant = g.envies.get(userId) ?? { nombre: null, duree: null }
    const apres = { nombre: nombre ?? avant.nombre, duree: duree ?? avant.duree }
    g.envies.set(userId, apres)
    return apres
  }

  async arreter(userId: string, groupeId: string, _ville: Ville, p: ParcoursAEnregistrer): Promise<void> {
    const g = this.membre(userId, groupeId)
    g.parcours.push(p)
    g.statut = 'decided'
  }
}

/** GoTrue simulé : jeton → personne. */
export function jugeSimule(personnes: Record<string, Personne>): JugeJeton {
  return async jeton => personnes[jeton] ?? null
}

export const SECRET = 'secret-de-test-assez-long-pour-deriver-une-cle-0123456789'

export interface Banc {
  url: string
  horloge: Horloge
  autorisations: AutorisationsMemoire
  groupes: GroupesMemoire
  personnes: Record<string, Personne>
  fermer: () => Promise<void>
}

export async function monterBanc(options: { urlGotrue?: string, oauthActif?: boolean } = {}): Promise<Banc> {
  const horloge = new Horloge()
  const autorisations = new AutorisationsMemoire(horloge)
  const groupes = new GroupesMemoire()
  const personnes: Record<string, Personne> = {}
  const urlPublique = 'http://localhost'
  const config: Config = {
    port: 0,
    hote: '127.0.0.1',
    urlPublique,
    urlRessource: `${urlPublique}/mcp`,
    urlBase: 'postgres://inutile',
    urlGotrue: options.urlGotrue ?? 'http://127.0.0.1:9',
    secretAssistant: SECRET,
    cleTurnstile: '',
    clientGoogle: '',
    urlDocumentation: 'https://arpente.heianenterprise.com/assistant.html',
    oauthActif: options.oauthActif ?? true,
  }
  const app = creerApp({
    config,
    catalogue: await catalogue(),
    signataire: new Signataire(SECRET, urlPublique, config.urlRessource, horloge.maintenant),
    autorisations,
    groupes,
    juge: jugeSimule(personnes),
    lireJson: async () => { throw new Error('hors ligne') },
    maintenant: horloge.maintenant,
  })
  const serveur = app.listen(0, '127.0.0.1')
  await new Promise(r => serveur.once('listening', r))
  const { port } = serveur.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    horloge,
    autorisations,
    groupes,
    personnes,
    fermer: () => new Promise(r => serveur.close(() => r())),
  }
}

export function pkce(): { verificateur: string, defi: string } {
  const verificateur = randomUUID() + randomUUID()
  return { verificateur, defi: createHash('sha256').update(verificateur).digest('base64url') }
}

export const RETOUR_CLAUDE = 'https://claude.ai/api/mcp/auth_callback'

/** Inscrit un assistant, obtient l'accord de `jetonSession`, échange le code. */
export async function brancherAssistant(banc: Banc, jetonSession: string): Promise<{
  clientId: string, acces: string, rafraichissement: string, autorisationId: string
}> {
  const inscription = await fetch(`${banc.url}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: 'none' }),
  })
  const { client_id: clientId } = await inscription.json() as { client_id: string }
  const { verificateur, defi } = pkce()
  const autorisation = await fetch(`${banc.url}/oauth/authorize?${new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: RETOUR_CLAUDE, code_challenge: defi,
    code_challenge_method: 'S256', state: 'etat-1', scope: 'arpente', resource: `${'http://localhost'}/mcp`,
  })}`, { redirect: 'manual' })
  const demande = new URL(autorisation.headers.get('location')!, banc.url).searchParams.get('demande')!
  banc.horloge.avancer(30)
  banc.personnes[jetonSession]!.connecteLe = Math.floor(banc.horloge.ms / 1000)
  const accord = await fetch(`${banc.url}/oauth/accord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jetonSession}` },
    body: JSON.stringify({ demande, decision: 'autoriser' }),
  })
  const { redirection } = await accord.json() as { redirection: string }
  const code = new URL(redirection).searchParams.get('code')!
  const jeton = await fetch(`${banc.url}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verificateur, client_id: clientId, redirect_uri: RETOUR_CLAUDE }),
  })
  const corps = await jeton.json() as { access_token: string, refresh_token: string }
  const autorisationId = [...banc.autorisations.lignes.keys()].at(-1)!
  return { clientId, acces: corps.access_token, rafraichissement: corps.refresh_token, autorisationId }
}

let identifiantRpc = 0

/** Un appel JSON-RPC à /mcp (mode sans session). */
export async function appelMcp(banc: Banc, jeton: string | null, methode: string, params: unknown = {}) {
  const entetes: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
  }
  if (jeton) entetes.authorization = `Bearer ${jeton}`
  const reponse = await fetch(`${banc.url}/mcp`, {
    method: 'POST',
    headers: entetes,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++identifiantRpc, method: methode, params }),
  })
  const texte = await reponse.text()
  // Les clients de 2025 reçoivent un flux SSE d'un seul message (repli sans
  // session du SDK) ; le protocole 2026 répond en JSON.
  const donnees = reponse.headers.get('content-type')?.includes('text/event-stream')
    ? texte.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
    : texte
  let corps: any = null
  try { corps = JSON.parse(donnees) }
  catch { corps = texte }
  return { statut: reponse.status, entetes: reponse.headers, corps }
}

/** Appelle un outil et rend son texte (JSON décodé si possible) et son drapeau d'erreur. */
export async function outil(banc: Banc, jeton: string, nom: string, args: unknown) {
  const r = await appelMcp(banc, jeton, 'tools/call', { name: nom, arguments: args })
  const texte: string = r.corps?.result?.content?.[0]?.text ?? ''
  let valeur: any = texte
  try { valeur = JSON.parse(texte) }
  catch { /* refus rédigé */ }
  return { erreur: r.corps?.result?.isError === true, valeur, texte, brut: r.corps }
}
