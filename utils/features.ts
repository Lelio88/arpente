/**
 * Drapeaux de fonctionnalité : ce que l'application expose réellement à
 * l'utilisateur, indépendamment de ce que le code sait faire.
 *
 * Pourquoi un drapeau plutôt qu'une suppression : le puzzle AR est complet
 * côté code (`pages/ar/`, `components/ar/`, `composables/useImageTracking.ts`,
 * `stores/puzzle.ts`, `utils/arTransform.ts`). Ce qui manque est une donnée
 * de terrain : le fichier de reconnaissance d'image
 * `public/targets/meurtriere-01.mind`, compilé à partir de photos prises sur
 * place au château de Caen (procédure dans `a_faire.md`). Sans ce fichier, la
 * caméra s'ouvre et ne reconnaît jamais rien — un cul-de-sac pour un testeur,
 * et un motif de rejet côté store.
 *
 * Invariant : tant que `AR_PUZZLE_ENABLED` vaut `false`, aucun chemin de
 * navigation ne doit mener vers `/ar`. Les routes restent générées par le
 * build statique, mais l'application embarquée n'a pas de barre d'adresse :
 * personne ne les atteint.
 *
 * Pour rallumer : déposer les `.mind` dans `public/targets/`, repasser la
 * constante à `true`. Il n'y a rien d'autre à rebrancher.
 */
export const AR_PUZZLE_ENABLED = false
