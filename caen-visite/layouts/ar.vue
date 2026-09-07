<script setup lang="ts">
</script>

<template>
  <div class="layout-ar">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.layout-ar {
  height: 100%;
  width: 100%;
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
}
</style>
