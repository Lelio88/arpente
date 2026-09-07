# CLAUDE.md — Caen Visite

## Contexte

Application mobile personnelle de visite guidee de Caen. Utilisee par 2 personnes (pas de gestion multi-utilisateurs, pas d'auth). L'objectif est de proposer une experience immersive combinant carte, contenus historiques et un mini-jeu AR au Chateau de Caen.

## Commandes

```bash
npm run dev              # Serveur de dev Nuxt
npm run build            # Build production
npm run generate         # Generation statique SSG (offline)
npx cap sync             # Synchroniser le build avec Capacitor
npx cap open android     # Ouvrir le projet Android Studio
npx cap open ios         # Ouvrir le projet Xcode
npm run download-tiles   # Telecharger les tuiles offline
```

## Stack et conventions

### Framework
- **Nuxt 3** avec generation statique (SSG) — `nuxt generate`
- **Vue 3 Composition API** exclusivement — pas d'Options API
- **TypeScript** strict partout — pas de `any`, typer les props, les emits, les composables
- **`<script setup lang="ts">`** pour tous les composants

### Style
- **SCSS** avec variables dans `assets/styles/variables.scss`
- Approche **mobile-first** — l'app est concue pour smartphone uniquement
- Pas de framework CSS (pas de Tailwind, pas de Vuetify) — CSS custom leger
- Unites en `rem` pour les tailles, viewport units pour les layouts plein ecran

### Etat
- **Pinia** pour l'etat global (progression puzzles, parcours actif)
- **Composables** (`use*.ts`) pour la logique reutilisable
- Pas de Vuex, pas de provide/inject pour l'etat global

### Contenu
- **Nuxt Content v2** — fichiers Markdown (POI) et YAML (parcours, puzzles) dans `content/`
- Pas de base de donnees, pas d'API externe
- Tout le contenu est embarque dans le build statique

## Architecture des composants

### Carte (`components/map/`)
- `MapView.vue` : composant principal, initialise Leaflet, gere les layers
- Les marqueurs sont crees dynamiquement a partir des POI du content
- Le trace des parcours utilise `L.polyline` avec les coordonnees des POI ordonnes
- Les tuiles offline sont servies depuis `assets/tiles/` via un custom tile layer

### Bottom Sheet (`components/poi/BottomSheet.vue`)
- 3 etats : `peek` (60px), `half` (40vh), `full` (90vh)
- Transition par gesture (drag) ou programmatique
- Se declenche via `useProximity` quand l'utilisateur entre dans le rayon d'un POI
- Contenu charge dynamiquement depuis Nuxt Content via le slug du POI

### Systeme AR / Puzzle (`components/ar/`)

**Flux technique :**
1. `ArCamera.vue` ouvre le flux camera (`getUserMedia` ou Capacitor Camera)
2. Un `<canvas>` est superpose en position absolue sur le `<video>`
3. `PuzzleOverlay.vue` dessine le point de depart (cercle pulse) et le chemin de reference (invisible ou semi-transparent)
4. Au `touchstart` sur le cercle de depart, le tracking commence
5. A chaque `touchmove`, le composable `usePuzzle.ts` :
   - Ajoute le point au trace de l'utilisateur
   - Dessine le segment colore sur le canvas (avec effet glow)
   - Calcule la distance entre le point et le chemin attendu
   - Si la distance depasse `tolerance` → echec (vibration + reset)
6. Au `touchend`, si le trace atteint le point final → succes

**Coordonnees des puzzles :**
- Les puzzles utilisent des coordonnees **relatives au viewport** (0-1)
- Le chemin est defini en YAML dans `content/puzzles/`
- Pas de reconnaissance d'image — le puzzle est positionne de maniere fixe a l'ecran
- L'utilisateur doit aligner visuellement la meurtriere avec l'overlay

**Rendu Canvas :**
- Ligne principale : `ctx.lineWidth`, `ctx.strokeStyle` avec la couleur du puzzle
- Effet glow : deuxieme passe avec `ctx.shadowBlur` et `ctx.shadowColor`
- Point de depart : cercle anime (pulsation via `requestAnimationFrame`)
- Succes : animation de particules ou flash lumineux

### Composables cles

| Composable | Responsabilite |
|------------|----------------|
| `useGeolocation` | Wrapper autour de `@vueuse/core` useGeolocation + Capacitor Geolocation |
| `useProximity` | Compare position GPS avec les coordonnees des POI, emet quand on entre dans un rayon |
| `usePuzzle` | Machine a etat du puzzle : idle → tracking → success/fail. Gere le scoring et la tolerance |
| `useCamera` | Abstraction camera (web API vs Capacitor selon la plateforme) |
| `useOfflineTiles` | Chargement des tuiles depuis le cache local, fallback reseau |

## Structure du contenu

```
content/
├── pois/          # Un fichier .md par point d'interet
│   └── *.md       # Frontmatter YAML (coords, categorie, epoque) + corps Markdown
├── routes/        # Un fichier .yaml par parcours thematique
│   └── *.yaml     # Liste ordonnee de slugs de POI + metadata du parcours
└── puzzles/       # Un fichier .yaml par puzzle de meurtriere
    └── *.yaml     # Coordonnees du chemin, tolerance, messages, recompense
```

## Decisions d'architecture

### Pourquoi pas Strapi ?
Contenu statique + offline-first + usage personnel = Nuxt Content suffit. Strapi ajouterait un serveur a heberger et maintenir sans benefice reel. Si le projet evolue vers du public, Strapi restera une option.

### Pourquoi pas un framework AR (AR.js, 8th Wall) ?
Le puzzle ne necessite pas de detection de surface ni de tracking 3D. C'est un overlay 2D interactif sur un flux camera. Canvas API + gestion tactile couvrent le besoin. Ajouter un framework AR serait de la complexite inutile.

### Pourquoi Leaflet et pas Mapbox ?
Leaflet est gratuit, sans cle API, leger, et les tuiles OSM sont telechargables pour le mode offline. Mapbox est plus joli mais payant et complexe a cacher pour l'offline.

### Pourquoi Capacitor et pas une PWA pure ?
L'acces camera pour l'AR est plus fiable en natif. La geolocalisation en arriere-plan aussi. Capacitor encapsule le build Nuxt sans changer le code — c'est un ajout, pas un remplacement.

## Regles pour Claude

- Toujours utiliser `<script setup lang="ts">`
- Pas de `any` TypeScript — definir des interfaces pour les POI, Route, Puzzle
- Les composables retournent des `ref` / `computed` / fonctions, jamais des valeurs brutes
- Le contenu Nuxt Content est type via `queryContent<T>()` avec des interfaces
- Les coordonnees GPS utilisent le type `{ lat: number; lng: number }`
- Les coordonnees de puzzle utilisent le type `{ x: number; y: number }` (relatif 0-1)
- Nommage des fichiers : `kebab-case` pour tout (composants, composables, content)
- Nommage des composants dans le template : `PascalCase`
- Les stores Pinia utilisent la syntaxe `defineStore` avec setup function
- Pas de logique metier dans les composants — deleguer aux composables et stores
- Chaque composant a un seul role clair (SRP)
- Les textes de l'UI sont en francais
