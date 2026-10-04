/**
 * Journal du service : une ligne JSON par événement, sur la sortie standard
 * (Docker la garde et la fait tourner).
 *
 * Invariant : on n'y écrit jamais d'adresse e-mail, de jeton, de code, de
 * corps de requête ni de secret — seulement des noms d'événements et des
 * identifiants techniques. L'appelant passe des champs choisis, jamais un
 * objet de requête entier.
 */

type Niveau = 'info' | 'avertissement' | 'erreur'
type Champs = Record<string, string | number | boolean | undefined>

function ecrire(niveau: Niveau, evenement: string, champs: Champs = {}): void {
  const ligne = JSON.stringify({ ts: new Date().toISOString(), niveau, evenement, ...champs })
  if (niveau === 'erreur') process.stderr.write(ligne + '\n')
  else process.stdout.write(ligne + '\n')
}

/** Message d'une erreur, sans pile ni valeur de paramètre. */
export function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message.slice(0, 300) : 'erreur inconnue'
}

export const journal = {
  info: (evenement: string, champs?: Champs) => ecrire('info', evenement, champs),
  avertissement: (evenement: string, champs?: Champs) => ecrire('avertissement', evenement, champs),
  erreur: (evenement: string, champs?: Champs) => ecrire('erreur', evenement, champs),
}
