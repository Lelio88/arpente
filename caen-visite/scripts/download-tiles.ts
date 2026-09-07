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
    north: 48.320,
    south: 48.275,
    west: 4.045,
    east: 4.100,
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

  // OpenStreetMap repond HTTP 200 meme quand il bloque un client abusif :
  // le corps contient alors une image "Access blocked" a la place de la tuile.
  // Le header x-blocked est le seul signal fiable pour detecter ce cas.
  const blockedReason = response.headers.get('x-blocked')
  if (blockedReason) {
    throw new TileBlockedError(blockedReason)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, buffer)

  return true
}

class TileBlockedError extends Error {}

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
  if (err instanceof TileBlockedError) {
    console.error()
    console.error(`OpenStreetMap a bloque ce reseau : ${err.message}`)
    console.error('Le telechargement s\'est arrete pour eviter de sauvegarder des tuiles corrompues.')
    console.error('Reessayez plus tard (le blocage est generalement temporaire).')
    process.exit(1)
  }
  console.error('Erreur fatale :', err)
  process.exit(1)
})
