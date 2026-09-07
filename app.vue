<script setup lang="ts">
const showSplash = ref(true)

onMounted(() => {
  setTimeout(() => {
    showSplash.value = false
  }, 1800)
})
</script>

<template>
  <SplashScreen v-if="showSplash" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
