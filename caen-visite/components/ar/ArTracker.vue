<script setup lang="ts">
defineProps<{
  isDetected: boolean
  isTracking: boolean
}>()
</script>

<template>
  <div class="ar-tracker">
    <!-- Phase de scan -->
    <div v-if="!isDetected && !isTracking" class="tracker-scanning">
      <div class="scan-reticle">
        <div class="reticle-corner tl" />
        <div class="reticle-corner tr" />
        <div class="reticle-corner bl" />
        <div class="reticle-corner br" />
      </div>
      <p class="scan-text">Visez la meurtriere...</p>
    </div>

    <!-- Detection perdue pendant le trace -->
    <div v-if="!isDetected && isTracking" class="tracker-lost">
      <p class="lost-text">Meurtriere perdue, recentrez</p>
    </div>

    <!-- Cible detectee -->
    <div v-if="isDetected && !isTracking" class="tracker-detected">
      <p class="detected-text">Detectee ! Posez le doigt sur le cercle</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.ar-tracker {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 40;
}

.tracker-scanning {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.scan-reticle {
  position: relative;
  width: 200px;
  height: 280px;
  animation: pulse-reticle 2s ease-in-out infinite;
}

.reticle-corner {
  position: absolute;
  width: 30px;
  height: 30px;
  border-color: rgba(255, 255, 255, 0.7);
  border-style: solid;
  border-width: 0;

  &.tl {
    top: 0;
    left: 0;
    border-top-width: 3px;
    border-left-width: 3px;
  }

  &.tr {
    top: 0;
    right: 0;
    border-top-width: 3px;
    border-right-width: 3px;
  }

  &.bl {
    bottom: 0;
    left: 0;
    border-bottom-width: 3px;
    border-left-width: 3px;
  }

  &.br {
    bottom: 0;
    right: 0;
    border-bottom-width: 3px;
    border-right-width: 3px;
  }
}

.scan-text,
.lost-text,
.detected-text {
  position: absolute;
  bottom: 15%;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: 20px;
  font-size: $font-size-sm;
  font-weight: 600;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}

.scan-text {
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.8);
  animation: fade-pulse 2s ease-in-out infinite;
}

.lost-text {
  background: rgba(233, 69, 96, 0.8);
  color: white;
  animation: shake 0.5s ease-in-out;
}

.detected-text {
  background: rgba(0, 255, 170, 0.8);
  color: #1a1a2e;
}

@keyframes pulse-reticle {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.03); }
}

@keyframes fade-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

@keyframes shake {
  0%, 100% { transform: translateX(-50%); }
  25% { transform: translateX(calc(-50% - 5px)); }
  75% { transform: translateX(calc(-50% + 5px)); }
}
</style>
