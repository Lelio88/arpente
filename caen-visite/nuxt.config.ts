export default defineNuxtConfig({
  compatibilityDate: '2025-03-30',

  modules: [
    '@nuxt/content',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@vite-pwa/nuxt',
  ],

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Arpente',
      short_name: 'Arpente',
      description: 'Guide de visite interactif — carte, parcours thematiques et puzzle AR',
      theme_color: '#1a1a2e',
      background_color: '#1a1a2e',
      display: 'standalone',
      orientation: 'portrait',
    },
    workbox: {
      navigateFallback: '/',
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/router\.project-osrm\.org\/route\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'osrm-routes',
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24 * 7, // 7 jours
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        {
          urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'osm-tiles-online',
            expiration: {
              maxEntries: 200,
              maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
      ],
    },
  },

  css: [
    '~/assets/styles/main.scss',
  ],

  app: {
    head: {
      title: 'Arpente',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'theme-color', content: '#1a1a2e' },
        { name: 'description', content: 'Guide de visite interactif — carte, parcours thematiques et puzzle AR' },
      ],
      link: [],
    },
  },

  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],

  nitro: {
    preset: 'static',
  },

  // Les codes de groupe sont crees apres le build (npm run generate) et ne
  // peuvent donc jamais etre pre-rendus : cette section reste en rendu client.
  routeRules: {
    '/groups/**': { ssr: false },
  },

  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },

  typescript: {
    strict: true,
  },

  devServer: {
    host: '0.0.0.0',
    https: {
      cert: './192.168.1.159+2.pem',
      key: './192.168.1.159+2-key.pem',
    },
  },
})
