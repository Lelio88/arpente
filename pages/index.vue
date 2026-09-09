<script setup lang="ts">
import type { Poi, Coordinates } from '~/types'
import { useGeolocation } from '~/composables/useGeolocation'
import { useProximity } from '~/composables/useProximity'
import { useRouting } from '~/composables/useRouting'
import { useRouteStore } from '~/stores/route'
import { useCityStore } from '~/stores/city'
import { useGroupRouteStore } from '~/stores/groupRoute'
import { useDecisionStore } from '~/stores/decision'
import { useGroupStore } from '~/stores/group'

const { position } = useGeolocation()
const routeStore = useRouteStore()
const cityStore = useCityStore()
const groupRouteStore = useGroupRouteStore()

// Charger les POI depuis Nuxt Content
const { data: poisRaw } = await useAsyncData('pois', () =>
  queryCollection('pois').all(),
)

const pois = computed<Poi[]>(() =>
  (poisRaw.value || [])
    .filter((doc: any) => doc.meta?.city === cityStore.currentCity)
    .map((doc: any) => ({
      title: doc.title,
      slug: slugFromStem(doc.stem),
      city: doc.meta?.city,
      category: doc.meta?.category,
      lat: doc.meta?.lat,
      lng: doc.meta?.lng,
      epoch: doc.meta?.epoch,
      builder: doc.meta?.builder,
      image: doc.meta?.image,
      tags: doc.meta?.tags || [],
      proximityRadius: doc.meta?.proximityRadius || 50,
      description: doc.description,
    })),
)

const { nearbyPoi } = useProximity(position, pois)

const selectedPoi = ref<Poi | null>(null)
const showChecklist = ref(false)

// Arreter le parcours actif en cours si on change de ville
watch(
  () => cityStore.currentCity,
  () => {
    if (routeStore.isNavigating) routeStore.stopRoute()
    // Le suivi de groupe s'arrete avec lui : garder le flux ouvert sur un
    // parcours qui n'est plus affiche laisserait la checklist se synchroniser
    // dans le vide.
    if (groupRouteStore.suitUnGroupe) groupRouteStore.arreter()
    selectedPoi.value = null
    showChecklist.value = false
  },
)

// Reprise du parcours de groupe apres un rechargement : le store solo ne
// persiste pas le parcours actif, or une visite se fait ecran eteint, app
// relancee. Seul l'identifiant du groupe est memorise, la decision est
// rechargee depuis la base pour ne jamais afficher un parcours perime.
onMounted(async () => {
  const groupId = groupRouteStore.groupeAReprendre()
  if (!groupId || routeStore.isNavigating) return

  try {
    const decisionStore = useDecisionStore()
    const groupStore = useGroupStore()
    await decisionStore.load(groupId)
    if (!decisionStore.current) return

    const groupe = groupStore.myGroups.find(g => g.id === groupId)
    await groupRouteStore.suivre(decisionStore.current, groupe?.name ?? 'Parcours du groupe')
  }
  catch {
    // Supabase absent, hors ligne, ou groupe quitte : la carte doit rester
    // utilisable en solo quoi qu'il arrive.
    groupRouteStore.arreter()
  }
})

// Afficher le POI le plus proche ou celui selectionne
const activePoi = computed(() => selectedPoi.value || nearbyPoi.value)

// Coordonnees du parcours actif pour le trace sur la carte
const activeRouteCoords = computed<Coordinates[]>(() => {
  if (!routeStore.activeRoute) return []
  return routeStore.activeRoute.pois
    .map((entry) => pois.value.find((p) => p.slug === entry.slug))
    .filter((p): p is Poi => p !== undefined)
    .map((p) => ({ lat: p.lat, lng: p.lng }))
})

// Navigation vers le prochain POI non visite
const nextPoiDestination = computed<Coordinates | null>(() => {
  if (!routeStore.isNavigating || !routeStore.nextUnvisitedSlug) return null
  const poi = pois.value.find((p) => p.slug === routeStore.nextUnvisitedSlug)
  if (!poi) return null
  return { lat: poi.lat, lng: poi.lng }
})

const nextPoiName = computed<string | null>(() => {
  if (!routeStore.nextUnvisitedSlug) return null
  return pois.value.find((p) => p.slug === routeStore.nextUnvisitedSlug)?.title ?? null
})

const { route: navigationResult, isLoading: isLoadingRoute, formatDistance, formatDuration } = useRouting(position, nextPoiDestination)

const navigationRoute = computed<Coordinates[]>(() => navigationResult.value?.coordinates ?? [])

const navigationDistance = computed<string | null>(() =>
  navigationResult.value ? formatDistance(navigationResult.value.distance) : null,
)

const navigationDuration = computed<string | null>(() =>
  navigationResult.value ? formatDuration(navigationResult.value.duration) : null,
)

function onPoiClick(poi: Poi) {
  selectedPoi.value = poi
}

function stopRoute() {
  routeStore.stopRoute()
  if (groupRouteStore.suitUnGroupe) groupRouteStore.arreter()
  showChecklist.value = false
}
</script>

<template>
  <div class="page-map">
    <MapView
      :pois="pois"
      :user-position="position"
      :center="cityStore.currentCityConfig.center"
      :city="cityStore.currentCity"
      :zoom="cityStore.currentCityConfig.zoom"
      :active-route-coords="activeRouteCoords"
      :active-route-color="routeStore.activeRoute?.color"
      :navigation-route="navigationRoute"
      @poi-click="onPoiClick"
    />

    <DirectionArrow
      :user-position="position"
      :destination="nextPoiDestination"
    />

    <RouteTracker
      :next-poi-name="nextPoiName"
      :distance="navigationDistance"
      :duration="navigationDuration"
      :is-loading-route="isLoadingRoute"
      @toggle-checklist="showChecklist = !showChecklist"
      @stop="stopRoute"
    />

    <RouteChecklist
      v-if="showChecklist && routeStore.isNavigating"
      :pois="pois"
      :auteurs="groupRouteStore.suitUnGroupe ? groupRouteStore.auteurs : undefined"
      @close="showChecklist = false"
    />

    <BottomSheet :poi="activePoi" />
  </div>
</template>

<style lang="scss" scoped>
.page-map {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
}
</style>
