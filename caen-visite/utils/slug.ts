/**
 * Extraire le nom du fichier depuis le stem Nuxt Content v3.
 * Ex: "pois/chateau-de-caen" -> "chateau-de-caen"
 */
export function slugFromStem(stem: string): string {
  return stem.includes('/') ? stem.split('/').pop()! : stem
}
