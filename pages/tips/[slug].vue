<script setup lang="ts">
const params = useRoute().params

const { data: tip } = await useAsyncData(`tip-${params.slug}`, () =>
  queryCollection('tips').where('stem', '=', `tips/${params.slug}`).first(),
)
</script>

<template>
  <div class="page-tip safe-top">
    <template v-if="tip">
      <header class="tip-header" :style="{ background: `linear-gradient(135deg, ${tip.meta?.color || '#888'}33, transparent)` }">
        <button class="back-link" @click="$router.back()">← Retour</button>
        <div class="tip-hero">
          <span class="tip-icon">{{ tip.meta?.icon || '💡' }}</span>
          <h1>{{ tip.title }}</h1>
        </div>
      </header>

      <ContentRenderer :value="tip" class="tip-body" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-tip {
  flex: 1;
  overflow-y: auto;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.tip-header {
  padding: $spacing-md;
}

.back-link {
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
  display: inline-block;
}

.tip-hero {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md 0 $spacing-lg;

  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    flex: 1;
  }
}

.tip-icon {
  font-size: 3rem;
  line-height: 1;
}

.tip-body {
  padding: $spacing-lg;
  line-height: 1.7;
  font-size: $font-size-md;

  :deep(h2) {
    font-size: $font-size-lg;
    font-weight: 700;
    margin-top: $spacing-xl;
    margin-bottom: $spacing-sm;
  }

  :deep(h3) {
    font-size: $font-size-md;
    font-weight: 600;
    margin-top: $spacing-lg;
    margin-bottom: $spacing-sm;
  }

  :deep(ul) {
    padding-left: $spacing-lg;
    margin-bottom: $spacing-md;
  }

  :deep(li) {
    margin-bottom: $spacing-xs;
  }

  :deep(p) {
    margin-bottom: $spacing-md;
  }

  :deep(strong) {
    color: $color-text;
    font-weight: 700;
  }

  :deep(a) {
    color: $color-highlight;
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>
