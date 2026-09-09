<script setup lang="ts">
import type { Poi, BottomSheetState } from '~/types'

const props = defineProps<{
  poi: Poi | null
}>()

const state = ref<BottomSheetState>('closed')
const startY = ref(0)
const currentY = ref(0)
const isDragging = ref(false)

const sheetHeights: Record<BottomSheetState, string> = {
  closed: '0px',
  peek: '80px',
  half: '40vh',
  full: '90vh',
}

const sheetStyle = computed(() => {
  if (isDragging.value) {
    return { height: `${currentY.value}px`, transition: 'none' }
  }
  return { height: sheetHeights[state.value] }
})

watch(
  () => props.poi,
  (newPoi) => {
    state.value = newPoi ? 'peek' : 'closed'
  },
)

function onTouchStart(e: TouchEvent) {
  isDragging.value = true
  if (!e.touches[0]) return
  startY.value = e.touches[0].clientY
  const el = e.currentTarget as HTMLElement
  currentY.value = el.offsetHeight
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value || !e.touches[0]) return
  const deltaY = startY.value - e.touches[0].clientY
  const newHeight = Math.max(0, currentY.value + deltaY)
  currentY.value = newHeight
  startY.value = e.touches[0].clientY
}

function onTouchEnd() {
  isDragging.value = false
  const vh = window.innerHeight

  if (currentY.value < 60) {
    state.value = 'closed'
  } else if (currentY.value < vh * 0.25) {
    state.value = 'peek'
  } else if (currentY.value < vh * 0.65) {
    state.value = 'half'
  } else {
    state.value = 'full'
  }
}

function expand() {
  if (state.value === 'peek') state.value = 'half'
  else if (state.value === 'half') state.value = 'full'
}

function collapse() {
  state.value = 'closed'
}
</script>

<template>
  <Transition name="sheet">
    <div
      v-if="poi"
      class="bottom-sheet"
      :style="sheetStyle"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div class="sheet-handle" @click="expand">
        <div class="handle-bar" />
      </div>

      <div class="sheet-content">
        <!-- Peek / Half -->
        <div class="sheet-header">
          <div class="sheet-header-text">
            <h2 class="sheet-title">{{ poi.title }}</h2>
            <span v-if="poi.epoch" class="sheet-epoch">{{ poi.epoch }}</span>
          </div>
          <button class="sheet-close" @click="collapse">✕</button>
        </div>

        <!-- Half+ -->
        <div v-if="state === 'half' || state === 'full'" class="sheet-body">
          <PoiImage
            :src="poi.image"
            :alt="poi.title"
            class="sheet-image"
          />
          <p v-if="poi.description" class="sheet-description">
            {{ poi.description }}
          </p>

          <NuxtLink :to="`/poi/${poi.slug}`" class="sheet-link">
            Visite complete →
          </NuxtLink>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.bottom-sheet {
  position: absolute;
  bottom: 60px; // au dessus de la navbar
  left: 0;
  right: 0;
  background: $color-surface;
  border-radius: $radius-lg $radius-lg 0 0;
  z-index: $z-bottom-sheet;
  overflow-y: auto;
  transition: height $transition-normal;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
}

.sheet-handle {
  display: flex;
  justify-content: center;
  padding: $spacing-sm 0;
  cursor: grab;
}

.handle-bar {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: $color-text-muted;
}

.sheet-content {
  padding: 0 $spacing-lg $spacing-lg;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.sheet-header-text {
  flex: 1;
}

.sheet-title {
  font-size: $font-size-lg;
  font-weight: 700;
  margin-bottom: $spacing-xs;
}

.sheet-epoch {
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.sheet-close {
  font-size: $font-size-lg;
  padding: $spacing-xs;
  opacity: 0.6;
}

.sheet-body {
  margin-top: $spacing-md;
}

.sheet-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: $radius-md;
  margin-bottom: $spacing-md;
}

.sheet-description {
  font-size: $font-size-md;
  line-height: 1.6;
  color: $color-text;
  margin-bottom: $spacing-lg;
}

.sheet-link {
  display: inline-block;
  padding: $spacing-sm $spacing-lg;
  background: $color-highlight;
  border-radius: $radius-sm;
  font-weight: 600;
  font-size: $font-size-sm;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: transform $transition-normal;
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
