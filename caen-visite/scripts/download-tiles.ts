import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface Bounds {
  north: number
  south: number
  west: number
  east: number
}

const CITY_BOUNDS: Record<string, Bounds> = {
  caen: {
    north: 49.205,
    south: 49.165,
    west: -0.405,
    east: -0.330,
  },
  troyes: {
    north: 48.310,
    south: 48.285,
    west: 4.060,
    east: 4.090,
  },
}

const ZOOM_MIN = 13
const ZOOM_MAX = 17
const DELAY_MS = 500
const USER_AGENT = 'Arpente/1.0 (offline-tour-app)'
const OUTPUT_DIR = join(__dirname, '..', 'public', 'tiles')

function resolveCities(): string[] {
  const arg = process.argv[2]
  if (!arg) return Object.keys(CITY_BOUNDS)
  if (!CITY_BOUNDS[arg]) {
    console.error(`Ville inconnue : "${arg}". Villes disponibles : ${Object.keys(CITY_BOUNDS).join(', ')}`)
    process.exit(1)
  }
  return [arg]
}

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  )
}

interface Tile {
  z: number
  x: number
  y: number
}

function generateTileList(bounds: Bounds): Tile[] {
  const tiles: Tile[] = []

  for (let z = ZOOM_MIN; z <= ZOOM_MAX; z++) {
    const xMin = lngToTileX(bounds.west, z)
    const xMax = lngToTileX(bounds.east, z)
    const yMin = latToTileY(bounds.north, z)
    const yMax = latToTileY(bounds.south, z)

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y })
      }
    }
  }

  return tiles
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function downloadTile(tile: Tile): Promise<boolean> {
  const dir = join(OUTPUT_DIR, String(tile.z), String(tile.x))
  const filePath = join(dir, `${tile.y}.png`)

  if (existsSync(filePath)) {
    return false
  }

  const url = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    console.error(`  ERREUR ${response.status} pour ${url}`)
    return false
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, buffer)

  return true
}

async function main() {
  const cities = resolveCities()
  console.log(`Villes : ${cities.join(', ')}`)
  console.log(`Dossier de sortie : ${OUTPUT_DIR}`)
  console.log()

  let downloaded = 0
  let skipped = 0

  for (const city of cities) {
    const tiles = generateTileList(CITY_BOUNDS[city]!)
    console.log(`--- ${city} : ${tiles.length} tuiles ---`)

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i]!
      const wasDownloaded = await downloadTile(tile)

      if (wasDownloaded) {
        downloaded++
        console.log(`  [${i + 1}/${tiles.length}] z${tile.z} x${tile.x} y${tile.y} - OK`)
        await sleep(DELAY_MS)
      } else {
        skipped++
      }
    }
  }

  console.log()
  console.log(`Termine ! ${downloaded} telechargees, ${skipped} deja presentes.`)
}

main().catch((err) => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
