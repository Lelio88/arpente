<script setup lang="ts">
const route = useRoute()

const tabs = [
  { path: '/', icon: '🗺️', label: 'Carte' },
  { path: '/routes', icon: '🚶', label: 'Parcours' },
  { path: '/ar', icon: '✨', label: 'AR' },
  { path: '/tips', icon: '💡', label: 'Tips' },
] as const
</script>

<template>
  <nav class="navbar safe-bottom">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.path"
      :to="tab.path"
      class="navbar-tab"
      :class="{ active: route.path === tab.path || (tab.path !== '/' && route.path.startsWith(tab.path)) }"
    >
      <span class="navbar-icon">{{ tab.icon }}</span>
      <span class="navbar-label">{{ tab.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.navbar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 60px;
  background: $color-surface;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  z-index: $z-navbar;
  flex-shrink: 0;
}

.navbar-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: $spacing-xs $spacing-md;
  opacity: 0.5;
  transition: opacity $transition-fast;

  &.active {
    opacity: 1;
  }
}

.navbar-icon {
  font-size: 1.4rem;
}

.navbar-label {
  font-size: $font-size-xs;
  font-weight: 500;
}
</style>
