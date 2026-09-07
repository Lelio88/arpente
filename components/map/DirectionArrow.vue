<script setup lang="ts">
import type { Coordinates } from '~/types'

const props = defineProps<{
  userPosition: Coordinates | null
  destination: Coordinates | null
}>()

const angle = computed(() => {
  if (!props.userPosition || !props.destination) return 0
  const dLng = props.destination.lng - props.userPosition.lng
  const dLat = props.destination.lat - props.userPosition.lat
  // Angle en degres, 0 = nord, sens horaire
  const rad = Math.atan2(dLng, dLat)
  return (rad * 180) / Math.PI
})

const isVisible = computed(() => props.userPosition && props.destination)
</script>

<template>
  <div v-if="isVisible" class="direction-arrow">
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      :style="{ transform: `rotate(${angle}deg)` }"
    >
      <path d="M12 2l-5 9h3v11h4V11h3z" fill="white" />
    </svg>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.direction-arrow {
  position: absolute;
  top: calc(env(safe-area-inset-top, 8px) + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: $z-ui;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(66, 133, 244, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(66, 133, 244, 0.4);

  svg {
    transition: transform 0.3s ease;
  }
}
</style>
