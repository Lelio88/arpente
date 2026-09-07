<script setup lang="ts">
const visible = ref(true)

onMounted(() => {
  setTimeout(() => {
    visible.value = false
  }, 1500)
})
</script>

<template>
  <Transition name="splash-fade">
    <div v-if="visible" class="splash">
      <div class="splash-content">
        <div class="splash-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="#00ffaa">
            <path d="M12 2L2 12h3v8h14v-8h3L12 2zm0 3.5L18 11h-1.5v7h-9v-7H6L12 5.5z"/>
          </svg>
        </div>
        <h1 class="splash-title">Arpente</h1>
        <p class="splash-subtitle">Decouvrez la ville autrement</p>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.splash {
  position: fixed;
  inset: 0;
  background: $color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.splash-content {
  text-align: center;
}

.splash-icon {
  margin-bottom: $spacing-lg;
  animation: bounce-in 0.6s ease both;
}

.splash-title {
  font-size: $font-size-2xl;
  font-weight: 700;
  color: $color-text;
  margin-bottom: $spacing-xs;
  animation: bounce-in 0.6s ease 0.1s both;
}

.splash-subtitle {
  font-size: $font-size-sm;
  color: $color-text-muted;
  animation: bounce-in 0.6s ease 0.2s both;
}

.splash-fade-leave-active {
  transition: opacity 0.4s ease;
}

.splash-fade-leave-to {
  opacity: 0;
}

@keyframes bounce-in {
  0% { opacity: 0; transform: scale(0.8) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
