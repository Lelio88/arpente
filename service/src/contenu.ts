/**
 * Le contenu éditorial d'Arpente (lieux et parcours) tel que le voit
 * l'assistant : compilé depuis `content/` au build de l'image
 * (`scripts/compiler-contenu.ts`), puis lu en mémoire.
 *
 * Choix non évidents :
 * - **Les mêmes fichiers que l'app**, pas une copie : le service est
 *   construit depuis le dépôt entier, et le contenu qu'il sert est celui de
 *   la version de l'app publiée au même moment.
 * - **La compilation échoue** sur un lieu sans ville connue ou sans
 *   coordonnées : un lieu mal formé ne doit pas arriver jusqu'à
 *   l'ordonnancement d'un parcours.
 * - **Suggestions par mots, sans accents** : une recherche « chateau caen »
 *   retrouve « Château de Caen » ; c'est ce que l'outil propose quand le slug
 *   donné n'existe pas — il ne choisit jamais à la place de l'utilisateur.
 *
 * Invariant : un slug est unique sur tout le projet, toutes villes confondues
 * (garde-fou n° 2 du dépôt).
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as lireYaml } from 'yaml'
import type { Coordinates } from '~/types'
import { slugFromStem } from '../../utils/slug'
import { normaliser } from './texte'

export const VILLES = ['caen', 'troyes'] as const
export type Ville = (typeof VILLES)[number]

export interface Lieu {
  slug: string
  titre: string
  ville: Ville
  categorie: string
  lat: number
  lng: number
  epoque?: string
  batisseur?: string
  tags: string[]
  description?: string
  /** Le texte de la fiche, en Markdown. */
  texte: string
}

export interface EtapeParcours {
  slug: string
  note?: string
}

export interface Parcours {
  slug: string
  titre: string
  ville: Ville
  description: string
  duree: string
  distance: string
  difficulte: string
  etapes: EtapeParcours[]
}

export interface Contenu {
  lieux: Lieu[]
  parcours: Parcours[]
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function estVille(valeur: unknown): valeur is Ville {
  return typeof valeur === 'string' && (VILLES as readonly string[]).includes(valeur)
}

function texteOuRien(valeur: unknown): string | undefined {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : undefined
}

/** Lit un lieu depuis le contenu d'un fichier `content/pois/<slug>.md`. */
export function lireLieu(slug: string, source: string): Lieu {
  const morceaux = FRONTMATTER.exec(source)
  if (!morceaux) throw new Error(`lieu ${slug} : en-tête absent`)
  const meta = lireYaml(morceaux[1] ?? '') as Record<string, unknown>
  const lat = Number(meta.lat)
  const lng = Number(meta.lng)
  if (!estVille(meta.city)) throw new Error(`lieu ${slug} : ville inconnue`)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`lieu ${slug} : coordonnées absentes`)
  return {
    slug,
    titre: texteOuRien(meta.title) ?? slug,
    ville: meta.city,
    categorie: texteOuRien(meta.category) ?? 'autre',
    lat,
    lng,
    epoque: texteOuRien(meta.epoch),
    batisseur: texteOuRien(meta.builder),
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [],
    description: texteOuRien(meta.description),
    texte: (morceaux[2] ?? '').trim(),
  }
}

/** Lit un parcours depuis le contenu d'un fichier `content/routes/<slug>.yaml`. */
export function lireParcours(slug: string, source: string): Parcours {
  const meta = lireYaml(source) as Record<string, unknown>
  if (!estVille(meta.city)) throw new Error(`parcours ${slug} : ville inconnue`)
  const etapes = Array.isArray(meta.pois) ? meta.pois : []
  return {
    slug,
    titre: texteOuRien(meta.title) ?? slug,
    ville: meta.city,
    description: texteOuRien(meta.description) ?? '',
    duree: texteOuRien(meta.duration) ?? '',
    distance: texteOuRien(meta.distance) ?? '',
    difficulte: texteOuRien(meta.difficulty) ?? '',
    etapes: etapes
      .map((e: unknown) => e as Record<string, unknown>)
      .filter(e => typeof e.slug === 'string')
      .map(e => ({ slug: e.slug as string, note: texteOuRien(e.note) })),
  }
}

/** Compile `content/` (racine du dépôt) en un seul objet. */
export async function compilerContenu(racineContenu: string): Promise<Contenu> {
  const dossierLieux = join(racineContenu, 'pois')
  const dossierParcours = join(racineContenu, 'routes')
  const fichiersLieux = (await readdir(dossierLieux)).filter(f => f.endsWith('.md')).sort()
  const fichiersParcours = (await readdir(dossierParcours)).filter(f => f.endsWith('.yaml')).sort()

  const lieux = await Promise.all(fichiersLieux.map(async f =>
    lireLieu(slugFromStem(`pois/${f.replace(/\.md$/, '')}`), await readFile(join(dossierLieux, f), 'utf8'))))
  const parcours = await Promise.all(fichiersParcours.map(async f =>
    lireParcours(f.replace(/\.yaml$/, ''), await readFile(join(dossierParcours, f), 'utf8'))))

  const slugs = new Set(lieux.map(l => l.slug))
  for (const p of parcours) {
    for (const e of p.etapes) {
      if (!slugs.has(e.slug)) throw new Error(`parcours ${p.slug} : étape inconnue ${e.slug}`)
    }
  }
  return { lieux, parcours }
}

/** Index de lecture du contenu, pour les outils. */
export class Catalogue {
  private readonly parSlug: Map<string, Lieu>

  constructor(readonly contenu: Contenu) {
    this.parSlug = new Map(contenu.lieux.map(l => [l.slug, l]))
  }

  lieu(slug: string): Lieu | undefined {
    return this.parSlug.get(slug)
  }

  lieuxDe(ville: Ville): Lieu[] {
    return this.contenu.lieux
      .filter(l => l.ville === ville)
      .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'))
  }

  parcoursDe(ville: Ville): Parcours[] {
    return this.contenu.parcours.filter(p => p.ville === ville)
  }

  coordonneesDe(ville: Ville): Record<string, Coordinates> {
    return Object.fromEntries(this.lieuxDe(ville).map(l => [l.slug, { lat: l.lat, lng: l.lng }]))
  }

  /**
   * Les lieux les plus proches d'une recherche ratée : ceux dont le titre ou
   * le slug partage le plus de mots avec elle. Rien n'est choisi à la place
   * de l'utilisateur.
   */
  suggestions(recherche: string, ville?: Ville, max = 5): Lieu[] {
    const mots = normaliser(recherche.replace(/-/g, ' ')).split(' ').filter(m => m.length > 1)
    if (mots.length === 0) return []
    return this.contenu.lieux
      .filter(l => !ville || l.ville === ville)
      .map(l => {
        const cible = normaliser(`${l.titre} ${l.slug.replace(/-/g, ' ')}`)
        return { l, score: mots.filter(m => cible.includes(m)).length }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score || a.l.titre.localeCompare(b.l.titre, 'fr'))
      .slice(0, max)
      .map(s => s.l)
  }
}

/** Charge le contenu compilé par `scripts/compiler-contenu.ts`. */
export async function chargerCatalogue(fichier: string): Promise<Catalogue> {
  return new Catalogue(JSON.parse(await readFile(fichier, 'utf8')) as Contenu)
}
