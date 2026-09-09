# Arpente — Guide de visite interactif multi-ville

Application mobile de visite guidee combinant geolocalisation, parcours thematiques et fiches historiques contextuelles. Deux villes sont actuellement disponibles, selectionnables depuis l'app :

- **Caen** : POI historiques, parcours thematiques, et un mini-jeu en realite augmentee inspire de *The Witness* au Chateau de Caen
- **Troyes** : POI du centre historique (le "Bouchon de Champagne"), parcours thematiques — pas de volet AR (specifique au Chateau de Caen)

L'architecture est concue pour accueillir d'autres villes a l'avenir sans changement de code : il suffit d'ajouter le contenu (POI, parcours, tips) tague avec la bonne ville et de declarer son centre de carte.

## Stack technique

| Technologie | Role |
|-------------|------|
| **Nuxt 3** | Framework Vue.js, generation statique (SSG) |
| **TypeScript** | Typage statique |
| **Nuxt Content v2** | Gestion du contenu (POI, parcours, puzzles) en Markdown/YAML |
| **Capacitor** | Encapsulation native (iOS/Android) — acces camera, GPS |
| **Leaflet** | Carte interactive |
| **Protomaps / PMTiles** | Fond de carte vectoriel hors ligne, extrait d'OpenStreetMap |
| **Canvas API** | Rendu du puzzle AR (overlay camera + tracking tactile) |
| **Pinia** | Store global (progression puzzles, parcours actif, preferences) |
| **VueUse** | Composables utilitaires (geolocation, device orientation, etc.) |
| **Service Worker** | Cache offline des assets et du fond de carte |

## Fonctionnalites

### 0. Selecteur de ville

Une pastille en haut de l'ecran (`components/ui/CitySwitcher.vue`) permet de basculer entre les villes disponibles. Le choix est persiste en `localStorage` (`arpente-city`). Changer de ville :

- Recentre et re-zoome la carte sur la ville selectionnee (`stores/city.ts`)
- Filtre les POI, parcours et tips affiches (seul le contenu tague avec la ville active est rendu)
- Coupe tout parcours actif en cours (on ne navigue pas un parcours d'une ville depuis une autre)
- Masque l'onglet AR quand la ville active n'est pas Caen (fonctionnalite specifique au Chateau de Caen)

### 1. Carte interactive avec POI

Carte plein ecran centree sur la ville active avec ses points d'interet :

- **A Caen** : Chateau de Caen, Abbaye aux Hommes, Abbaye aux Dames, Eglise Saint-Pierre, Memorial de Caen, quartier Vaugueux...
- **A Troyes** : Cathedrale Saint-Pierre-et-Saint-Paul, ruelle des Chats, maison Rachi, Cite du Vitrail, Halles de Troyes...

Chaque POI est represente par un marqueur categorise (icone + couleur par theme : monument, eglise, ww2, architecture, gastronomie, romantique, musee). La position GPS de l'utilisateur est affichee en temps reel.

### 2. Parcours thematiques

Des itineraires guides reliant plusieurs POI, propres a chaque ville :

| Ville | Parcours |
|-------|----------|
| **Caen** | Caen Medieval · Caen 39-45 · Architecture & Patrimoine · Caen Gourmand · Balade Romantique · Le Grand Tour |
| **Troyes** | Troyes Medievale · Le Bouchon de Champagne (colombages) · Troyes et le Vitrail · Troyes Gourmande · Balade Romantique a Troyes · Le Grand Tour de Troyes |

Chaque parcours affiche un trace sur la carte (polyline), la distance totale, la duree estimee, et guide l'utilisateur de POI en POI.

### 3. Bottom sheet contextuel

Quand l'utilisateur s'approche d'un POI (rayon configurable, ~50m par defaut) :

- Un volet glisse depuis le bas de l'ecran (bottom sheet)
- Affiche : photo, nom, epoque, description historique
- Bouton "Visite complete" pour une fiche detaillee avec texte long, galerie photos, anecdotes
- Bouton "Suivant" si un parcours est actif

Le bottom sheet a 3 etats : **peek** (bandeau minimal), **half** (resume), **full** (visite complete).

### 4. Puzzle AR — "Les Meurtieres du Chateau"

Experience interactive au Chateau de Caen inspiree du jeu *The Witness* :

**Principe :**
1. L'utilisateur active le mode AR au Chateau
2. La camera du telephone s'ouvre avec un overlay
3. En visant une meurtriere, un point de depart (cercle) apparait en bas de la meurtriere
4. L'utilisateur pose son doigt sur le cercle et glisse vers le haut en suivant la forme de la meurtriere
5. Le trace du doigt est colore en temps reel (ligne neon/lumineuse)
6. Si le trace suit correctement le chemin attendu → validation avec animation de succes
7. Si le trace devie trop → feedback visuel d'erreur, on recommence

**Plusieurs meurtieres** a trouver et resoudre dans l'enceinte du chateau, formant une chasse au tresor. La progression est sauvegardee localement.

**Implementation technique :**
- Flux camera via Capacitor Camera / `getUserMedia`
- Overlay Canvas 2D par-dessus le flux video
- Detection du point de depart par positionnement fixe (pas de reconnaissance d'image)
- Tracking tactile (`touchstart`, `touchmove`, `touchend`) avec calcul de deviation par rapport au chemin attendu
- Chaque puzzle est defini par : coordonnees du point de depart, chemin attendu (serie de points), tolerance, et metadata

## Architecture du projet

```
.
├── nuxt.config.ts                # Nuxt 4, PWA, routeRules, runtimeConfig Supabase
├── capacitor.config.ts           # fr.arpente.app, webDir .output/public
├── content.config.ts             # Collections Nuxt Content (pois, routes, puzzles, tips)
├── app.vue
├── assets/
│   ├── styles/                   # main.scss, variables.scss
│   └── targets/raw/              # Images sources pour la reconnaissance AR (mind-ar)
├── components/
│   ├── ar/                       # ArCamera · ArTracker · PuzzleOverlay · PuzzleSuccess
│   ├── group/                    # CreateGroupModal · JoinGroupModal · GroupCard
│   │                             # GroupMemberList · HandlePrompt
│   ├── map/                      # MapView.client · DirectionArrow
│   ├── poi/                      # BottomSheet (peek/half/full)
│   ├── route/                    # RouteCard · RouteChecklist · RouteTracker
│   └── ui/                       # AppNavbar · CitySwitcher · SplashScreen
├── composables/                  # useGeolocation · useProximity · useRouting · useCamera
│                                 # useImageTracking · usePuzzle · useSupabase
├── content/
│   ├── pois/                     # Fiches .md, taguées city: caen|troyes
│   ├── routes/                   # Parcours .yaml, tagués city: caen|troyes
│   ├── tips/                     # Anecdotes .md, taguées city: caen|troyes
│   └── puzzles/                  # Puzzles AR .yaml (Caen uniquement)
├── layouts/
│   ├── default.vue               # Carte + CitySwitcher + navbar
│   └── ar.vue                    # Mode AR plein écran
├── pages/
│   ├── index.vue                 # Carte principale, filtrée par ville active
│   ├── routes/                   # Liste et détail d'un parcours
│   ├── poi/[slug].vue            # Fiche complète d'un POI
│   ├── tips/                     # Liste et détail des anecdotes
│   ├── ar/                       # Écran d'intro AR et puzzle individuel
│   └── groups/                   # Groupes et roster (rendu client, ssr: false)
├── plugins/
│   ├── supabase.client.ts        # Client Supabase — non créé si la config est absente
│   └── precache-routes.client.ts # Pré-charge les itinéraires OSRM pour l'usage hors ligne
├── scripts/                      # download-basemap · check-basemap · compile-targets
├── stores/                       # city · route · puzzle · auth · group (Pinia)
├── supabase/schema.sql           # Tables, RLS, fonctions security definer
├── types/index.ts                # Types du domaine partagés
├── utils/                        # geo · slug · arTransform · voteAggregation (fonctions pures)
├── public/basemaps/              # Fond de carte offline — créé par npm run download-basemap, non versionné
├── CLAUDE.md                     # Doctrine du projet et garde-fous
└── docs/architecture.md          # Annexe : couches, modules, flux, anti-patterns
```

## Format des donnees

### POI (`content/pois/*.md`)

Le champ `city` est obligatoire et determine dans quelle ville le POI apparait (carte, parcours, tips). Les slugs doivent rester uniques sur l'ensemble du projet, toutes villes confondues.

```markdown
---
title: Chateau de Caen
slug: chateau-de-caen
city: caen
category: monument
lat: 49.1847
lng: -0.3714
epoch: "XIe siecle"
builder: "Guillaume le Conquerant"
image: /images/pois/chateau-de-caen.jpg
tags: [medieval, incontournable, puzzle-ar]
proximityRadius: 80
---

Le chateau de Caen est l'une des plus grandes enceintes fortifiees d'Europe.
Fonde par Guillaume le Conquerant vers 1060, il domine la ville depuis pres
de mille ans...

## Anecdotes

- Le chateau abritait autrefois un palais ducal dont il ne reste que les fondations.
- Les meurtieres suivent un pattern defensif specifique lie aux angles de tir des archers.

## A ne pas manquer

- La salle de l'Echiquier (XIIe siecle)
- Les remparts et la vue panoramique sur Caen
- Le musee de Normandie et le musee des Beaux-Arts
```

### Parcours (`content/routes/*.yaml`)

**Important** : ces fichiers YAML ne doivent **pas** avoir de delimiteurs `---` (contrairement aux fichiers Markdown ci-dessus). Nuxt Content echoue silencieusement a parser le frontmatter des `.yaml` wrapes dans `---...---` : le titre retombe sur le nom de fichier et tous les champs (dont `pois`) sont vides. Les fichiers doivent commencer directement par `title:`.

Le champ `city` filtre le parcours par ville, au meme titre que pour les POI. Par convention, les fichiers Troyes sont prefixes `troyes-` (`troyes-medieval.yaml`, etc.) pour eviter toute collision de slug avec les parcours Caen.

```yaml
title: Caen Medieval
slug: medieval
city: caen
description: Plongez dans le Caen du Moyen Age, des abbayes fondees par Guillaume le Conquerant aux remparts du chateau.
duration: "2h30"
distance: "4.2 km"
difficulty: facile
color: "#8B4513"
pois:
  - slug: chateau-de-caen
    note: "Point de depart — montez sur les remparts pour la vue"
  - slug: eglise-saint-pierre
    note: "Chef-d'oeuvre du gothique flamboyant"
  - slug: abbaye-aux-hommes
    note: "Fondee par Guillaume, elle abrite sa tombe"
  - slug: abbaye-aux-dames
    note: "Fondee par Mathilde, epouse de Guillaume"
```

### Puzzles AR (`content/puzzles/*.yaml`)

```yaml
id: meurtriere-01
title: "Meurtriere de la Tour Nord"
location:
  lat: 49.1851
  lng: -0.3708
  hint: "Face nord, premiere tour a gauche en entrant"
difficulty: 1
path:
  startPoint: { x: 0.5, y: 0.85 }    # Position relative dans le viewport
  points:                                # Chemin a tracer (coordonnees relatives)
    - { x: 0.5, y: 0.85 }
    - { x: 0.5, y: 0.15 }
  tolerance: 30                          # Pixels de tolerance autour du chemin
  style:
    color: "#00FFAA"
    width: 6
    glowColor: "#00FFAA44"
    glowWidth: 20
successMessage: "Bravo ! Cette meurtriere permettait aux archers de couvrir l'angle mort de la courtine nord."
reward:
  type: anecdote
  text: "Les meurtieres du chateau de Caen sont parmi les mieux conservees de Normandie..."
```

## Installation

```bash
# Cloner le projet
git clone git@github.com:Lelio88/arpente.git Arpente
cd Arpente

# Installer les dependances
npm install

# Lancement en dev
npm run dev

# Generation statique (offline)
npm run generate

# Ajout de Capacitor (mobile)
npx cap init "Arpente" fr.arpente.app
npx cap add android
npx cap add ios

# Build + sync mobile
npm run generate
npx cap sync
npx cap open android   # ou ios
```

## Telecharger le fond de carte offline

Le fond de carte hors ligne est une archive **PMTiles** par ville, extraite du basemap
**Protomaps** — un produit derive d'OpenStreetMap publie sous ODbL. Le script accepte un
argument optionnel pour ne cibler qu'une ville ; sans argument, il extrait les deux :

```bash
npm run download-basemap              # Caen + Troyes
npm run download-basemap -- caen      # Caen uniquement
npm run download-basemap -- troyes    # Troyes uniquement
```

**Prerequis** : le binaire d'extraction `pmtiles` doit etre sur le `PATH`. Trois voies au
choix, la premiere etant la plus simple si Go est installe :

```bash
go install github.com/protomaps/go-pmtiles@latest
# ou un binaire depuis https://github.com/protomaps/go-pmtiles/releases
# ou docker run protomaps/go-pmtiles
```

Chaque ville produit un fichier d'environ 4 Mo dans `public/basemaps/`, obtenu en une
trentaine de requetes et quelques secondes. Le dossier n'est pas versionne (voir
`.gitignore`) : chaque environnement doit relancer le script. `npm run build` et
`npm run generate` s'arretent d'eux-memes si une archive manque.

**Pourquoi pas des tuiles raster OpenStreetMap** : la politique de la fondation OSM
interdit le telechargement en masse depuis `tile.openstreetmap.org`, et le service refuse
desormais les 1 649 requetes que demandait l'ancienne approche. Le rendu vectoriel a
d'ailleurs un avantage : les donnees s'arretent au zoom 15, mais la carte reste nette
jusqu'au zoom 19 par sur-zoom.

## Dependances principales

```json
{
  "nuxt": "^3.x",
  "@nuxt/content": "^2.x",
  "@capacitor/core": "^5.x",
  "@capacitor/camera": "^5.x",
  "@capacitor/geolocation": "^5.x",
  "leaflet": "^1.9.x",
  "@types/leaflet": "^1.9.x",
  "pinia": "^2.x",
  "@vueuse/core": "^10.x"
}
```

## Licence

Projet personnel — non destine a une distribution publique.
