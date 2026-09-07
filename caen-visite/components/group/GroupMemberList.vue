<script setup lang="ts">
import type { GroupMember } from '~/types'

defineProps<{
  members: GroupMember[]
}>()
</script>

<template>
  <ul class="member-list">
    <li v-for="member in members" :key="member.userId" class="member-item">
      <span class="member-avatar">{{ member.handle.charAt(0).toUpperCase() }}</span>
      <span class="member-handle">{{ member.handle }}</span>
    </li>
  </ul>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.member-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.member-item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm;
  background: $color-surface-elevated;
  border-radius: $radius-sm;
}

.member-avatar {
  width: 28px;
  height: 28px;
  border-radius: $radius-full;
  background: $color-highlight;
  color: white;
  font-weight: 700;
  font-size: $font-size-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-handle {
  font-size: $font-size-sm;
  font-weight: 600;
}
</style>
