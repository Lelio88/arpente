/**
 * Extrait le fond de carte hors ligne de chaque ville depuis le basemap Protomaps.
 *
 * Produit un fichier `public/basemaps/<ville>.pmtiles` par ville : une archive PMTiles
 * de tuiles vectorielles, decoupee sur les bornes de la ville. L'application le charge
 * entierement en memoire au premier affichage de la carte (voir `composables/useBasemap.ts`).
 *
 * Pourquoi Protomaps et non plus des tuiles raster OpenStreetMap : la politique de la
 * fondation OSM interdit le telechargement en masse depuis `tile.openstreetmap.org`, et
 * le service refuse desormais les 1 649 requetes que demandait l'ancienne approche. Le
 * basemap Protomaps est un produit derive d'OpenStreetMap sous ODbL, publie precisement
 * pour etre extrait par bbox : une ville tient en une trentaine de requetes et 4 Mo.
 * L'attribution OpenStreetMap reste obligatoire — elle est portee par la couche Leaflet.
 *
 * Invariant : le maxzoom d'extraction (15) est le plafond du basemap Protomaps, pas celui
 * de l'affichage. Le rendu etant vectoriel, la carte reste nette au-dela par sur-zoom —
 * c'est `maxDataZoom` cote application qui le declare.
 *
 * Prerequis : le binaire d'extraction `pmtiles` (projet go-pmtiles) sur le PATH. Le script
 * s'arrete avec les voies d'installation s'il est absent.
 *
 * Usage :
 *   npm run download-basemap              # les deux villes
 *   npm run download-basemap -- caen      # une seule
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CITY_BOUNDS, type Bounds } from './cities'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Plafond de zoom du basemap Protomaps. Au-dela, le rendu vectoriel sur-zoome. */
const MAX_ZOOM = 15

/** Liste des constructions quotidiennes du basemap, la plus recente en derniere position. */
const BUILDS_INDEX_URL = 'https://build-metadata.protomaps.dev/builds.json'
const BUILDS_BASE_URL = 'https://build.protomaps.com/'

/** Noms du binaire d'extraction : `pmtiles` via les releases, `go-pmtiles` via `go install`. */
const EXTRACTOR_NAMES = ['pmtiles', 'go-pmtiles']

const OUTPUT_DIR = join(__dirname, '..', 'public', 'basemaps')

function resolveCities(): string[] {
  const arg = process.argv[2]
  if (!arg) return Object.keys(CITY_BOUNDS)
  if (!CITY_BOUNDS[arg]) {
    console.error(`Ville inconnue : "${arg}". Villes disponibles : ${Object.keys(CITY_BOUNDS).join(', ')}`)
    process.exit(1)
  }
  return [arg]
}

/**
 * Cherche le binaire d'extraction sur le PATH en l'invoquant. `spawnSync` ne leve pas :
 * il renseigne `error` avec un ENOENT quand la commande n'existe pas, ce qui evite de
 * reimplementer la resolution du PATH (differente entre Windows et POSIX).
 */
function findExtractor(): string | null {
  for (const name of EXTRACTOR_NAMES) {
    const probe = spawnSync(name, ['version'], { stdio: 'ignore' })
    if (!probe.error && probe.status === 0) return name
  }
  return null
}

function reportMissingExtractor(): never {
  console.error('Le binaire d\'extraction PMTiles est introuvable sur le PATH.')
  console.error()
  console.error('Installez-le par l\'une de ces voies :')
  console.error('  go install github.com/protomaps/go-pmtiles@latest')
  console.error('  https://github.com/protomaps/go-pmtiles/releases  (binaire a placer sur le PATH)')
  console.error('  docker run protomaps/go-pmtiles')
  process.exit(1)
}

interface BuildEntry {
  key: string
  version: string
  uploaded: string
}

/** Resout la construction quotidienne la plus recente du basemap mondial. */
async function resolveLatestBuild(): Promise<BuildEntry> {
  const response = await fetch(BUILDS_INDEX_URL)
  if (!response.ok) {
    throw new Error(`Liste des constructions inaccessible (HTTP ${response.status}) : ${BUILDS_INDEX_URL}`)
  }

  const builds = (await response.json()) as BuildEntry[]
  const latest = builds.at(-1)
  if (!latest) {
    throw new Error('La liste des constructions Protomaps est vide.')
  }

  return latest
}

function extractCity(extractor: string, buildUrl: string, city: string, bounds: Bounds): void {
  const output = join(OUTPUT_DIR, `${city}.pmtiles`)
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`

  console.log(`--- ${city} : extraction vers ${output} ---`)

  const result = spawnSync(
    extractor,
    ['extract', buildUrl, output, `--bbox=${bbox}`, `--maxzoom=${MAX_ZOOM}`],
    { stdio: 'inherit' },
  )

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`L'extraction de "${city}" a echoue (code ${result.status}).`)
  }
}

async function main() {
  const cities = resolveCities()

  const extractor = findExtractor() ?? reportMissingExtractor()
  const build = await resolveLatestBuild()
  const buildUrl = BUILDS_BASE_URL + build.key

  console.log(`Villes : ${cities.join(', ')}`)
  console.log(`Construction : ${build.key} (basemap ${build.version}, publiee le ${build.uploaded})`)
  console.log(`Dossier de sortie : ${OUTPUT_DIR}`)
  console.log()

  mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const city of cities) {
    extractCity(extractor, buildUrl, city, CITY_BOUNDS[city]!)
  }

  console.log()
  console.log(`Termine ! ${cities.length} ville(s) extraite(s) depuis ${build.key}.`)
}

main().catch((err) => {
  console.error('Erreur fatale :', err instanceof Error ? err.message : err)
  process.exit(1)
})
