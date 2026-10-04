/**
 * Les groupes en base, lus et écrits au nom du membre (`commeMembre`) : la
 * RLS d'Arpente décide de tout ce qui est visible et permis. Les requêtes
 * reprennent celles de l'app (stores `group`, `vote`, `decision`) ; aucune
 * règle de plus ici, sinon la transaction unique de `arreter`.
 */
import type pg from 'pg'
import type { Ville } from '../contenu'
import type {
  DepotGroupes, DetailGroupe, ParcoursAEnregistrer, ResultatVote, ResumeGroupe,
} from '../mcp/groupes'
import { commeMembre } from './commeMembre'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface LigneGroupe {
  id: string
  name: string
  city: Ville
  status: 'voting' | 'decided'
  membres: string
}

function versResume(l: LigneGroupe): ResumeGroupe {
  return { id: l.id, nom: l.name, ville: l.city, statut: l.status, membres: Number(l.membres) }
}

const SELECT_GROUPE = `
  select g.id, g.name, g.city, g.status,
         (select count(*) from public.group_members c where c.group_id = g.id) as membres
  from public.groups g
  where exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())`

export class GroupesEnBase implements DepotGroupes {
  constructor(private readonly pool: pg.Pool) {}

  mesGroupes(userId: string): Promise<ResumeGroupe[]> {
    return commeMembre(this.pool, userId, async (c) => {
      const { rows } = await c.query<LigneGroupe>(`${SELECT_GROUPE} order by g.created_at desc limit 50`)
      return rows.map(versResume)
    })
  }

  detail(userId: string, groupeId: string): Promise<DetailGroupe | null> {
    if (!UUID.test(groupeId)) return Promise.resolve(null)
    return commeMembre(this.pool, userId, async (c) => {
      const { rows } = await c.query<LigneGroupe>(`${SELECT_GROUPE} and g.id = $1`, [groupeId])
      if (!rows[0]) return null
      const [membres, votes, envies, coches, decision] = await Promise.all([
        c.query<{ user_id: string, handle: string | null }>(
          `select m.user_id, p.handle from public.group_members m
           left join public.profiles p on p.id = m.user_id
           where m.group_id = $1 order by m.joined_at`, [groupeId]),
        c.query<{ poi_slug: string, user_id: string }>(
          'select poi_slug, user_id from public.poi_votes where group_id = $1', [groupeId]),
        c.query<{ user_id: string, target_poi_count: number | null, target_duration_minutes: number | null }>(
          'select user_id, target_poi_count, target_duration_minutes from public.preference_votes where group_id = $1',
          [groupeId]),
        c.query<{ poi_slug: string, user_id: string | null }>(
          'select poi_slug, user_id from public.visited_pois where group_id = $1 order by visited_at', [groupeId]),
        c.query<{ poi_slugs: string[], distance_meters: string | null, duration_seconds: string | null, decided_at: Date, decided_by: string | null }>(
          `select poi_slugs, distance_meters, duration_seconds, decided_at, decided_by
           from public.decided_routes where group_id = $1 order by decided_at desc limit 1`, [groupeId]),
      ])
      const approbations: Record<string, string[]> = {}
      for (const v of votes.rows) (approbations[v.poi_slug] ??= []).push(v.user_id)
      const d = decision.rows[0]
      return {
        ...versResume(rows[0]),
        pseudos: membres.rows.map(m => ({ id: m.user_id, pseudo: m.handle ?? '?', moi: m.user_id === userId })),
        approbations,
        envies: envies.rows.map(e => ({ userId: e.user_id, nombre: e.target_poi_count, duree: e.target_duration_minutes })),
        coches: coches.rows.map(v => ({ slug: v.poi_slug, par: v.user_id })),
        parcoursArrete: d
          ? {
              etapes: d.poi_slugs,
              distanceMetres: d.distance_meters === null ? null : Number(d.distance_meters),
              dureeSecondes: d.duration_seconds === null ? null : Number(d.duration_seconds),
              arreteLe: d.decided_at.toISOString(),
              par: d.decided_by,
            }
          : null,
      }
    })
  }

  voter(userId: string, groupeId: string, slug: string): Promise<ResultatVote> {
    return commeMembre(this.pool, userId, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.poi_votes (group_id, user_id, poi_slug) values ($1, auth.uid(), $2)
         on conflict (group_id, user_id, poi_slug) do nothing`, [groupeId, slug])
      return rowCount === 1 ? 'fait' : 'deja'
    })
  }

  retirer(userId: string, groupeId: string, slug: string): Promise<ResultatVote> {
    return commeMembre(this.pool, userId, async (c) => {
      const { rowCount } = await c.query(
        'delete from public.poi_votes where group_id = $1 and user_id = auth.uid() and poi_slug = $2',
        [groupeId, slug])
      return rowCount === 1 ? 'fait' : 'deja'
    })
  }

  regler(userId: string, groupeId: string, nombre: number | null, duree: number | null)
    : Promise<{ nombre: number | null, duree: number | null }> {
    return commeMembre(this.pool, userId, async (c) => {
      const { rows } = await c.query<{ target_poi_count: number | null, target_duration_minutes: number | null }>(
        `insert into public.preference_votes (group_id, user_id, target_poi_count, target_duration_minutes)
         values ($1, auth.uid(), $2, $3)
         on conflict (group_id, user_id) do update set
           target_poi_count = coalesce(excluded.target_poi_count, public.preference_votes.target_poi_count),
           target_duration_minutes = coalesce(excluded.target_duration_minutes, public.preference_votes.target_duration_minutes),
           updated_at = now()
         returning target_poi_count, target_duration_minutes`, [groupeId, nombre, duree])
      return { nombre: rows[0]?.target_poi_count ?? null, duree: rows[0]?.target_duration_minutes ?? null }
    })
  }

  arreter(userId: string, groupeId: string, ville: Ville, p: ParcoursAEnregistrer): Promise<void> {
    return commeMembre(this.pool, userId, async (c) => {
      await c.query(
        `insert into public.decided_routes
           (group_id, poi_slugs, city, target_poi_count, target_duration_minutes, distance_meters, duration_seconds, decided_by)
         values ($1, $2, $3, $4, $5, $6, $7, auth.uid())`,
        [groupeId, p.etapes, ville, p.nombreVise, p.dureeVisee, p.distanceMetres, p.dureeSecondes])
      // Le statut suit la décision, dans la même transaction : jamais un
      // groupe « decided » sans parcours, ni un parcours sans le statut.
      const { rowCount } = await c.query(
        `update public.groups set status = 'decided' where id = $1`, [groupeId])
      if (rowCount !== 1) throw new Error('statut du groupe non modifié')
    })
  }
}
