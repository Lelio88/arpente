/**
 * Nettoyage des textes venus d'ailleurs (nom déclaré par un assistant,
 * pseudos, noms de groupe) avant de les montrer dans une page ou de les
 * remettre à un assistant.
 *
 * On retire les caractères de contrôle et de format — dont les surcharges
 * bidirectionnelles (U+202E…), qui retournent un texte à l'affichage —, on
 * ramène tout blanc, saut de ligne compris, à une espace simple, et on
 * borne la longueur en caractères (points de code), pas en octets.
 * Port de `plain()` de Lumis (apps/api/assistant/oauth.go).
 */
export function nettoyerTexte(texte: string, max: number): string {
  const sansControle = texte
    .replace(/\s/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
  const resserre = sansControle.split(' ').filter(Boolean).join(' ')
  return Array.from(resserre).slice(0, max).join('')
}

/** Forme de comparaison : minuscules, sans accents ni ponctuation. */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
