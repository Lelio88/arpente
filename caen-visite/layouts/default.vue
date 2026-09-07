<script setup lang="ts">
</script>

<template>
  <div class="layout-default">
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
