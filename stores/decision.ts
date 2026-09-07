import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { City, Coordinates, DecidedRoute } from '~/types'
import { aggregateGroupVotes } from '~/utils/voteAggregation'
import { haversineDistance } from '~/utils/geo'

/** Ligne brute de `decided_routes` : colonnes SQL, avant passage au domaine. */
interface LigneDecision {
  id: string
  group_id: string
  poi_slugs: string[] | null
  city: string
  target_poi_count: number
  target_duration_minutes: number | null
  distance_meters: number | string | null
  duration_seconds: number | string | null
  decided_at: string
  decided_by: string
}

/**
 * Transforme les votes d'un groupe en un parcours arrete, puis le conserve.
 *
 * Choix non evidents :
 *
 * - **La decision est un instantane, pas un etat calcule.** `decided_routes`
 *   garde la liste ordonnee telle qu'elle a ete arretee. Un vote qui arrive
 *   apres ne la modifie pas : le groupe part avec le parcours qu'il a valide,
 *   pas avec un itineraire qui bougerait sous ses pieds en cours de visite.
 *   Redecider ecrit une nouvelle ligne — l'historique reste lisible.
 *
 * - **N'importe quel membre peut decider.** C'est ce qu'autorise la policy
 *   `decided: members insert`, et c'est voulu : un groupe de deux personnes n'a
 *   pas besoin d'un chef. Le nom de l'auteur est conserve (`decided_by`), ce qui
 *   suffit a la transparence.
 *
 * - **La distance vient d'OSRM quand le reseau repond, de la somme des
 *   haversines sinon.** L'ecart est reel — a pied, en ville, le trajet fait
 *   couramment 30 % de plus que la ligne droite — d'ou `isEstimated`, pour ne
 *   jamais afficher une approximation comme une mesure.
 *
 * Invariant : `decide()` refuse un groupe sans aucun POI approuve. Enregistrer
 * un parcours vide bloquerait le groupe en statut `decided` sans rien a suivre.
 */

/** OSRM public : au-dela, l'URL devient deraisonnable et le service refuse. */
const MAX_POINTS_OSRM = 25

export const useDecisionStore = defineStore('decision', () => {
  const current = ref<DecidedRoute | null>(null)
  const isDeciding = ref(false)

  const hasDecision = computed(() => current.value !== null)

  function mapRow(row: LigneDecision): DecidedRoute {
    return {
      id: row.id,
      groupId: row.group_id,
      poiSlugs: row.poi_slugs ?? [],
      city: row.city as City,
      targetPoiCount: row.target_poi_count,
      targetDurationMinutes: row.target_duration_minutes,
      distanceMeters: row.distance_meters === null ? null : Number(row.distance_meters),
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      decidedAt: row.decided_at,
      decidedBy: row.decided_by,
    }
  }

  /** Charge la derniere decision du groupe, s'il y en a une. */
  async function load(groupId: string): Promise<void> {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('decided_routes')
      .select()
      .eq('group_id', groupId)
      .order('decided_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    current.value = data ? mapRow(data) : null
  }

  /**
   * Mesure le trajet pieton reliant les POI dans l'ordre.
   * Renvoie `isEstimated: true` quand OSRM n'a pas repondu et que la valeur
   * provient de la somme des distances a vol d'oiseau.
   */
  async function mesurerTrajet(points: Coordinates[]): Promise<{
    distanceMeters: number
    durationSeconds: number | null
    isEstimated: boolean
  }> {
    const aVolDOiseau = points.slice(1).reduce(
      (total, point, i) => total + haversineDistance(points[i]!, point), 0)

    if (points.length < 2 || points.length > MAX_POINTS_OSRM) {
      return { distanceMeters: Math.round(aVolDOiseau), durationSeconds: null, isEstimated: true }
    }

    try {
      const trace = points.map(p => `${p.lng},${p.lat}`).join(';')
      const reponse = await fetch(
        `https://router.project-osrm.org/route/v1/foot/${trace}?overview=false`)
      const donnees = await reponse.json()

      if (donnees.code !== 'Ok' || !donnees.routes?.[0]) {
        return { distanceMeters: Math.round(aVolDOiseau), durationSeconds: null, isEstimated: true }
      }

      return {
        distanceMeters: Math.round(donnees.routes[0].distance),
        durationSeconds: Math.round(donnees.routes[0].duration),
        isEstimated: false,
      }
    }
    catch {
      // Hors ligne, ou OSRM indisponible : la decision doit rester possible.
      // Une distance approchee vaut mieux qu'un groupe bloque.
      return { distanceMeters: Math.round(aVolDOiseau), durationSeconds: null, isEstimated: true }
    }
  }

  /**
   * Arrete le parcours a partir des votes, l'enregistre, et bascule le groupe
   * en `decided`.
   *
   * @param coordonnees slug -> position, pour l'ordonnancement et la mesure.
   */
  async function decide(
    groupId: string,
    userId: string,
    city: City,
    approvals: Record<string, string[]>,
    preferences: Record<string, { poiCount: number | null, durationMinutes: number | null }>,
    coordonnees: Record<string, Coordinates>,
  ): Promise<DecidedRoute> {
    const supabase = useSupabase()
    isDeciding.value = true

    try {
      const resultat = aggregateGroupVotes({
        approvals,
        poiCountPreferences: Object.values(preferences)
          .map(p => p.poiCount).filter((n): n is number => n !== null),
        durationPreferences: Object.values(preferences)
          .map(p => p.durationMinutes).filter((n): n is number => n !== null),
        poiCoordinates: coordonnees,
      })

      if (resultat.orderedSlugs.length === 0) {
        throw new Error('aucun_poi_approuve')
      }

      const trajet = await mesurerTrajet(
        resultat.orderedSlugs.map(slug => coordonnees[slug]!).filter(Boolean))

      const { data, error } = await supabase
        .from('decided_routes')
        .insert({
          group_id: groupId,
          poi_slugs: resultat.orderedSlugs,
          city,
          target_poi_count: resultat.targetPoiCount,
          target_duration_minutes: resultat.targetDurationMinutes,
          distance_meters: trajet.distanceMeters,
          duration_seconds: trajet.durationSeconds,
          decided_by: userId,
        })
        .select()
        .single()

      if (error) throw error

      // Le statut suit la decision, il ne la precede pas : un groupe passe en
      // « decided » seulement une fois la ligne ecrite, sinon un echec
      // d'insertion laisserait un groupe verrouille sans parcours.
      const { error: erreurStatut } = await supabase
        .from('groups').update({ status: 'decided' }).eq('id', groupId)
      if (erreurStatut) throw erreurStatut

      current.value = mapRow(data)
      return current.value
    }
    finally {
      isDeciding.value = false
    }
  }

  function reset(): void {
    current.value = null
  }

  return { current, isDeciding, hasDecision, load, decide, reset }
})
