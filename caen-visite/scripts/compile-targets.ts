/**
 * Compilation des images de reference en fichiers .mind pour MindAR.
 *
 * Sur Windows, le package `canvas` (dependance de mind-ar) ne compile pas facilement.
 * Utilise le compilateur en ligne de MindAR a la place :
 *
 * 1. Va sur : https://hiukim.github.io/mind-ar-js-doc/tools/compile
 * 2. Upload l'image depuis assets/targets/raw/meurtriere-01.png
 * 3. Clique "Start" et attends la compilation
 * 4. Telecharge le fichier .mind genere
 * 5. Place-le dans public/targets/meurtriere-01.mind
 *
 * Repete pour chaque meurtriere.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rawDir = join(__dirname, '..', 'assets', 'targets', 'raw')
const outputDir = join(__dirname, '..', 'public', 'targets')

console.log('=== Compilation des targets MindAR ===\n')

if (!existsSync(rawDir)) {
  console.log('Aucun dossier assets/targets/raw/ trouve.')
  process.exit(1)
}

const images = readdirSync(rawDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))

if (images.length === 0) {
  console.log('Aucune image trouvee dans assets/targets/raw/')
  process.exit(1)
}

console.log(`Images de reference trouvees : ${images.length}\n`)

for (const img of images) {
  const baseName = img.replace(/\.(png|jpg|jpeg|webp)$/i, '')
  const mindFile = join(outputDir, `${baseName}.mind`)
  const exists = existsSync(mindFile)

  console.log(`  ${img}`)
  console.log(`    → public/targets/${baseName}.mind ${exists ? '(deja present)' : '(MANQUANT)'}`)
}

console.log('\n--- Instructions ---')
console.log('1. Ouvre https://hiukim.github.io/mind-ar-js-doc/tools/compile')
console.log('2. Upload chaque image listee ci-dessus')
console.log('3. Telecharge le .mind et place-le dans public/targets/')
console.log('')

const missing = images.filter((img) => {
  const baseName = img.replace(/\.(png|jpg|jpeg|webp)$/i, '')
  return !existsSync(join(outputDir, `${baseName}.mind`))
})

if (missing.length > 0) {
  console.log(`⚠ ${missing.length} fichier(s) .mind manquant(s).`)
} else {
  console.log('✓ Tous les fichiers .mind sont presents.')
}
