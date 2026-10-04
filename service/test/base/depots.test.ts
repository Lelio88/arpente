/**
 * Les dépôts SQL du service contre une vraie base Arpente (schéma et
 * migrations joués), connectés sous le rôle `arpente_assistant` : c'est la
 * RLS qui juge, comme en production.
 *
 * À lancer à part, sur une base JETABLE (un « supabase start » local) :
 *   ARPENTE_BASE_ADMIN=postgres://postgres:postgres@127.0.0.1:54322/postgres \
 *   ARPENTE_BASE_SERVICE=postgres://arpente_assistant:essai-local@127.0.0.1:54322/postgres \
 *   npm run test:base
 * Les deux variables sont obligatoires : sans elles, la suite échoue au lieu
 * de s'ignorer en silence. Les lignes créées sont supprimées à la fin.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import pg from 'pg'
import { AutorisationsEnBase } from '../../src/base/autorisations'
import { GroupesEnBase } from '../../src/base/groupes'

const urlAdmin = process.env.ARPENTE_BASE_ADMIN
const urlService = process.env.ARPENTE_BASE_SERVICE
if (!urlAdmin || !urlService) {
  throw new Error('ARPENTE_BASE_ADMIN et ARPENTE_BASE_SERVICE sont requises (voir l\'en-tête du fichier)')
}

const admin = new pg.Pool({ connectionString: urlAdmin, max: 2 })
const service = new pg.Pool({ connectionString: urlService, max: 3 })
const groupes = new GroupesEnBase(service)
const autorisations = new AutorisationsEnBase(service)

const alice = randomUUID()
const bob = randomUUID()
const chloe = randomUUID()
const anonyme = randomUUID()
let groupe = ''
let autreGroupe = ''

async function creerCompte(id: string, pseudo: string, estAnonyme = false): Promise<void> {
  await admin.query(
    `insert into auth.users (id, instance_id, aud, role, is_anonymous, email, email_confirmed_at, created_at, last_sign_in_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3, now(), now(), now())`,
    [id, estAnonyme, estAnonyme ? null : `${pseudo}-${id.slice(0, 8)}@exemple.test`])
  await admin.query('insert into public.profiles (id, handle) values ($1, $2)', [id, `${pseudo}-${id.slice(0, 8)}`])
}

before(async () => {
  for (const [id, pseudo] of [[alice, 'alice'], [bob, 'bob'], [chloe, 'chloe']] as const) await creerCompte(id, pseudo)
  await creerCompte(anonyme, 'anonyme', true)
  const { rows } = await admin.query<{ id: string }>(
    `insert into public.groups (name, city, created_by) values ('Visite', 'caen', $1) returning id`, [alice])
  groupe = rows[0]!.id
  const autre = await admin.query<{ id: string }>(
    `insert into public.groups (name, city, created_by) values ('Celui de Chloé', 'caen', $1) returning id`, [chloe])
  autreGroupe = autre.rows[0]!.id
  await admin.query('insert into public.group_members (group_id, user_id) values ($1, $2), ($1, $3), ($1, $4)',
    [groupe, alice, bob, anonyme])
  await admin.query('insert into public.group_members (group_id, user_id) values ($1, $2)', [autreGroupe, chloe])
})

after(async () => {
  await admin.query('delete from public.groups where id = any($1)', [[groupe, autreGroupe]])
  await admin.query('delete from auth.users where id = any($1)', [[alice, bob, chloe, anonyme]])
  await admin.end()
  await service.end()
})

describe('groupes, au nom du membre', () => {
  test('mesGroupes : seulement les siens', async () => {
    const siens = await groupes.mesGroupes(alice)
    assert.deepEqual(siens.map(g => g.id), [groupe])
    assert.equal(siens[0]!.membres, 3)
  })

  test('detail : refusé à un non-membre', async () => {
    assert.equal(await groupes.detail(alice, autreGroupe), null)
  })

  test('voter, retirer, idempotence', async () => {
    assert.equal(await groupes.voter(alice, groupe, 'chateau-de-caen'), 'fait')
    assert.equal(await groupes.voter(alice, groupe, 'chateau-de-caen'), 'deja')
    assert.equal(await groupes.voter(bob, groupe, 'chateau-de-caen'), 'fait')
    assert.equal(await groupes.voter(alice, groupe, 'abbaye-aux-hommes'), 'fait')
    assert.equal(await groupes.retirer(alice, groupe, 'abbaye-aux-hommes'), 'fait')
    assert.equal(await groupes.retirer(alice, groupe, 'abbaye-aux-hommes'), 'deja')
    const d = await groupes.detail(alice, groupe)
    assert.deepEqual(d!.approbations['chateau-de-caen']!.sort(), [alice, bob].sort())
  })

  test('voter dans le groupe d\'un autre : refusé par la RLS', async () => {
    await assert.rejects(groupes.voter(alice, autreGroupe, 'chateau-de-caen'), /row-level security/)
  })

  test('regler : un champ omis garde sa valeur', async () => {
    await groupes.regler(alice, groupe, 3, 120)
    assert.deepEqual(await groupes.regler(alice, groupe, null, 90), { nombre: 3, duree: 90 })
  })

  test('les pseudos des coéquipiers sont lisibles (la RLS juge celui qui lit)', async () => {
    const d = await groupes.detail(alice, groupe)
    assert.equal(d!.pseudos.length, 3)
    assert.ok(d!.pseudos.every(p => p.pseudo !== '?'))
    assert.equal(d!.pseudos.filter(p => p.moi).length, 1)
  })

  test('arreter : parcours et statut, en une transaction', async () => {
    await groupes.arreter(bob, groupe, 'caen', {
      etapes: ['chateau-de-caen'], nombreVise: 1, dureeVisee: 90, distanceMetres: 0, dureeSecondes: null,
    })
    const d = await groupes.detail(alice, groupe)
    assert.equal(d!.statut, 'decided')
    assert.deepEqual(d!.parcoursArrete!.etapes, ['chateau-de-caen'])
    assert.equal(d!.parcoursArrete!.par, bob)
  })

  test('arreter dans le groupe d\'un autre : rien n\'est écrit', async () => {
    await assert.rejects(groupes.arreter(alice, autreGroupe, 'caen', {
      etapes: ['chateau-de-caen'], nombreVise: 1, dureeVisee: null, distanceMetres: 0, dureeSecondes: null,
    }))
    const { rows } = await admin.query('select count(*)::int as n from public.decided_routes where group_id = $1', [autreGroupe])
    assert.equal(rows[0].n, 0)
  })
})

describe('accès d\'assistant', () => {
  test('remplacer, lire, tourner (comparer-échanger), supprimer', async () => {
    const cle = 'a'.repeat(64)
    const premier = await autorisations.remplacer({
      userId: alice, cleClient: cle, nomClient: 'Claude', assistant: 'Claude', expireLe: new Date(Date.now() + 86_400_000),
    })
    const second = await autorisations.remplacer({
      userId: alice, cleClient: cle, nomClient: 'Claude', assistant: 'Claude', expireLe: new Date(Date.now() + 86_400_000),
    })
    assert.equal(await autorisations.lire(premier.id), null, 'un nouvel accord remplace l\'ancien')
    assert.equal(await autorisations.tourner(second.id, 0), true)
    assert.equal(await autorisations.tourner(second.id, 0), false, 'une génération périmée ne tourne pas')
    assert.equal((await autorisations.lire(second.id))!.generation, 1)
    await autorisations.noterUsage(second.id)
    await autorisations.supprimer(second.id)
    assert.equal(await autorisations.lire(second.id), null)
  })

  test('supprimer le compte supprime ses accès', async () => {
    const a = await autorisations.remplacer({
      userId: chloe, cleClient: 'b'.repeat(64), nomClient: 'ChatGPT', assistant: 'ChatGPT', expireLe: new Date(Date.now() + 86_400_000),
    })
    await admin.query('delete from auth.users where id = $1', [chloe])
    assert.equal(await autorisations.lire(a.id), null)
  })
})
