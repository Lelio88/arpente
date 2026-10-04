/**
 * Une transaction AU NOM d'un membre : le service, connecté sous
 * `arpente_assistant`, endosse `authenticated` le temps d'une transaction et
 * pose les claims du membre. La RLS et les politiques des groupes
 * s'appliquent alors exactement comme à l'app. Modèle : Agora,
 * `worker/assistant/pgstore.go` (`asUser`).
 *
 * Choix non évidents :
 * - `SET LOCAL` : le rôle et les claims tombent avec la transaction, une
 *   connexion rendue au pool ne garde rien du membre précédent ;
 * - claims `{sub, role, aud, is_anonymous: false}` sans `client_id` : seuls
 *   des comptes reçoivent un accès d'assistant (vérifié à l'accord), et la
 *   politique « compte requis » exige `is_anonymous = false` ;
 * - `statement_timeout` local : `SET ROLE` n'hérite pas du délai de PostgREST.
 *
 *   await commeMembre(pool, userId, async (client) => client.query('select …'))
 */
import type pg from 'pg'

const DELAI_REQUETE = '8s'

export async function commeMembre<T>(
  pool: pg.Pool,
  userId: string,
  travail: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role authenticated')
    await client.query(
      `select set_config('request.jwt.claims', $1, true), set_config('statement_timeout', $2, true)`,
      [JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', is_anonymous: false }), DELAI_REQUETE])
    const resultat = await travail(client)
    await client.query('commit')
    return resultat
  }
  catch (erreur) {
    await client.query('rollback').catch(() => undefined)
    throw erreur
  }
  finally {
    client.release()
  }
}
