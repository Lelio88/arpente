/**
 * Les accès d'assistant en base (`public.assistant_grants`), lus et écrits
 * sous le rôle `arpente_assistant` — hors de tout membre : la table a sa
 * propre politique pour ce rôle (`grants: service`).
 */
import type pg from 'pg'
import type { Autorisation, DepotAutorisations, NouvelleAutorisation } from '../oauth/autorisations'

interface Ligne {
  id: string
  user_id: string
  client_key: string
  client_name: string
  assistant: string
  created_at: Date
  expires_at: Date
  refresh_gen: number
}

const COLONNES = 'id, user_id, client_key, client_name, assistant, created_at, expires_at, refresh_gen'

function versAutorisation(l: Ligne): Autorisation {
  return {
    id: l.id,
    userId: l.user_id,
    cleClient: l.client_key,
    nomClient: l.client_name,
    assistant: l.assistant,
    creeLe: l.created_at,
    expireLe: l.expires_at,
    generation: l.refresh_gen,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class AutorisationsEnBase implements DepotAutorisations {
  constructor(private readonly pool: pg.Pool) {}

  async remplacer(n: NouvelleAutorisation): Promise<Autorisation> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      await client.query(
        'delete from public.assistant_grants where user_id = $1 and client_key = $2',
        [n.userId, n.cleClient])
      const { rows } = await client.query<Ligne>(
        `insert into public.assistant_grants (user_id, client_key, client_name, assistant, expires_at)
         values ($1, $2, $3, $4, $5) returning ${COLONNES}`,
        [n.userId, n.cleClient, n.nomClient, n.assistant, n.expireLe])
      await client.query('commit')
      return versAutorisation(rows[0]!)
    }
    catch (erreur) {
      await client.query('rollback').catch(() => undefined)
      throw erreur
    }
    finally {
      client.release()
    }
  }

  async lire(id: string): Promise<Autorisation | null> {
    if (!UUID.test(id)) return null
    const { rows } = await this.pool.query<Ligne>(
      `select ${COLONNES} from public.assistant_grants where id = $1`, [id])
    return rows[0] ? versAutorisation(rows[0]) : null
  }

  async tourner(id: string, attendue: number): Promise<boolean> {
    if (!UUID.test(id)) return false
    const { rowCount } = await this.pool.query(
      `update public.assistant_grants set refresh_gen = refresh_gen + 1
       where id = $1 and refresh_gen = $2 and expires_at > now()`, [id, attendue])
    return rowCount === 1
  }

  async supprimer(id: string): Promise<void> {
    if (!UUID.test(id)) return
    await this.pool.query('delete from public.assistant_grants where id = $1', [id])
  }

  async noterUsage(id: string): Promise<void> {
    if (!UUID.test(id)) return
    await this.pool.query(
      `update public.assistant_grants set last_used_at = now()
       where id = $1 and (last_used_at is null or last_used_at < now() - interval '1 minute')`, [id])
  }
}
