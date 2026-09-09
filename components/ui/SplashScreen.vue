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
        <!-- Le monogramme de l'app, identique a l'icone du lanceur et a
             l'ecran de demarrage natif (drawable*/splash.png) : l'ouverture
             enchaine trois fois la meme marque, sans rupture. Une maison verte
             figurait ici avant que l'app ait une identite. -->
        <div class="splash-icon">
          <svg viewBox="0 0 512 512" width="64" height="64">
            <defs>
              <linearGradient id="splashCorail" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stop-color="#e94560" />
                <stop offset="1" stop-color="#ff9a6b" />
              </linearGradient>
            </defs>
            <path
              d="M 168 382 L 256 148 L 344 382" fill="none" stroke="#eaeaea"
              stroke-width="36" stroke-linecap="round" stroke-linejoin="round"
            />
            <path
              d="M 208 306 L 304 306" fill="none" stroke="#f2604f"
              stroke-width="28" stroke-linecap="round"
            />
            <circle cx="256" cy="148" r="23" fill="url(#splashCorail)" />
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
