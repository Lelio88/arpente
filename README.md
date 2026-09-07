# Arpente — Guide de visite interactif (actuellement : Caen)

Application mobile de visite guidee de Caen combinant geolocalisation, parcours thematiques, fiches historiques contextuelles et un mini-jeu en realite augmentee inspire de *The Witness* au Chateau de Caen.

## Stack technique

| Technologie | Role |
|-------------|------|
| **Nuxt 3** | Framework Vue.js, generation statique (SSG) |
| **TypeScript** | Typage statique |
| **Nuxt Content v2** | Gestion du contenu (POI, parcours, puzzles) en Markdown/YAML |
| **Capacitor** | Encapsulation native (iOS/Android) — acces camera, GPS |
| **Leaflet** | Carte interactive avec tuiles offline |
| **Canvas API** | Rendu du puzzle AR (overlay camera + tracking tactile) |
| **Pinia** | Store global (progression puzzles, parcours actif, preferences) |
| **VueUse** | Composables utilitaires (geolocation, device orientation, etc.) |
| **Service Worker** | Cache offline des assets et tuiles cartographiques |

## Fonctionnalites

### 1. Carte interactive avec POI

Carte plein ecran centree sur Caen avec les points d'interet :

- **Monuments** : Chateau de Caen, Abbaye aux Hommes, Abbaye aux Dames, Eglise Saint-Pierre, Eglise Saint-Jean, Tour Leroy...
- **Lieux historiques WW2** : Memorial de Caen, vestiges des bombardements...
- **Architecture** : Hotel de ville, Maison a pans de bois, Quartier Vaugueux...
- **Gastronomie** : Marches, restaurants typiques, cidreries...

Chaque POI est represente par un marqueur categorise (icone + couleur par theme). La position GPS de l'utilisateur est affichee en temps reel.

### 2. Parcours thematiques

Des itineraires guides reliant plusieurs POI :

| Parcours | Description |
|----------|-------------|
| **Caen Medieval** | Chateau, abbayes, eglises, remparts |
| **Caen 39-45** | Memorial, lieux de la Liberation, vestiges |
| **Architecture & Patrimoine** | Batiments remarquables, hotels particuliers |
| **Caen Gourmand** | Marches, specialites normandes, bonnes adresses |
| **Balade romantique** | Parcours special avec les plus beaux points de vue |

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
caen-visite/
├── nuxt.config.ts
├── capacitor.config.ts
├── app.vue
├── assets/
│   ├── styles/
│   │   ├── main.scss
│   │   └── variables.scss
│   ├── icons/                    # Icones des marqueurs par categorie
│   └── tiles/                    # Tuiles Leaflet pre-telechargees (offline)
├── components/
│   ├── map/
│   │   ├── MapView.vue           # Carte Leaflet principale
│   │   ├── PoiMarker.vue         # Marqueur individuel
│   │   ├── RoutePolyline.vue     # Trace d'un parcours
│   │   └── UserPosition.vue      # Marqueur position GPS
│   ├── poi/
│   │   ├── BottomSheet.vue       # Volet coulissant (peek/half/full)
│   │   ├── PoiCard.vue           # Resume d'un POI
│   │   └── PoiDetail.vue         # Fiche historique complete
│   ├── route/
│   │   ├── RouteList.vue         # Liste des parcours thematiques
│   │   ├── RouteCard.vue         # Card d'un parcours
│   │   └── RouteTracker.vue      # Suivi de progression dans un parcours
│   ├── ar/
│   │   ├── ArCamera.vue          # Flux camera + overlay Canvas
│   │   ├── PuzzleOverlay.vue     # Overlay du puzzle (Canvas 2D)
│   │   ├── PuzzleStartPoint.vue  # Cercle de depart animee
│   │   └── PuzzleSuccess.vue     # Animation de reussite
│   └── ui/
│       ├── AppHeader.vue
│       ├── AppNavbar.vue
│       └── ProximityAlert.vue    # Notification d'approche d'un POI
├── composables/
│   ├── useGeolocation.ts         # Position GPS + watch
│   ├── useProximity.ts           # Detection de proximite avec les POI
│   ├── usePuzzle.ts              # Logique du puzzle (validation trace, score)
│   ├── useCamera.ts              # Acces camera via Capacitor
│   └── useOfflineTiles.ts        # Gestion du cache de tuiles
├── content/
│   ├── pois/                     # Fichiers Markdown par POI
│   │   ├── chateau-de-caen.md
│   │   ├── abbaye-aux-hommes.md
│   │   ├── eglise-saint-pierre.md
│   │   └── ...
│   ├── routes/                   # Parcours thematiques en YAML
│   │   ├── medieval.yaml
│   │   ├── ww2.yaml
│   │   ├── architecture.yaml
│   │   ├── gourmand.yaml
│   │   └── romantique.yaml
│   └── puzzles/                  # Definition des puzzles AR
│       ├── meurtriere-01.yaml
│       ├── meurtriere-02.yaml
│       └── ...
├── layouts/
│   ├── default.vue               # Layout principal (carte)
│   └── ar.vue                    # Layout mode AR (plein ecran camera)
├── pages/
│   ├── index.vue                 # Carte principale
│   ├── routes/
│   │   ├── index.vue             # Liste des parcours
│   │   └── [slug].vue            # Detail d'un parcours
│   ├── poi/
│   │   └── [slug].vue            # Fiche complete d'un POI
│   └── ar/
│       ├── index.vue             # Ecran d'intro AR au Chateau
│       └── puzzle/[id].vue       # Puzzle individuel
├── stores/
│   ├── puzzle.ts                 # Progression des puzzles (Pinia)
│   ├── route.ts                  # Parcours actif et progression
│   └── preferences.ts            # Preferences utilisateur
├── public/
│   └── images/
│       └── pois/                 # Photos des POI
└── server/                       # Vide en SSG — pas de server routes
```

## Format des donnees

### POI (`content/pois/*.md`)

```markdown
---
title: Chateau de Caen
slug: chateau-de-caen
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

```yaml
title: Caen Medieval
slug: medieval
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
git clone <repo-url>
cd caen-visite

# Installer les dependances
npm install

# Lancement en dev
npm run dev

# Generation statique (offline)
npm run generate

# Ajout de Capacitor (mobile)
npx cap init "Caen Visite" com.caenvisite.app
npx cap add android
npx cap add ios

# Build + sync mobile
npm run generate
npx cap sync
npx cap open android   # ou ios
```

## Telecharger les tuiles offline

Pour le mode offline, les tuiles de la carte doivent etre pre-telechargees :

```bash
# Script a creer pour telecharger les tuiles OpenStreetMap
# Zone : Caen centre (~49.17-49.20 lat, -0.40--0.34 lng)
# Zoom levels : 13 a 18
npm run download-tiles
```

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
