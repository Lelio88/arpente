<script setup lang="ts">
import type { Tip } from '~/types'
import { useCityStore } from '~/stores/city'

const cityStore = useCityStore()

const { data: tipsRaw } = await useAsyncData('tips', () =>
  queryCollection('tips').all(),
)

const tips = computed<Tip[]>(() =>
  (tipsRaw.value || [])
    .filter((doc: any) => doc.meta?.city === cityStore.currentCity)
    .map((doc: any) => ({
      title: doc.title || doc.meta?.title,
      slug: slugFromStem(doc.stem),
      city: doc.meta?.city,
      icon: doc.meta?.icon || '💡',
      order: doc.meta?.order || 99,
      color: doc.meta?.color || '#888',
      description: doc.description || doc.meta?.description || '',
    }))
    .sort((a, b) => a.order - b.order),
)
</script>

<template>
  <div class="page-tips safe-top">
    <header class="tips-header">
      <h1>Tips</h1>
      <p>Apprenez a regarder {{ cityStore.currentCityConfig.name }} autrement.</p>
    </header>

    <div class="tips-list">
      <NuxtLink
        v-for="tip in tips"
        :key="tip.slug"
        :to="`/tips/${tip.slug}`"
        class="tip-card"
        :style="{ borderLeftColor: tip.color }"
      >
        <span class="tip-icon">{{ tip.icon }}</span>
        <div class="tip-text">
          <h3>{{ tip.title }}</h3>
          <p>{{ tip.description }}</p>
        </div>
      </NuxtLink>
    </div>

    <!-- Les licences CC BY-SA des photographies imposent de nommer les auteurs
         dans l'application elle-meme. Cette page est le seul chemin qui y mene :
         la retirer mettrait l'app en infraction. -->
    <NuxtLink to="/credits" class="lien-credits">
      Crédits et licences
    </NuxtLink>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.lien-credits {
  display: block;
  margin-top: $spacing-lg;
  padding: $spacing-sm 0;
  text-align: center;
  color: $color-text-muted;
  font-size: 0.85rem;
  text-decoration: underline;
}

.page-tips {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.tips-header {
  margin-bottom: $spacing-xl;

  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    margin-bottom: $spacing-xs;
  }

  p {
    color: $color-text-muted;
    font-size: $font-size-sm;
  }
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.tip-card {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  border-left: 4px solid;
  transition: transform $transition-fast;

  &:active {
    transform: scale(0.98);
  }
}

.tip-icon {
  font-size: 2rem;
  flex-shrink: 0;
  line-height: 1;
}

.tip-text {
  flex: 1;
  min-width: 0;

  h3 {
    font-size: $font-size-md;
    font-weight: 700;
    margin-bottom: $spacing-xs;
  }

  p {
    font-size: $font-size-sm;
    color: $color-text-muted;
    line-height: 1.5;
  }
}
</style>
