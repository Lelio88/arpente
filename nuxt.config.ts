import { networkInterfaces } from 'node:os'

// IP(s) locales de la machine (hors loopback) : necessaires pour que le
// certificat auto-signe soit accepte quand on ouvre le serveur de dev depuis
// un telephone sur le meme reseau Wi-Fi (geolocation/camera exigent un
// contexte securise, meme via une IP locale — voir devServer plus bas).
function getLocalNetworkIps(): string[] {
  const ips: string[] = []
  for (const iface of Object.values(networkInterfaces())) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address)
      }
    }
  }
  return ips
}

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
    // Certificat auto-signe genere a la volee par Nuxt (via listhen), sans
    // fichier a fournir ni outil externe. Regenere a chaque demarrage donc
    // le navigateur redemande une confirmation "connexion non securisee" a
    // chaque `npm run dev` — sans impact fonctionnel, juste a accepter une
    // fois par appareil et par session de dev.
    //
    // `domains` n'est pas dans le type public de Nuxt pour devServer.https
    // (qui n'expose que cert/key/pfx) mais listhen le supporte et le
    // transmet tel quel au runtime (verifie dans node_modules/listhen) : le
    // cast est necessaire pour inclure l'IP locale, sinon seuls
    // localhost/127.0.0.1/::1 seraient couverts et un telephone sur le
    // reseau local verrait un avertissement supplementaire de nom invalide.
    https: {
      domains: ['localhost', '127.0.0.1', ...getLocalNetworkIps()],
    } as { cert?: string, key?: string },
  },
})
