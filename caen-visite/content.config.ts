import { defineContentConfig, defineCollection } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    pois: defineCollection({
      type: 'page',
      source: 'pois/**',
    }),
    routes: defineCollection({
      type: 'page',
      source: 'routes/**',
    }),
    puzzles: defineCollection({
      type: 'page',
      source: 'puzzles/**',
    }),
    tips: defineCollection({
      type: 'page',
      source: 'tips/**',
    }),
  },
})
