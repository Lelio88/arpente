/**
 * Plugin client-only qui pre-cache tous les itineraires OSRM au chargement.
 * Le Service Worker (workbox) intercepte les requetes et les stocke automatiquement
 * grace a la regle runtimeCaching sur router.project-osrm.org.
 */
export default defineNuxtPlugin(async () => {
  // Attendre que l'app soit montee pour ne pas bloquer le rendu
  const alreadyCached = sessionStorage.getItem('osrm-precached')
  if (alreadyCached) return

  try {
    const [poisRaw, routesRaw] = await Promise.all([
      queryCollection('pois').all(),
      queryCollection('routes').all(),
    ])

    if (!poisRaw || !routesRaw) return

    // Construire un index slug → coordonnees
    const poiCoords = new Map<string, { lat: number; lng: number }>()
    for (const doc of poisRaw) {
      const d = doc as any
      const slug = slugFromStem(d.stem)
      if (d.meta?.lat && d.meta?.lng) {
        poiCoords.set(slug, { lat: d.meta.lat, lng: d.meta.lng })
      }
    }

    // Collecter toutes les paires de POI consecutifs dans tous les parcours
    const pairs: Array<{ from: { lat: number; lng: number }; to: { lat: number; lng: number } }> = []

    for (const doc of routesRaw) {
      const d = doc as any
      const routePois: Array<{ slug: string }> = d.meta?.pois || []

      for (let i = 0; i < routePois.length - 1; i++) {
        const from = poiCoords.get(routePois[i]!.slug)
        const to = poiCoords.get(routePois[i + 1]!.slug)
        if (from && to) {
          pairs.push({ from, to })
        }
      }
    }

    // Dedupliquer (meme paire de coords)
    const seen = new Set<string>()
    const uniquePairs = pairs.filter((p) => {
      const key = `${p.from.lng},${p.from.lat};${p.to.lng},${p.to.lat}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    console.log(`[precache] ${uniquePairs.length} itineraires OSRM a pre-cacher`)

    // Lancer les requetes en parallele par lots de 3 (pas surcharger OSRM)
    const batchSize = 3
    for (let i = 0; i < uniquePairs.length; i += batchSize) {
      const batch = uniquePairs.slice(i, i + batchSize)
      await Promise.all(
        batch.map((p) => {
          const url = `https://router.project-osrm.org/route/v1/foot/${p.from.lng},${p.from.lat};${p.to.lng},${p.to.lat}?overview=full&geometries=geojson`
          return fetch(url).catch(() => {})
        }),
      )
    }

    sessionStorage.setItem('osrm-precached', '1')
    console.log(`[precache] Termine — ${uniquePairs.length} itineraires en cache`)
  } catch (e) {
    // Silencieux — le pre-cache est optionnel
    console.warn('[precache] Echec du pre-cache OSRM:', e)
  }
})
