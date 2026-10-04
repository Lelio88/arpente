/**
 * Compile le contenu éditorial du dépôt (`../content`) en `data/contenu.json`,
 * que le service charge au démarrage. Lancé au build de l'image, et par
 * `npm run contenu` en local. Échoue — et donc arrête le build — sur un lieu
 * ou un parcours mal formé.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compilerContenu } from '../src/contenu'

const ici = dirname(fileURLToPath(import.meta.url))
const racineContenu = resolve(ici, '..', '..', 'content')
const sortie = resolve(ici, '..', 'data', 'contenu.json')

const contenu = await compilerContenu(racineContenu)
await mkdir(dirname(sortie), { recursive: true })
await writeFile(sortie, JSON.stringify(contenu))
process.stdout.write(`contenu : ${contenu.lieux.length} lieux, ${contenu.parcours.length} parcours → ${join('data', 'contenu.json')}\n`)
