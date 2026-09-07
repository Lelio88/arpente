<script setup lang="ts">
import type { RouteThematic } from '~/types'

const { data: routesRaw } = await useAsyncData('routes', () =>
  queryCollection('routes').all(),
)

const routes = computed<RouteThematic[]>(() =>
  (routesRaw.value || []).map((doc: any) => ({
    title: doc.title || doc.meta?.title,
    slug: slugFromStem(doc.stem),
    description: doc.description || doc.meta?.description,
    duration: doc.meta?.duration,
    distance: doc.meta?.distance,
    difficulty: doc.meta?.difficulty,
    color: doc.meta?.color,
    pois: doc.meta?.pois || [],
  })),
)
</script>

<template>
  <div class="page-routes safe-top">
    <header class="routes-header">
      <h1>Parcours</h1>
      <p>Decouvrez Caen a travers des itineraires thematiques</p>
    </header>

    <div class="routes-list">
      <RouteCard
        v-for="route in routes"
        :key="route.slug"
        :route="route"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-routes {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.routes-header {
  margin-bottom: $spacing-xl;

  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    margin-bottom: $spacing-xs;
  }

  p {
    color: $color-text-muted;
    font-size: $font-size-sm;
  }
}

.routes-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}
</style>
