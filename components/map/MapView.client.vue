<script setup lang="ts">
import { leafletLayer } from 'protomaps-leaflet'
import type { Poi, Coordinates, City } from '~/types'
import type L from 'leaflet'
import { loadCityBasemap } from '~/composables/useBasemap'

const props = withDefaults(
  defineProps<{
    pois: Poi[]
    userPosition: Coordinates | null
    center: Coordinates
    city: City
    zoom?: number
    activeRouteCoords?: Coordinates[]
    activeRouteColor?: string
    navigationRoute?: Coordinates[]
  }>(),
  {
    zoom: 15,
  },
)

const emit = defineEmits<{
  poiClick: [poi: Poi]
}>()

function recenter() {
  if (!map || !props.userPosition) return
  map.flyTo([props.userPosition.lat, props.userPosition.lng], 16, { duration: 0.8 })
}

defineExpose({ recenter })

const mapContainer = ref<HTMLDivElement>()
const basemapError = ref(false)
let leaflet: typeof L
let map: L.Map | null = null
let basemapLayer: ReturnType<typeof leafletLayer> | null = null
// Ville dont le fond est en cours de montage : une bascule de ville pendant le
// telechargement doit annuler le montage precedent, sinon la carte finirait sur
// le fond de la ville qu'on vient de quitter.
let mountingCity: City | null = null
let userMarker: L.CircleMarker | null = null
let routePolyline: L.Polyline | null = null
let navigationPolyline: L.Polyline | null = null
const markers = new Map<string, L.Marker>()

const categoryColors: Record<string, string> = {
  monument: '#e94560',
  eglise: '#c77dff',
  ww2: '#577590',
  architecture: '#f4a261',
  gastronomie: '#2a9d8f',
  romantique: '#ff6b9d',
  musee: '#4895ef',
}

const categoryIcons: Record<string, string> = {
  monument: '<path d="M12 2L2 12h3v8h14v-8h3L12 2zm0 3.5L18 11h-1.5v7h-9v-7H6L12 5.5z"/>',
  eglise: '<path d="M11 2v3H8v2h3v3H8l4 4 4-4h-3V7h3V5h-3V2h-2zm-7 12v6h16v-6H4z"/>',
  ww2: '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/>',
  architecture: '<path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm2-4h2v-2H5v2zm4 0h2v-2H9v2zm4 0h2v-2h-2v2zm4 0h2v-2h-2v2zM3 9h18V7H3v2zm0-4h18V3H3v2z"/>',
  gastronomie: '<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>',
  romantique: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
  musee: '<path d="M21 17H3v-1h18v1zm-2-7v6H5v-6H3v8h18v-8h-2zm-3-3h-2v6h2V7zm-4 0h-2v6h2V7zm-4 0H6v6h2V7zM4 5h16V3H4v2z"/>',
}

function createPoiIcon(category: string) {
  const color = categoryColors[category] || '#ffffff'
  const iconPath = categoryIcons[category] || categoryIcons.monument!
  return leaflet.divIcon({
    className: 'poi-marker',
    html: `<div style="
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
    "><svg viewBox="0 0 24 24" width="16" height="16" fill="white">${iconPath}</svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

/**
 * Monte le fond de carte vectoriel de la ville et retire le precedent.
 *
 * `protomaps-leaflet` etend `L.GridLayer` en lisant la variable globale `L` sans
 * jamais importer Leaflet. C'est l'import UMD de Leaflet fait plus haut qui la pose
 * sur `window` : il doit donc rester avant tout appel a `leafletLayer`.
 */
async function mountBasemap(city: City) {
  if (!map) return

  mountingCity = city
  basemapError.value = false

  try {
    const archive = await loadCityBasemap(city)
    if (!map || mountingCity !== city) return

    basemapLayer?.remove()
    basemapLayer = leafletLayer({
      url: archive,
      flavor: 'light',
      lang: 'fr',
      // Les donnees s'arretent au zoom 15 : au-dela, le rendu vectoriel sur-zoome
      // sans perte de nettete, ce qui couvre le zoom 19 autorise par la carte.
      maxDataZoom: 15,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; '
        + '<a href="https://protomaps.com">Protomaps</a>',
    })
    basemapLayer.addTo(map)
  } catch (error: unknown) {
    // Le fond manque (archive non generee, ou premiere visite hors ligne). Les
    // marqueurs et le trace restent utilisables : on le signale sans casser la vue.
    basemapError.value = true
    console.error('Fond de carte indisponible :', error)
  }
}

async function initMap() {
  await nextTick()
  if (!mapContainer.value) return

  leaflet = await import('leaflet')
  const L = leaflet

  map = L.map(mapContainer.value, {
    center: [props.center.lat, props.center.lng],
    zoom: props.zoom,
    minZoom: 13,
    maxZoom: 19,
    zoomControl: false,
    attributionControl: true,
  })

  await mountBasemap(props.city)

  renderPoiMarkers()
}

function renderPoiMarkers() {
  if (!map || !leaflet) return

  for (const marker of markers.values()) {
    marker.remove()
  }
  markers.clear()

  for (const poi of props.pois) {
    const marker = leaflet.marker([poi.lat, poi.lng], {
      icon: createPoiIcon(poi.category),
    }).addTo(map)

    marker.on('click', () => emit('poiClick', poi))
    markers.set(poi.slug, marker)
  }
}

// Recharger les marqueurs quand la liste de POI change (changement de ville)
watch(
  () => props.pois,
  () => renderPoiMarkers(),
)

// Recentrer la carte quand le centre change (changement de ville)
watch(
  () => props.center,
  (center) => {
    if (!map) return
    map.setView([center.lat, center.lng], props.zoom)
  },
)

// Basculer sur le fond de l'autre ville : chaque ville a sa propre archive PMTiles,
// il n'existe pas de fond couvrant les deux.
watch(
  () => props.city,
  (city) => mountBasemap(city),
)

// Mettre a jour la position utilisateur
watch(
  () => props.userPosition,
  (pos) => {
    if (!map || !pos || !leaflet) return

    if (!userMarker) {
      userMarker = leaflet.circleMarker([pos.lat, pos.lng], {
        radius: 8,
        color: '#4285f4',
        fillColor: '#4285f4',
        fillOpacity: 1,
        weight: 3,
        className: 'user-marker',
      }).addTo(map)
    } else {
      userMarker.setLatLng([pos.lat, pos.lng])
    }
  },
)

// Mettre a jour le trace du parcours
watch(
  () => props.activeRouteCoords,
  async (coords) => {
    if (!map || !leaflet) return

    if (routePolyline) {
      routePolyline.remove()
      routePolyline = null
    }

    if (coords && coords.length > 1) {
      routePolyline = leaflet.polyline(
        coords.map((c) => [c.lat, c.lng] as [number, number]),
        {
          color: props.activeRouteColor || '#e94560',
          weight: 4,
          opacity: 0.8,
          dashArray: '10, 10',
        },
      ).addTo(map)

      map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] })
    }
  },
)

// Mettre a jour l'itineraire de navigation
watch(
  () => props.navigationRoute,
  (coords) => {
    if (!map || !leaflet) return

    if (navigationPolyline) {
      navigationPolyline.remove()
      navigationPolyline = null
    }

    if (coords && coords.length > 1) {
      navigationPolyline = leaflet.polyline(
        coords.map((c) => [c.lat, c.lng] as [number, number]),
        {
          color: '#4285f4',
          weight: 5,
          opacity: 0.9,
        },
      ).addTo(map)
    }
  },
)

onMounted(() => initMap())

onUnmounted(() => {
  mountingCity = null
  basemapLayer = null
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container" />
    <p v-if="basemapError" class="basemap-error" role="status">
      Fond de carte indisponible — les points et parcours restent affiches.
    </p>
    <button
      v-if="userPosition"
      class="recenter-btn"
      @click="recenter"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="#333">
        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
      </svg>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  flex: 1;
  display: flex;
}

.map-container {
  width: 100%;
  flex: 1;
  z-index: 1;
}

.basemap-error {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 10;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(26, 26, 46, 0.92);
  color: white;
  font-size: 0.8rem;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.recenter-btn {
  position: absolute;
  bottom: 80px;
  right: 12px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  cursor: pointer;

  &:active {
    transform: scale(0.92);
  }
}
</style>

<style lang="scss">
.user-marker {
  animation: pulse-ring 2s ease-out infinite;
}

@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.5);
  }
  100% {
    box-shadow: 0 0 0 20px rgba(66, 133, 244, 0);
  }
}
</style>
