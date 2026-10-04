/**
 * Les groupes de visite tels que les outils les lisent et les écrivent : un
 * port, dont la base (`src/base/groupes.ts`) et les tests fournissent chacun
 * leur version.
 *
 * Invariant : chaque méthode agit AU NOM du membre (`userId`) et ne voit que
 * ce que la RLS lui montre — jamais au-delà, jamais au nom d'un autre.
 */
import type { Ville } from '../contenu'

export interface ResumeGroupe {
  id: string
  nom: string
  ville: Ville
  statut: 'voting' | 'decided'
  membres: number
}

export interface DetailGroupe extends ResumeGroupe {
  /** Pseudos des membres ; `moi` désigne l'utilisateur. */
  pseudos: { id: string, pseudo: string, moi: boolean }[]
  /** slug → ids des membres qui l'approuvent. */
  approbations: Record<string, string[]>
  envies: { userId: string, nombre: number | null, duree: number | null }[]
  coches: { slug: string, par: string | null }[]
  parcoursArrete: {
    etapes: string[]
    distanceMetres: number | null
    dureeSecondes: number | null
    arreteLe: string
    par: string | null
  } | null
}

export interface ParcoursAEnregistrer {
  etapes: string[]
  nombreVise: number
  dureeVisee: number | null
  distanceMetres: number
  dureeSecondes: number | null
}

export type ResultatVote = 'fait' | 'deja'

export interface DepotGroupes {
  mesGroupes(userId: string): Promise<ResumeGroupe[]>
  detail(userId: string, groupeId: string): Promise<DetailGroupe | null>
  voter(userId: string, groupeId: string, slug: string): Promise<ResultatVote>
  retirer(userId: string, groupeId: string, slug: string): Promise<ResultatVote>
  regler(userId: string, groupeId: string, nombre: number | null, duree: number | null)
    : Promise<{ nombre: number | null, duree: number | null }>
  /** Enregistre le parcours et passe le groupe en « decided », en une transaction. */
  arreter(userId: string, groupeId: string, ville: Ville, parcours: ParcoursAEnregistrer): Promise<void>
}
