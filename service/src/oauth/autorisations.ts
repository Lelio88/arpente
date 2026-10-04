/**
 * Les accès accordés à un assistant, vus par le serveur d'autorisation : un
 * port, dont la base (`src/base/autorisations.ts`) et les tests fournissent
 * chacun leur version.
 *
 * Invariants :
 * - un accès est lié à un compte ET à un client (son empreinte) : un jeton
 *   présenté par un autre client ne vaut rien ;
 * - un nouvel accord du même assistant pour le même compte remplace l'ancien ;
 * - `tourner` n'avance la génération que si elle vaut celle qu'on attend
 *   (comparer-échanger) : deux rafraîchissements concurrents avec le même
 *   jeton ne passent pas tous les deux.
 */

export interface Autorisation {
  id: string
  userId: string
  cleClient: string
  nomClient: string
  assistant: string
  creeLe: Date
  expireLe: Date
  generation: number
}

export interface NouvelleAutorisation {
  userId: string
  cleClient: string
  nomClient: string
  assistant: string
  expireLe: Date
}

export interface DepotAutorisations {
  /** Remplace l'accès de ce compte pour ce client, et rend le nouveau. */
  remplacer(nouvelle: NouvelleAutorisation): Promise<Autorisation>
  lire(id: string): Promise<Autorisation | null>
  /** Avance la génération si elle vaut `attendue` ; dit si c'est fait. */
  tourner(id: string, attendue: number): Promise<boolean>
  supprimer(id: string): Promise<void>
  /** Note un usage (au plus une écriture par minute et par accès). */
  noterUsage(id: string): Promise<void>
}
