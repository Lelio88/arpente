/**
 * Verifie qu'aucune archive de fond de carte ne manque avant un build.
 *
 * Joue automatiquement avant `npm run build` et `npm run generate` (scripts npm
 * `prebuild` / `pregenerate`). Sans lui, un build lance sur un clone neuf produirait
 * une application dont la carte est vide, sans que rien ne le signale : `public/basemaps/`
 * n'est pas versionne, exactement comme l'etait `public/tiles/` avant lui.
 *
 * Ce controle ne tourne volontairement pas en developpement : `npm run dev` doit rester
 * utilisable sans archives, la carte affichant alors son bandeau « fond indisponible ».
 */

import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CITY_BOUNDS } from './cities'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASEMAP_DIR = join(__dirname, '..', 'public', 'basemaps')

const missing = Object.keys(CITY_BOUNDS).filter(
  (city) => !existsSync(join(BASEMAP_DIR, `${city}.pmtiles`)),
)

if (missing.length > 0) {
  console.error(`Fond de carte manquant pour : ${missing.join(', ')}`)
  console.error(`Attendu dans ${BASEMAP_DIR}`)
  console.error()
  console.error('Lancez « npm run download-basemap » avant de construire l\'application.')
  process.exit(1)
}

console.log(`Fond de carte present pour : ${Object.keys(CITY_BOUNDS).join(', ')}`)
