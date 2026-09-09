/**
 * Bornes geographiques des villes, pour l'outillage hors-app.
 *
 * Source unique partagee par `download-basemap.ts` (qui les traduit en bbox
 * d'extraction) et `check-basemap.ts` (qui verifie qu'aucune archive ne manque avant
 * un build). Sans ce module, les deux scripts divergeraient a la premiere ville ajoutee.
 *
 * A ne pas confondre avec `CITIES` du store `stores/city.ts`, qui porte le centre, le
 * zoom et le libelle affiches par l'application. Ici on ne decrit qu'une emprise : c'est
 * la seule chose dont l'extraction du fond de carte a besoin.
 *
 * Invariant : les slugs sont ceux de l'application (`City` dans `types/`), puisqu'ils
 * nomment les archives que le runtime va chercher — `public/basemaps/<slug>.pmtiles`.
 */

export interface Bounds {
  north: number
  south: number
  west: number
  east: number
}

export const CITY_BOUNDS: Record<string, Bounds> = {
  caen: {
    north: 49.205,
    south: 49.165,
    west: -0.405,
    east: -0.330,
  },
  troyes: {
    north: 48.320,
    south: 48.275,
    west: 4.045,
    east: 4.100,
  },
}
