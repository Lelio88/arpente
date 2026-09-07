import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type {
  RealtimeChannel,
  RealtimePostgresDeletePayload,
  RealtimePostgresInsertPayload,
} from '@supabase/supabase-js'

/** Ligne de `visited_pois`, jointe au pseudo de qui a coche. */
interface LigneCochee {
  poi_slug: string
  user_id: string
  profiles?: { handle: string } | null
}
import type { City, DecidedRoute, RouteThematic } from '~/types'
import { useRouteStore } from '~/stores/route'

/**
 * Fait suivre au groupe le parcours qu'il a decide, avec une checklist partagee.
 *
 * **Ce store ne modifie pas `stores/route.ts`.** Le parcours solo sait deja
 * afficher un trace, guider vers l'etape suivante et cocher des lieux ; le
 * dupliquer pour le groupe aurait cree deux moteurs a maintenir. Une decision
 * est donc convertie en `RouteThematic` et passee a `startRoute()` — la carte,
 * la fleche de direction et la checklist fonctionnent sans une ligne de plus.
 *
 * Ce qui s'ajoute est la synchronisation : `visitedSlugs` du store solo devient
 * le reflet de la table `visited_pois`, dans les deux sens.
 *
 * **Le piege de la boucle.** Cocher localement declenche un envoi ; l'evenement
 * Realtime revient et re-applique le meme changement, qui declencherait un
 * nouvel envoi. `applicationDistante` coupe ce cycle : tant qu'il est leve, les
 * changements observes viennent du reseau et ne repartent pas.
 *
 * **`visited_pois` a une cle primaire `(group_id, poi_slug)`** — contrairement a
 * `poi_votes`, dont la cle est un uuid genere. Un DELETE transporte donc le slug
 * dans son identite de replique, et le decochage d'un autre membre s'applique
 * directement, sans rechargement.
 *
 * Invariant : `visited_pois.user_id` garde qui a coche en dernier, mais la ligne
 * est unique par lieu — deux membres ne cochent pas chacun de leur cote, ils
 * cochent la meme case.
 */

const CLE_REPRISE = 'arpente-groupe-suivi'

export const useGroupRouteStore = defineStore('groupRoute', () => {
  const groupIdSuivi = ref<string | null>(null)
  /** poiSlug -> pseudo du membre qui a coche, pour l'affichage de la checklist. */
  const auteurs = ref<Record<string, string>>({})
  const isLive = ref(false)

  let canal: RealtimeChannel | null = null
  let applicationDistante = false
  let arreterSurveillance: (() => void) | null = null

  const suitUnGroupe = computed(() => groupIdSuivi.value !== null)

  /**
   * Traduit une decision en parcours affichable. Le slug prefixe `groupe-`
   * evite toute collision avec un parcours thematique du contenu, y compris
   * dans les cles localStorage du store solo.
   */
  function versParcours(decision: DecidedRoute, nomDuGroupe: string): RouteThematic {
    const km = decision.distanceMeters !== null
      ? `${(decision.distanceMeters / 1000).toFixed(1)} km`
      : ''
    const minutes = decision.durationSeconds !== null
      ? `${Math.round(decision.durationSeconds / 60)} min`
      : (decision.targetDurationMinutes !== null ? `${Math.round(decision.targetDurationMinutes)} min` : '')

    return {
      title: nomDuGroupe,
      slug: `groupe-${decision.groupId}`,
      city: decision.city as City,
      description: 'Parcours decide par le groupe',
      duration: minutes,
      distance: km,
      difficulty: 'facile',
      color: '#00ffaa',
      pois: decision.poiSlugs.map(slug => ({ slug })),
    }
  }

  async function chargerCoches(groupId: string): Promise<void> {
    const supabase = useSupabase()
    const routeStore = useRouteStore()

    const { data, error } = await supabase
      .from('visited_pois')
      .select('poi_slug, user_id, profiles(handle)')
      .eq('group_id', groupId)

    if (error) throw error

    const lignes = (data ?? []) as unknown as LigneCochee[]
    const slugs = lignes.map(l => l.poi_slug)
    auteurs.value = Object.fromEntries(
      lignes.map(l => [l.poi_slug, l.profiles?.handle ?? '?']))

    // Ecrasement direct de l'etat solo : c'est la base qui fait autorite pour un
    // parcours de groupe, pas le localStorage de cet appareil.
    applicationDistante = true
    routeStore.visitedSlugs = slugs
    applicationDistante = false
  }

  /** Demarre le suivi : parcours affiche, checklist chargee, flux ouvert. */
  async function suivre(decision: DecidedRoute, nomDuGroupe: string): Promise<void> {
    const routeStore = useRouteStore()

    routeStore.startRoute(versParcours(decision, nomDuGroupe))
    groupIdSuivi.value = decision.groupId
    memoriser(decision.groupId)

    await chargerCoches(decision.groupId)
    ouvrirFlux(decision.groupId)
    surveillerLocal()
  }

  /**
   * Observe la checklist du store solo et propage les changements locaux.
   * On compare les listes plutot que d'intercepter le clic : le store solo
   * expose `toggleVisited`, appele depuis plusieurs composants, et l'envelopper
   * reviendrait a le modifier.
   */
  function surveillerLocal(): void {
    if (arreterSurveillance) arreterSurveillance()
    const routeStore = useRouteStore()
    let precedent = [...routeStore.visitedSlugs]

    arreterSurveillance = watch(() => [...routeStore.visitedSlugs], (courant) => {
      if (applicationDistante || !groupIdSuivi.value) {
        precedent = [...courant]
        return
      }
      const ajoutes = courant.filter(s => !precedent.includes(s))
      const retires = precedent.filter(s => !courant.includes(s))
      precedent = [...courant]

      for (const slug of ajoutes) void cocherDistant(slug)
      for (const slug of retires) void decocherDistant(slug)
    }, { deep: true })
  }

  async function cocherDistant(poiSlug: string): Promise<void> {
    const supabase = useSupabase()
    const groupId = groupIdSuivi.value
    if (!groupId) return

    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) return

    // ignoreDuplicates, et surtout PAS merge-duplicates : ce dernier produit un
    // ON CONFLICT DO UPDATE, qui exige une policy UPDATE — or `visited_pois`
    // n'en a pas (select, insert et delete seulement), et le second membre a
    // cocher recevrait un 403 silencieux.
    //
    // DO NOTHING dit d'ailleurs mieux l'intention : cocher un lieu deja coche
    // ne change rien, et celui qui l'a coche en premier reste credite.
    await supabase.from('visited_pois')
      .upsert({ group_id: groupId, poi_slug: poiSlug, user_id: userId },
        { onConflict: 'group_id,poi_slug', ignoreDuplicates: true })
  }

  async function decocherDistant(poiSlug: string): Promise<void> {
    const supabase = useSupabase()
    const groupId = groupIdSuivi.value
    if (!groupId) return
    await supabase.from('visited_pois').delete()
      .eq('group_id', groupId).eq('poi_slug', poiSlug)
  }

  function ouvrirFlux(groupId: string): void {
    fermerFlux()
    const supabase = useSupabase()
    const routeStore = useRouteStore()

    canal = supabase
      .channel(`checklist-${groupId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visited_pois', filter: `group_id=eq.${groupId}` },
        (charge: RealtimePostgresInsertPayload<LigneCochee>) => {
          applicationDistante = true
          if (!routeStore.visitedSlugs.includes(charge.new.poi_slug)) {
            routeStore.visitedSlugs.push(charge.new.poi_slug)
          }
          applicationDistante = false
          void rafraichirAuteur(charge.new.poi_slug, charge.new.user_id)
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'visited_pois', filter: `group_id=eq.${groupId}` },
        (charge: RealtimePostgresDeletePayload<LigneCochee>) => {
          // La cle primaire porte le slug : il est present dans `old`, sans
          // qu'il faille REPLICA IDENTITY FULL ni rechargement.
          const slug = charge.old?.poi_slug
          if (!slug) return
          applicationDistante = true
          const i = routeStore.visitedSlugs.indexOf(slug)
          if (i >= 0) routeStore.visitedSlugs.splice(i, 1)
          applicationDistante = false
          const { [slug]: _retire, ...reste } = auteurs.value
          auteurs.value = reste
        })
      .subscribe((statut: string) => { isLive.value = statut === 'SUBSCRIBED' })
  }

  async function rafraichirAuteur(poiSlug: string, userId: string): Promise<void> {
    const supabase = useSupabase()
    const { data } = await supabase.from('profiles').select('handle').eq('id', userId).maybeSingle()
    auteurs.value = { ...auteurs.value, [poiSlug]: data?.handle ?? '?' }
  }

  function fermerFlux(): void {
    if (!canal) return
    const supabase = useSupabase()
    void supabase.removeChannel(canal)
    canal = null
    isLive.value = false
  }

  /** Arrete le suivi de groupe sans toucher au parcours solo en cours. */
  function arreter(): void {
    fermerFlux()
    if (arreterSurveillance) {
      arreterSurveillance()
      arreterSurveillance = null
    }
    groupIdSuivi.value = null
    auteurs.value = {}
    oublier()
  }

  function memoriser(groupId: string): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CLE_REPRISE, groupId)
  }

  function oublier(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(CLE_REPRISE)
  }

  /** Identifiant du groupe suivi avant un rechargement, s'il y en a un. */
  function groupeAReprendre(): string | null {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(CLE_REPRISE)
  }

  return {
    groupIdSuivi,
    auteurs,
    isLive,
    suitUnGroupe,
    versParcours,
    suivre,
    arreter,
    groupeAReprendre,
  }
})
