<script setup lang="ts">
const params = useRoute().params

const { data: poi } = await useAsyncData(`poi-${params.slug}`, () =>
  queryCollection('pois').where('stem', '=', `pois/${params.slug}`).first(),
)
</script>

<template>
  <div class="page-poi safe-top">
    <template v-if="poi">
      <header class="poi-header">
        <button class="back-link" @click="$router.back()">← Retour</button>
        <PoiImage
          :src="poi.meta?.image as string | undefined"
          :alt="poi.title"
          class="poi-hero"
        />
        <h1>{{ poi.title }}</h1>
        <div class="poi-meta-info">
          <span v-if="poi.meta?.epoch" class="poi-epoch">{{ poi.meta.epoch }}</span>
          <span v-if="poi.meta?.builder" class="poi-builder">{{ poi.meta.builder }}</span>
        </div>
      </header>

      <div class="poi-tags">
        <span
          v-for="tag in (poi.meta?.tags as string[] || [])"
          :key="tag"
          class="tag"
        >
          {{ tag }}
        </span>
      </div>

      <ContentRenderer :value="poi" class="poi-body" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-poi {
  flex: 1;
  overflow-y: auto;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.back-link {
  display: inline-block;
  padding: $spacing-md;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.poi-hero {
  width: 100%;
  height: 240px;
  object-fit: cover;
}

.poi-header {
  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    padding: $spacing-md $spacing-lg 0;
  }
}

.poi-meta-info {
  display: flex;
  gap: $spacing-md;
  padding: $spacing-xs $spacing-lg;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.poi-tags {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-xs;
  padding: $spacing-md $spacing-lg;
}

.tag {
  padding: $spacing-xs $spacing-sm;
  background: $color-surface-elevated;
  border-radius: $radius-sm;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.poi-body {
  padding: $spacing-lg;
  line-height: 1.7;
  font-size: $font-size-md;

  :deep(h2) {
    font-size: $font-size-lg;
    font-weight: 700;
    margin-top: $spacing-xl;
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
