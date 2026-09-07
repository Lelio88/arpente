<script setup lang="ts">
import { useCityStore } from '~/stores/city'

const cityStore = useCityStore()
const open = ref(false)

function selectCity(slug: typeof cityStore.currentCity) {
  cityStore.setCity(slug)
  open.value = false
}
</script>

<template>
  <div class="city-switcher safe-top">
    <button class="city-pill" @click="open = !open">
      <span>📍 {{ cityStore.currentCityConfig.name }}</span>
      <span class="chevron" :class="{ open }">▾</span>
    </button>

    <div v-if="open" class="city-options">
      <button
        v-for="city in cityStore.cities"
        :key="city.slug"
        class="city-option"
        :class="{ active: city.slug === cityStore.currentCity }"
        @click="selectCity(city.slug)"
      >
        {{ city.name }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.city-switcher {
  position: absolute;
  top: $spacing-md;
  left: $spacing-md;
  z-index: $z-ui;
}

.city-pill {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  padding: $spacing-sm $spacing-md;
  background: rgba(30, 30, 48, 0.9);
  backdrop-filter: blur(6px);
  border-radius: $radius-full;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text;
}

.chevron {
  font-size: $font-size-xs;
  transition: transform $transition-fast;

  &.open {
    transform: rotate(180deg);
  }
}

.city-options {
  margin-top: $spacing-xs;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.city-option {
  padding: $spacing-sm $spacing-md;
  text-align: left;
  font-size: $font-size-sm;
  color: $color-text-muted;

  &.active {
    color: $color-text;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.06);
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>
