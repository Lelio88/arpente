<script setup lang="ts">
import { useCityStore } from '~/stores/city'

const cityStore = useCityStore()

// Restaure la ville choisie (localStorage) apres l'hydratation : le rendu
// serveur ne peut pas y acceder, donc on corrige cote client une fois monte.
onMounted(() => {
  cityStore.hydrateFromStorage()
})
</script>

<template>
  <div class="layout-default">
    <CitySwitcher />
    <slot />
    <AppNavbar />
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.layout-default {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}
</style>
