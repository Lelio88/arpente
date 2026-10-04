/**
 * Connexion à la base d'Arpente, sous le rôle `arpente_assistant`.
 *
 * Choix non évidents :
 * - un petit pool (5) : le service sert quelques assistants, pas une foule,
 *   et chaque connexion Postgres coûte de la mémoire sur un serveur partagé ;
 * - `statement_timeout` posé à la connexion : `SET ROLE` n'hérite pas du
 *   délai de PostgREST, une requête lente ne doit pas tenir une connexion.
 */
import pg from 'pg'

export function creerPool(urlBase: string): pg.Pool {
  return new pg.Pool({
    connectionString: urlBase,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
    application_name: 'arpente-service',
  })
}
