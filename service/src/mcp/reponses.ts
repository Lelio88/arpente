/**
 * Mise en forme des réponses d'outil : des données en JSON lisible, ou un
 * refus rédigé pour l'assistant (`isError`). Une erreur interne n'atteint
 * jamais l'assistant : il reçoit une phrase générique, le détail va au
 * journal.
 */
import type { CallToolResult } from '@modelcontextprotocol/server'
import { journal, messageErreur } from '../journal'

export function donnees(valeur: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(valeur, null, 1) }] }
}

export function refus(message: string, details?: unknown): CallToolResult {
  const texte = details === undefined ? message : `${message}\n${JSON.stringify(details, null, 1)}`
  return { content: [{ type: 'text', text: texte }], isError: true }
}

/** Exécute le corps d'un outil : toute exception devient un refus générique. */
export async function protege(nom: string, corps: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await corps()
  }
  catch (erreur) {
    journal.erreur('outil_erreur', { outil: nom, message: messageErreur(erreur) })
    return refus("Arpente n'a pas pu répondre. Réessaie dans un instant.")
  }
}
