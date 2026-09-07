<script setup lang="ts">
import type { Group } from '~/types'

defineProps<{
  group: Group
}>()

const statusLabel: Record<Group['status'], string> = {
  voting: 'Vote en cours',
  decided: 'Parcours decide',
}
</script>

<template>
  <NuxtLink :to="`/groups/${group.code}`" class="group-card">
    <div class="group-info">
      <h3 class="group-title">{{ group.name }}</h3>
      <div class="group-meta">
        <span>{{ group.city === 'caen' ? 'Caen' : 'Troyes' }}</span>
        <span>{{ statusLabel[group.status] }}</span>
        <span>Code {{ group.code }}</span>
      </div>
    </div>
  </NuxtLink>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.group-card {
  display: flex;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  transition: transform $transition-fast;

  &:active {
    transform: scale(0.98);
  }
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-title {
  font-size: $font-size-md;
  font-weight: 700;
  margin-bottom: $spacing-xs;
}

.group-meta {
  display: flex;
  gap: $spacing-md;
  font-size: $font-size-xs;
  color: $color-text-muted;

  span {
    &::before {
      content: '·';
      margin-right: $spacing-xs;
    }

    &:first-child::before {
      content: none;
    }
  }
}
</style>
