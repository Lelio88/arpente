import { networkInterfaces } from 'node:os'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

// Archives PMTiles du fond de carte (public/basemaps/*.pmtiles), declarees une a une
// au pre-cache du service worker.
//
// Pourquoi le pre-cache et non `runtimeCaching` : une regle CacheFirst sur ces URL est
// bien enregistree et bien traversee par le service worker, mais n'ecrit jamais dans le
// Cache Storage — verifie en conditions reelles, l'ecriture manuelle dans le meme cache
// fonctionnant par ailleurs. Or « fonctionner au milieu d'une rue, sans reseau » est un
// objectif central du projet : le fond de carte ne peut pas dependre d'un cache qui ne
// se remplit pas. Le pre-cache, lui, est verifie.
//
// Consequence assumee : l'installation de la PWA telecharge les ~8 Mo d'emblee. En
// application Capacitor, ou les archives sont deja sur le disque, ce cout est nul.
//
// Pourquoi `additionalManifestEntries` plutot que `globPatterns` : ces entrees s'ajoutent
// au manifeste, la ou un `globPatterns` explicite remplacerait celui par defaut et ferait
// silencieusement sortir du pre-cache tout ce qu'il couvre aujourd'hui.
function basemapPrecacheEntries(): { url: string, revision: string }[] {
  const dir = fileURLToPath(new URL('./public/basemaps', import.meta.url))
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((file) => file.endsWith('.pmtiles'))
    .map((file) => ({
      url: `/basemaps/${file}`,
      // La revision est le contenu lui-meme : une nouvelle extraction invalide l'entree,
      // une extraction identique ne fait pas retelecharger 4 Mo aux visiteurs.
      revision: createHash('sha256').update(readFileSync(join(dir, file))).digest('hex').slice(0, 16),
    }))
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
      lang: 'fr',
      description: 'Guide de visite interactif — carte et parcours thematiques hors ligne',
      theme_color: '#1a1a2e',
      background_color: '#1a1a2e',
      display: 'standalone',
      orientation: 'portrait',
      // La marque tient dans le cercle de securite des icones maskable
      // (rayon 80% du canvas), donc le meme fichier sert en « any » et en
      // « maskable » : aucun rognage a craindre, pas de variante a maintenir.
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      additionalManifestEntries: basemapPrecacheEntries(),
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
        { name: 'description', content: 'Guide de visite interactif — carte et parcours thematiques hors ligne' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/icons/icon-192.png' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
      ],
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
