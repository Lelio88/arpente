<script setup lang="ts">
// L'intro se retire elle-même (plancher ou toucher, puis fondu) : pas de
// second minuteur ici, qui la couperait en plein mouvement. L'accueil est
// monté dessous dès le premier rendu, pour que ses chargements partent
// pendant l'animation.
const showSplash = ref(true)
</script>

<template>
  <SplashScreen v-if="showSplash" @fini="showSplash = false" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
