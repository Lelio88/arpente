<script setup lang="ts">
import type { RouteThematic } from '~/types'

defineProps<{
  route: RouteThematic
}>()
</script>

<template>
  <NuxtLink :to="`/routes/${route.slug}`" class="route-card">
    <div class="route-color" :style="{ background: route.color }" />
    <div class="route-info">
      <h3 class="route-title">{{ route.title }}</h3>
      <p class="route-description">{{ route.description }}</p>
      <div class="route-meta">
        <span>{{ route.distance }}</span>
        <span>{{ route.duration }}</span>
        <span>{{ route.difficulty }}</span>
      </div>
    </div>
  </NuxtLink>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.route-card {
  display: flex;
  gap: $spacing-md;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  transition: transform $transition-fast;

  &:active {
    transform: scale(0.98);
  }
}

.route-color {
  width: 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.route-info {
  flex: 1;
  min-width: 0;
}

.route-title {
  font-size: $font-size-md;
  font-weight: 700;
  margin-bottom: $spacing-xs;
}

.route-description {
  font-size: $font-size-sm;
  color: $color-text-muted;
  line-height: 1.4;
  margin-bottom: $spacing-sm;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.route-meta {
  display: flex;
  gap: $spacing-md;
  font-size: $font-size-xs;
  color: $color-text-muted;

  span {
    &::before {
      content: '·';
      margin-right: $spacing-xs;
    }

    &:first-child::before {
      content: none;
    }
  }
}
</style>
