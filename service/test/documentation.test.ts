/**
 * La documentation suit les outils : chaque outil enregistré figure dans le
 * tableau de `docs/mcp-architecture.md`, et le tableau ne nomme aucun outil
 * qui n'existe plus.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { appelMcp, brancherAssistant, monterBanc } from './aides'

const ici = dirname(fileURLToPath(import.meta.url))

test('docs/mcp-architecture.md décrit exactement les outils enregistrés', async () => {
  const banc = await monterBanc()
  try {
    banc.personnes['session'] = { id: 'u', email: 'u@exemple.test', anonyme: false, connecteLe: 0 }
    const { acces } = await brancherAssistant(banc, 'session')
    const r = await appelMcp(banc, acces, 'tools/list')
    const enregistres = (r.corps.result.tools as { name: string }[]).map(o => o.name).sort()

    const doc = await readFile(join(ici, '..', '..', 'docs', 'mcp-architecture.md'), 'utf8')
    const section = doc.split('## Outils')[1]?.split('\n## ')[0] ?? ''
    const documentes = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map(m => m[1]!).sort()
    assert.deepEqual(documentes, enregistres)
  }
  finally {
    await banc.fermer()
  }
})
