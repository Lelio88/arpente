<script setup lang="ts">
import type { Puzzle } from '~/types'

defineProps<{
  puzzle: Puzzle
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <div class="puzzle-success">
    <div class="success-card">
      <div class="success-icon">✓</div>
      <h2 class="success-title">Resolu !</h2>
      <p class="success-message">{{ puzzle.successMessage }}</p>
      <div v-if="puzzle.reward" class="success-reward">
        <p class="reward-text">{{ puzzle.reward.text }}</p>
      </div>
      <button class="success-button" @click="$emit('close')">
        Continuer
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.puzzle-success {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: $z-modal;
  padding: $spacing-xl;
  animation: fadeIn 0.3s ease;
}

.success-card {
  background: $color-surface;
  border-radius: $radius-lg;
  padding: $spacing-2xl;
  text-align: center;
  max-width: 320px;
  width: 100%;
}

.success-icon {
  width: 64px;
  height: 64px;
  border-radius: $radius-full;
  background: $color-success;
  color: $color-primary;
  font-size: $font-size-2xl;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto $spacing-lg;
  animation: pop 0.4s ease 0.2s both;
}

.success-title {
  font-size: $font-size-xl;
  font-weight: 700;
  margin-bottom: $spacing-md;
}

.success-message {
  font-size: $font-size-sm;
  color: $color-text-muted;
  line-height: 1.6;
  margin-bottom: $spacing-lg;
}

.success-reward {
  background: $color-surface-elevated;
  border-radius: $radius-md;
  padding: $spacing-md;
  margin-bottom: $spacing-lg;
}

.reward-text {
  font-size: $font-size-sm;
  font-style: italic;
  line-height: 1.5;
}

.success-button {
  width: 100%;
  padding: $spacing-sm $spacing-lg;
  background: $color-success;
  color: $color-primary;
  border-radius: $radius-sm;
  font-weight: 700;
  font-size: $font-size-md;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pop {
  0% { transform: scale(0); }
  70% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
</style>
