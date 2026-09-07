<script setup lang="ts">
import { usePuzzleStore } from '~/stores/puzzle'

const puzzleStore = usePuzzleStore()

const { data: puzzlesRaw } = await useAsyncData('puzzles', () =>
  queryCollection('puzzles').all(),
)

const puzzles = computed(() =>
  (puzzlesRaw.value || []).map((doc: any) => ({
    id: slugFromStem(doc.stem),
    title: doc.title || doc.meta?.title,
    difficulty: doc.meta?.difficulty,
    hint: doc.meta?.location?.hint,
    completed: puzzleStore.isCompleted(slugFromStem(doc.stem)),
  })),
)

const totalCompleted = computed(() =>
  puzzles.value.filter((p) => p.completed).length,
)
</script>

<template>
  <div class="page-ar safe-top">
    <header class="ar-header">
      <h1>Les Meurtieres du Chateau</h1>
      <p>Retrouvez et tracez les meurtieres du Chateau de Caen</p>
      <div class="ar-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: puzzles.length ? `${(totalCompleted / puzzles.length) * 100}%` : '0%' }"
          />
        </div>
        <span class="progress-text">{{ totalCompleted }} / {{ puzzles.length }}</span>
      </div>
    </header>

    <div class="puzzle-list">
      <NuxtLink
        v-for="puzzle in puzzles"
        :key="puzzle.id"
        :to="`/ar/puzzle/${puzzle.id}`"
        class="puzzle-card"
        :class="{ completed: puzzle.completed }"
      >
        <div class="puzzle-status">
          <span v-if="puzzle.completed" class="status-done">✓</span>
          <span v-else class="status-pending">{{ puzzle.difficulty }}</span>
        </div>
        <div class="puzzle-info">
          <h3>{{ puzzle.title }}</h3>
          <p>{{ puzzle.hint }}</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-ar {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.ar-header {
  margin-bottom: $spacing-xl;

  h1 {
    font-size: $font-size-xl;
    font-weight: 700;
    margin-bottom: $spacing-xs;
  }

  p {
    color: $color-text-muted;
    font-size: $font-size-sm;
    margin-bottom: $spacing-lg;
  }
}

.ar-progress {
  display: flex;
  align-items: center;
  gap: $spacing-md;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: $color-surface-elevated;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: $color-success;
  border-radius: 3px;
  transition: width $transition-normal;
}

.progress-text {
  font-size: $font-size-sm;
  color: $color-text-muted;
  font-weight: 600;
}

.puzzle-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.puzzle-card {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;

  &.completed {
    opacity: 0.6;
  }
}

.puzzle-status {
  width: 40px;
  height: 40px;
  border-radius: $radius-full;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-done {
  background: $color-success;
  color: $color-primary;
  width: 100%;
  height: 100%;
  border-radius: $radius-full;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.status-pending {
  background: $color-surface;
  width: 100%;
  height: 100%;
  border-radius: $radius-full;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: $font-size-sm;
}

.puzzle-info {
  h3 {
    font-size: $font-size-md;
    font-weight: 600;
    margin-bottom: $spacing-xs;
  }

  p {
    font-size: $font-size-sm;
    color: $color-text-muted;
  }
}
</style>
