import type { Coordinates } from '~/types'
// Imports explicites, comme partout dans utils/ : ce fichier est aussi
// exécuté hors de Nuxt (verif/, et le service de l'assistant IA).
import { haversineDistance } from './geo'
import { aggregateGroupVotes, type AggregationResult } from './voteAggregation'

/**
 * Le cœur d'une décision de groupe, partagé par l'app (`stores/decision.ts`)
 * et par le service de l'assistant IA (`service/`) : les deux arrêtent un
 * parcours exactement de la même façon.
 *
 * Choix non évidents :
 *
 * - **Aucun accès réseau ici.** La mesure du trajet passe par une fonction
 *   `lireJson` fournie par l'appelant : l'app lui donne `fetch`, le service un
 *   `fetch` borné dans le temps, et `verif/decision.ts` une fausse réponse.
 *
 * - **Un vote sur un lieu inconnu est ignoré.** Seuls comptent les lieux dont
 *   on connaît la position — ceux de la ville du groupe. Sans ce filtre,
 *   l'ordonnancement chercherait la distance vers un point qui n'existe pas.
 *
 * - **La distance vient d'OSRM quand il répond, de la somme des haversines
 *   sinon**, d'où `isEstimated` : une approximation ne s'affiche jamais comme
 *   une mesure.
 *
 * Invariant : `preparerDecision` refuse (`aucun_poi_approuve`) un groupe sans
 * lieu approuvé. Enregistrer un parcours vide laisserait le groupe en statut
 * « decided » sans rien à suivre.
 *
 *   const projet = preparerDecision(approbations, envies, coordonnees)
 *   const trajet = await mesurerTrajet(projet.orderedSlugs.map(s => coordonnees[s]!), lireJson)
 */

/** OSRM public : au-delà, l'URL devient déraisonnable et le service refuse. */
export const MAX_POINTS_OSRM = 25

export const OSRM_URL = 'https://router.project-osrm.org/route/v1/foot'

export interface EnviesMembre {
  poiCount: number | null
  durationMinutes: number | null
}

export interface Trajet {
  distanceMeters: number
  durationSeconds: number | null
  isEstimated: boolean
}

/** Rend le JSON d'une URL ; l'appelant choisit le transport et le délai. */
export type LireJson = (url: string) => Promise<unknown>

interface ReponseOsrm {
  code?: string
  routes?: { distance: number, duration: number }[]
}

/**
 * Choisit les lieux du parcours et leur ordre, à partir des approbations
 * (slug → membres) et des envies de chaque membre.
 */
export function preparerDecision(
  approbations: Record<string, string[]>,
  envies: EnviesMembre[],
  coordonnees: Record<string, Coordinates>,
): AggregationResult {
  const connues = Object.fromEntries(
    Object.entries(approbations).filter(([slug]) => coordonnees[slug] !== undefined))

  const resultat = aggregateGroupVotes({
    approvals: connues,
    poiCountPreferences: envies.map(e => e.poiCount).filter((n): n is number => n !== null),
    durationPreferences: envies.map(e => e.durationMinutes).filter((n): n is number => n !== null),
    poiCoordinates: coordonnees,
  })

  if (resultat.orderedSlugs.length === 0) {
    throw new Error('aucun_poi_approuve')
  }
  return resultat
}

/** Somme des distances à vol d'oiseau entre points successifs, en mètres. */
function aVolDOiseau(points: Coordinates[]): number {
  return Math.round(points.slice(1).reduce(
    (total, point, i) => total + haversineDistance(points[i]!, point), 0))
}

/**
 * Mesure le trajet piéton qui relie les points dans l'ordre. Rend une
 * estimation (`isEstimated: true`) quand OSRM ne répond pas, ou pas
 * correctement : la décision doit rester possible hors ligne.
 */
export async function mesurerTrajet(points: Coordinates[], lireJson: LireJson): Promise<Trajet> {
  const estimation: Trajet = {
    distanceMeters: aVolDOiseau(points),
    durationSeconds: null,
    isEstimated: true,
  }

  if (points.length < 2 || points.length > MAX_POINTS_OSRM) {
    return estimation
  }

  try {
    const trace = points.map(p => `${p.lng},${p.lat}`).join(';')
    const donnees = await lireJson(`${OSRM_URL}/${trace}?overview=false`) as ReponseOsrm
    const route = donnees?.routes?.[0]

    if (donnees?.code !== 'Ok' || !route
      || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      return estimation
    }

    return {
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      isEstimated: false,
    }
  }
  catch {
    // Hors ligne, ou OSRM indisponible : une distance approchée vaut mieux
    // qu'un groupe bloqué.
    return estimation
  }
}
