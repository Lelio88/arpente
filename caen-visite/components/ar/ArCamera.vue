<script setup lang="ts">
import { useCamera } from '~/composables/useCamera'

const videoRef = ref<HTMLVideoElement>()
const { error, isActive, start, stop } = useCamera()

onMounted(async () => {
  if (videoRef.value) {
    await start(videoRef.value)
  }
})

defineExpose({ videoRef })
</script>

<template>
  <div class="ar-camera">
    <video
      ref="videoRef"
      class="camera-feed"
      playsinline
      muted
    />
    <div v-if="error" class="camera-error">
      <p>{{ error }}</p>
      <button @click="videoRef && start(videoRef)">Reessayer</button>
    </div>
    <div v-if="!isActive && !error" class="camera-loading">
      Chargement de la camera...
    </div>
    <slot v-if="isActive" />
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.ar-camera {
  position: relative;
  width: 100%;
  height: 100%;
}

.camera-feed {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-error,
.camera-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  color: $color-text;
  gap: $spacing-md;

  button {
    padding: $spacing-sm $spacing-lg;
    background: $color-highlight;
    border-radius: $radius-sm;
    font-weight: 600;
  }
}
</style>
