<script setup lang="ts">
import { useRouteStore } from '~/stores/route'

defineProps<{
  nextPoiName: string | null
  distance: string | null
  duration: string | null
  isLoadingRoute: boolean
}>()

const emit = defineEmits<{
  toggleChecklist: []
  stop: []
}>()

const routeStore = useRouteStore()

// Vibration de celebration quand le parcours est termine
watch(
  () => routeStore.allVisited,
  (completed) => {
    if (completed) {
      navigator.vibrate?.([100, 50, 100, 50, 200])
    }
  },
)
</script>

<template>
  <div v-if="routeStore.isNavigating" class="route-tracker">
    <div class="tracker-content">
      <div class="tracker-info">
        <div class="tracker-route-name">{{ routeStore.activeRoute?.title }}</div>
        <div class="tracker-progress">
          <span class="progress-count">{{ routeStore.visitedCount }}/{{ routeStore.totalPois }}</span>
          <div class="progress-bar-mini">
            <div
              class="progress-fill-mini"
              :style="{ width: routeStore.totalPois ? `${(routeStore.visitedCount / routeStore.totalPois) * 100}%` : '0%' }"
            />
          </div>
        </div>
      </div>

      <div v-if="nextPoiName && !routeStore.allVisited" class="tracker-destination">
        <span class="tracker-arrow">→</span>
        <span class="tracker-poi-name">{{ nextPoiName }}</span>
        <span v-if="distance && !isLoadingRoute" class="tracker-distance">{{ distance }}</span>
        <span v-if="duration && !isLoadingRoute" class="tracker-duration">{{ duration }}</span>
        <span v-if="isLoadingRoute" class="tracker-loading">...</span>
      </div>

      <div v-if="routeStore.allVisited" class="tracker-complete">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#00ffaa" style="vertical-align: middle; margin-right: 4px;">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        Parcours termine !
      </div>
    </div>

    <div class="tracker-actions">
      <button class="tracker-btn tracker-btn-list" @click="emit('toggleChecklist')">
        <span>☰</span>
      </button>
      <button class="tracker-btn tracker-btn-stop" @click="emit('stop')">
        <span>✕</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.route-tracker {
  position: fixed;
  bottom: 68px;
  left: $spacing-sm;
  right: $spacing-sm;
  background: rgba(30, 30, 48, 0.92);
  backdrop-filter: blur(12px);
  border-radius: $radius-md;
  padding: $spacing-sm $spacing-md;
  z-index: $z-bottom-sheet;
  display: flex;
  align-items: center;
  gap: $spacing-md;
  box-shadow: 0 -2px 16px rgba(0, 0, 0, 0.3);
}

.tracker-content {
  flex: 1;
  min-width: 0;
}

.tracker-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $spacing-xs;
}

.tracker-route-name {
  font-size: $font-size-sm;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tracker-progress {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  flex-shrink: 0;
}

.progress-count {
  font-size: $font-size-xs;
  color: $color-text-muted;
  font-weight: 600;
}

.progress-bar-mini {
  width: 40px;
  height: 3px;
  background: $color-surface-elevated;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill-mini {
  height: 100%;
  background: $color-success;
  border-radius: 2px;
  transition: width $transition-normal;
}

.tracker-destination {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.tracker-arrow {
  color: $color-highlight;
  font-weight: 700;
}

.tracker-poi-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.tracker-distance {
  color: $color-text;
  font-weight: 600;
}

.tracker-duration {
  color: $color-text-muted;
}

.tracker-loading {
  color: $color-text-muted;
}

.tracker-complete {
  font-size: $font-size-sm;
  color: $color-success;
  font-weight: 600;
  animation: celebrate 0.5s ease;
}

@keyframes celebrate {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}

.tracker-actions {
  display: flex;
  gap: $spacing-xs;
  flex-shrink: 0;
}

.tracker-btn {
  width: 36px;
  height: 36px;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-size-md;
}

.tracker-btn-list {
  background: $color-surface-elevated;
}

.tracker-btn-stop {
  background: rgba(233, 69, 96, 0.2);
  color: $color-highlight;
}
</style>
