<script setup lang="ts">
import type { RouteThematic, Poi } from '~/types'
import { useRouteStore } from '~/stores/route'

const params = useRoute().params
const routeStore = useRouteStore()

const { data: routeRaw } = await useAsyncData(`route-${params.slug}`, () =>
  queryCollection('routes').where('stem', '=', `routes/${params.slug}`).first(),
)

const { data: poisRaw } = await useAsyncData('pois-for-route', () =>
  queryCollection('pois').all(),
)

const route = computed<RouteThematic | null>(() => {
  if (!routeRaw.value) return null
  const doc = routeRaw.value as any
  return {
    title: doc.title || doc.meta?.title,
    slug: slugFromStem(doc.stem),
    description: doc.description || doc.meta?.description,
    duration: doc.meta?.duration,
    distance: doc.meta?.distance,
    difficulty: doc.meta?.difficulty,
    color: doc.meta?.color,
    pois: doc.meta?.pois || [],
  }
})

const routePois = computed<Poi[]>(() => {
  if (!route.value || !poisRaw.value) return []
  return route.value.pois
    .map((entry) => {
      const doc = poisRaw.value!.find((p: any) => slugFromStem(p.stem) === entry.slug) as any
      if (!doc) return null
      return {
        title: doc.title,
        slug: slugFromStem(doc.stem),
        category: doc.meta?.category,
        lat: doc.meta?.lat,
        lng: doc.meta?.lng,
        epoch: doc.meta?.epoch,
        tags: doc.meta?.tags || [],
        proximityRadius: doc.meta?.proximityRadius || 50,
        note: entry.note,
      } as Poi & { note?: string }
    })
    .filter((p): p is Poi & { note?: string } => p !== null)
})

const isActive = computed(() =>
  routeStore.activeRoute?.slug === route.value?.slug,
)

function startRoute() {
  if (route.value) {
    routeStore.startRoute(route.value)
    navigateTo('/')
  }
}

function stopRoute() {
  routeStore.stopRoute()
}
</script>

<template>
  <div class="page-route-detail safe-top">
    <template v-if="route">
      <header class="route-header">
        <NuxtLink to="/routes" class="back-link">← Retour</NuxtLink>
        <h1 :style="{ color: route.color }">
          {{ route.title }}
          <span v-if="isActive && routeStore.allVisited" class="badge-complete">Termine</span>
        </h1>
        <p class="route-description">{{ route.description }}</p>
        <div class="route-meta">
          <span>{{ route.distance }}</span>
          <span>{{ route.duration }}</span>
          <span>{{ route.difficulty }}</span>
        </div>
      </header>

      <!-- Checklist interactive si le parcours est actif -->
      <div v-if="isActive" class="route-pois">
        <h2>Progression</h2>
        <div class="route-progress-bar">
          <div
            class="route-progress-fill"
            :style="{ width: `${routeStore.totalPois ? (routeStore.visitedCount / routeStore.totalPois) * 100 : 0}%`, background: route.color }"
          />
        </div>
        <span class="route-progress-text">{{ routeStore.visitedCount }}/{{ routeStore.totalPois }} etapes</span>

        <div
          v-for="(poi, index) in routePois"
          :key="poi.slug"
          class="route-poi-item clickable"
          :class="{
            visited: routeStore.isVisited(poi.slug),
            current: poi.slug === routeStore.nextUnvisitedSlug,
          }"
          @click="routeStore.toggleVisited(poi.slug)"
        >
          <div
            class="poi-number"
            :style="{ background: routeStore.isVisited(poi.slug) ? '#2ecc71' : route.color }"
          >
            <span v-if="routeStore.isVisited(poi.slug)">&#10003;</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <div class="poi-info">
            <h3 :class="{ strikethrough: routeStore.isVisited(poi.slug) }">{{ poi.title }}</h3>
            <p v-if="(poi as any).note" class="poi-note">{{ (poi as any).note }}</p>
          </div>
          <span v-if="poi.slug === routeStore.nextUnvisitedSlug" class="next-badge">Prochain</span>
        </div>
      </div>

      <!-- Liste statique si le parcours n'est pas actif -->
      <div v-else class="route-pois">
        <h2>Etapes</h2>
        <div
          v-for="(poi, index) in routePois"
          :key="poi.slug"
          class="route-poi-item"
        >
          <div class="poi-number" :style="{ background: route.color }">
            {{ index + 1 }}
          </div>
          <div class="poi-info">
            <h3>{{ poi.title }}</h3>
            <p v-if="(poi as any).note" class="poi-note">{{ (poi as any).note }}</p>
          </div>
        </div>
      </div>

      <button v-if="!isActive" class="start-button" :style="{ background: route.color }" @click="startRoute">
        Demarrer le parcours
      </button>
      <div v-else class="active-route-actions">
        <button class="start-button" @click="navigateTo('/')">
          Voir sur la carte
        </button>
        <button class="stop-button" @click="stopRoute">
          Arreter le parcours
        </button>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-route-detail {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.back-link {
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
  display: inline-block;
}

.route-header {
  margin-bottom: $spacing-xl;

  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    margin-bottom: $spacing-sm;
  }
}

.route-description {
  color: $color-text-muted;
  line-height: 1.6;
  margin-bottom: $spacing-md;
}

.route-meta {
  display: flex;
  gap: $spacing-lg;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.route-pois {
  margin-bottom: $spacing-xl;

  h2 {
    font-size: $font-size-lg;
    font-weight: 600;
    margin-bottom: $spacing-md;
  }
}

.route-poi-item {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  padding: $spacing-md 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.poi-number {
  width: 28px;
  height: 28px;
  border-radius: $radius-full;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-size-sm;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.poi-info {
  h3 {
    font-size: $font-size-md;
    font-weight: 600;
    margin-bottom: $spacing-xs;
  }
}

.poi-note {
  font-size: $font-size-sm;
  color: $color-text-muted;
  font-style: italic;
}

.route-progress-bar {
  width: 100%;
  height: 6px;
  background: $color-surface-elevated;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: $spacing-xs;
}

.route-progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.route-progress-text {
  font-size: $font-size-sm;
  color: $color-text-muted;
  font-weight: 600;
  display: block;
  margin-bottom: $spacing-md;
}

.route-poi-item.clickable {
  cursor: pointer;
  transition: background 0.2s;

  &:active {
    background: rgba(255, 255, 255, 0.03);
  }

  &.visited {
    opacity: 0.5;
  }

  &.current {
    background: rgba(233, 69, 96, 0.08);
    border-left: 3px solid $color-highlight;
    padding-left: calc(#{$spacing-md} - 3px);
  }
}

.strikethrough {
  text-decoration: line-through;
  color: $color-text-muted;
}

.next-badge {
  flex-shrink: 0;
  font-size: $font-size-xs;
  padding: 2px $spacing-sm;
  background: $color-highlight;
  border-radius: $radius-sm;
  font-weight: 600;
  color: white;
}

.start-button {
  width: 100%;
  padding: $spacing-md;
  border-radius: $radius-md;
  font-size: $font-size-md;
  font-weight: 700;
  color: white;
  text-align: center;
}

.active-route-actions {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.stop-button {
  width: 100%;
  padding: $spacing-md;
  border-radius: $radius-md;
  font-size: $font-size-md;
  font-weight: 700;
  color: $color-highlight;
  background: rgba(233, 69, 96, 0.15);
  text-align: center;
}

.badge-complete {
  display: inline-block;
  font-size: $font-size-xs;
  padding: 2px $spacing-sm;
  background: $color-success;
  color: $color-primary;
  border-radius: $radius-sm;
  font-weight: 700;
  vertical-align: middle;
  margin-left: $spacing-sm;
}
</style>
