<script setup lang="ts">
import type { Poi, Coordinates } from '~/types'
import { useGeolocation } from '~/composables/useGeolocation'
import { useProximity } from '~/composables/useProximity'
import { useRouting } from '~/composables/useRouting'
import { useRouteStore } from '~/stores/route'

const { position } = useGeolocation()
const routeStore = useRouteStore()

// Charger les POI depuis Nuxt Content
const { data: poisRaw } = await useAsyncData('pois', () =>
  queryCollection('pois').all(),
)

const pois = computed<Poi[]>(() =>
  (poisRaw.value || []).map((doc: any) => ({
    title: doc.title,
    slug: slugFromStem(doc.stem),
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
  showChecklist.value = false
}
</script>

<template>
  <div class="page-map">
    <MapView
      :pois="pois"
      :user-position="position"
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
