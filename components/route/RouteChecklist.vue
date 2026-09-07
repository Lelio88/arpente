<script setup lang="ts">
import { useRouteStore } from '~/stores/route'
import type { Poi } from '~/types'

const props = defineProps<{
  pois: Poi[]
  /**
   * poiSlug -> pseudo du membre qui a coche. Fourni uniquement quand la carte
   * suit un parcours de groupe ; absent, la checklist reste celle d'une visite
   * solo et rien ne change a l'affichage.
   */
  auteurs?: Record<string, string>
}>()

const emit = defineEmits<{
  close: []
}>()

const routeStore = useRouteStore()
</script>

<template>
  <div class="checklist-overlay" @click.self="emit('close')">
    <div class="checklist-panel">
      <div class="checklist-header">
        <h3>{{ routeStore.activeRoute?.title }}</h3>
        <span class="checklist-progress">{{ routeStore.visitedCount }}/{{ routeStore.totalPois }}</span>
        <button class="checklist-close" @click="emit('close')">✕</button>
      </div>

      <div class="checklist-items">
        <div
          v-for="(poiEntry, index) in routeStore.activeRoute?.pois || []"
          :key="poiEntry.slug"
          class="checklist-item"
          :class="{
            visited: routeStore.isVisited(poiEntry.slug),
            current: poiEntry.slug === routeStore.nextUnvisitedSlug,
          }"
          @click="routeStore.toggleVisited(poiEntry.slug)"
        >
          <div class="item-checkbox">
            <div class="checkbox" :class="{ checked: routeStore.isVisited(poiEntry.slug) }">
              <span v-if="routeStore.isVisited(poiEntry.slug)">✓</span>
              <span v-else>{{ index + 1 }}</span>
            </div>
          </div>
          <div class="item-info">
            <span class="item-name" :class="{ strikethrough: routeStore.isVisited(poiEntry.slug) }">
              {{ pois.find(p => p.slug === poiEntry.slug)?.title || poiEntry.slug }}
            </span>
            <span v-if="props.auteurs?.[poiEntry.slug]" class="item-auteur">
              coche par {{ props.auteurs[poiEntry.slug] }}
            </span>
            <span v-if="poiEntry.note" class="item-note">{{ poiEntry.note }}</span>
          </div>
          <div v-if="poiEntry.slug === routeStore.nextUnvisitedSlug" class="item-badge">
            Prochain
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.checklist-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: $z-modal;
  display: flex;
  align-items: flex-end;
}

.checklist-panel {
  width: 100%;
  max-height: 70vh;
  background: $color-surface;
  border-radius: $radius-lg $radius-lg 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.checklist-header {
  display: flex;
  align-items: center;
  padding: $spacing-lg;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  h3 {
    flex: 1;
    font-size: $font-size-md;
    font-weight: 700;
  }
}

.checklist-progress {
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-right: $spacing-md;
  font-weight: 600;
}

.checklist-close {
  font-size: $font-size-lg;
  opacity: 0.6;
  padding: $spacing-xs;
}

.checklist-items {
  overflow-y: auto;
  padding: $spacing-sm 0;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md $spacing-lg;
  cursor: pointer;
  transition: background $transition-fast;

  &:active {
    background: rgba(255, 255, 255, 0.03);
  }

  &.visited {
    opacity: 0.5;
  }

  &.current {
    background: rgba(233, 69, 96, 0.08);
    border-left: 3px solid $color-highlight;
  }
}

.item-checkbox {
  flex-shrink: 0;
}

.checkbox {
  width: 32px;
  height: 32px;
  border-radius: $radius-full;
  border: 2px solid $color-text-muted;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text-muted;
  transition: all $transition-fast;

  &.checked {
    background: $color-success;
    border-color: $color-success;
    color: $color-primary;
  }
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  display: block;
  font-size: $font-size-sm;
  font-weight: 500;

  &.strikethrough {
    text-decoration: line-through;
    color: $color-text-muted;
  }
}

.item-note {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  font-style: italic;
  margin-top: 2px;
}

.item-badge {
  flex-shrink: 0;
  font-size: $font-size-xs;
  padding: 2px $spacing-sm;
  background: $color-highlight;
  border-radius: $radius-sm;
  font-weight: 600;
  color: white;
}
.item-auteur {
  display: block;
  font-size: 0.7rem;
  color: $color-text-muted;
}
</style>
