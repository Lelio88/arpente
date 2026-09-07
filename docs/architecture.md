# Architecture d'Arpente

## Vue d'ensemble

Arpente est une application Nuxt **générée en statique** puis encapsulée par Capacitor. Il n'existe aucun serveur applicatif : le contenu éditorial (points d'intérêt, parcours, anecdotes, puzzles) est compilé dans le bundle par Nuxt Content, les tuiles cartographiques sont pré-téléchargées sur le disque, et la progression individuelle vit en `localStorage`. Cette contrainte est délibérée — l'app doit fonctionner **au milieu d'une rue, sans réseau**.

Une seule brique est en ligne, et elle est **facultative** : Supabase porte les groupes de visite (session anonyme, pseudo, adhésion par code, roster). Le client Supabase n'est instancié que si l'URL et la clé sont configurées ; sinon `useSupabase()` lève, seules les pages `/groups` en souffrent, et le reste de l'app est intact.

Le code ne connaît aucune ville en particulier : une ville est une entrée de `CITIES` plus du contenu tagué. Ajouter une troisième ville ne demande pas une ligne de logique.

## Diagramme des couches

```
                       ┌──────────────────────────────────────────┐
   Coque native        │  Capacitor 8 (Android / iOS)             │
   (facultative,       │  caméra · géoloc · haptique · Preferences│
    le web fonctionne) └────────────────────┬─────────────────────┘
                                            │ WebView, charge .output/public
   ┌────────────────────────────────────────▼─────────────────────┐
   │  pages/       index · routes · poi · tips · ar · groups      │
   │  layouts/     default (carte + switcher) · ar (caméra)       │
   ├──────────────────────────────────────────────────────────────┤
   │  components/  map · poi · route · ar · group · ui            │
   ├───────────────────────────┬──────────────────────────────────┤
   │  composables/  capteurs   │  stores/  état global (Pinia)    │
   │  géoloc · proximité       │  city · route · puzzle           │
   │  caméra · tracking · OSRM │  auth · group                    │
   ├───────────────────────────┴──────────────────────────────────┤
   │  utils/  fonctions pures — geo · voteAggregation · slug      │
   │          arTransform  (aucun import Vue, aucun accès réseau) │
   └───────┬───────────────────────┬──────────────────────┬───────┘
           │                       │                      │
   ┌───────▼────────┐   ┌──────────▼─────────┐   ┌────────▼────────┐
   │ Nuxt Content 3 │   │ public/tiles/ +    │   │ Supabase        │
   │ content/*.md   │   │ Service Worker PWA │   │ (facultatif)    │
   │ content/*.yaml │   │ tuiles · OSRM      │   │ auth · RLS · RT │
   │ → dans le build│   │ → hors ligne       │   │ → groupes       │
   └────────────────┘   └────────────────────┘   └─────────────────┘
```

Le sens de dépendance descend toujours : une page peut appeler un store et un composable, un store peut appeler `utils/` et Supabase, mais `utils/` n'importe **rien** — c'est la couche vérifiable à la main, sans harnais.

## Catalogue des modules

| Dossier | Rôle |
|---|---|
| `components/map/` | `MapView.client.vue` (Leaflet, client-only : Leaflet touche au `window` dès le montage) et la flèche de direction vers le prochain POI |
| `components/poi/` | `BottomSheet.vue` — volet à trois positions (`peek` / `half` / `full`), déclenché par la proximité |
| `components/route/` | Carte de parcours, checklist des étapes, suivi de progression |
| `components/ar/` | Flux caméra, reconnaissance de cible MindAR, overlay Canvas du tracé, animation de réussite |
| `components/group/` | Création et adhésion d'un groupe, demande de pseudo, liste des membres, vote sur les POI (`PoiVoteList`) et préférences de parcours (`PreferenceForm`) |
| `components/ui/` | Barre de navigation, sélecteur de ville, écran de démarrage |
| `content/` | 151 POI, 12 parcours, 8 tips, 1 puzzle — la donnée éditoriale, versionnée avec le code |
| `scripts/` | Hors-app : téléchargement des tuiles OSM, compilation des cibles AR |

## Composables — capteurs et logique réutilisable

| Composable | Rôle |
|---|---|
| `useGeolocation` | Position GPS suivie en continu |
| `useProximity` | Compare la position aux POI de la ville active, retient le plus proche **dans son `proximityRadius`**, et vibre à l'entrée dans le rayon |
| `useRouting` | Itinéraire piéton via l'OSRM public, avec anti-rebond ; le service worker met les réponses en cache 7 jours |
| `useCamera` | `getUserMedia` en caméra arrière — exige un contexte sécurisé (HTTPS), d'où les certificats de développement |
| `useImageTracking` | Enveloppe MindAR : détection de la cible, matrices `modelView` et `projection` |
| `usePuzzle` | Machine à états du tracé : `idle → scanning → tracking → success/fail`, tolérance et validation |
| `useSupabase` | Renvoie le client injecté par le plugin, ou lève si Supabase n'est pas configuré |

Le store `vote` porte en plus l'abonnement Realtime : un seul canal ouvert à la fois, fermé au démontage de la page. Sans cette discipline, changer de groupe accumule les abonnements et les événements arrivent en double.

## Stores — état global

| Store | Contenu | Persistance |
|---|---|---|
| `city` | Ville active et sa configuration (`CITIES` : centre, zoom, libellé) | `localStorage` (`arpente-city`) |
| `route` | Parcours actif, index de l'étape, POI déjà visités | mémoire |
| `puzzle` | Identifiants des puzzles résolus | `localStorage` |
| `auth` | Session anonyme Supabase, pseudo (`profiles.handle`) | Supabase + Preferences (natif) |
| `group` | Groupes du membre, groupe courant, roster | Supabase |
| `vote` | Approbations par POI, préférences de chaque membre, canal temps réel | Supabase + WebSocket |

## Utilitaires purs

| Fichier | Rôle |
|---|---|
| `geo.ts` | Distance haversine — base de la proximité et de l'ordonnancement |
| `slug.ts` | Extrait le slug du `stem` Nuxt Content v3 (`pois/chateau-de-caen` donne `chateau-de-caen`) |
| `arTransform.ts` | Projette un point de la cible (0-1) vers l'écran via les matrices MindAR |
| `voteAggregation.ts` | Agrège les votes d'un groupe : approbation par POI, **médiane** des préférences de nombre et de durée, puis ordonnancement au plus proche voisin |

## Système multi-ville

- `City = 'caen' | 'troyes'` (`types/index.ts`) ; `city` est **obligatoire** sur `Poi`, `RouteThematic` et `Tip`.
- `CITIES` (`stores/city.ts`) déclare centre et zoom ; `MapView.client.vue` les reçoit en props et recentre quand ils changent.
- Toute page listant du contenu filtre sur `doc.meta?.city === cityStore.currentCity`.
- L'onglet AR est masqué hors de Caen — le puzzle est propre au château.
- Le store démarre **toujours** sur `caen` et n'est hydraté depuis `localStorage` qu'au `onMounted` du layout : le rendu statique n'a pas accès au stockage, un état initial divergent casserait l'hydratation.
- Les tuiles des deux villes cohabitent dans `public/tiles/` : la numérotation `{z}/{x}/{y}` d'OpenStreetMap est globale, deux villes distantes ne se chevauchent jamais.

**Ajouter une ville** : une entrée dans `CITIES`, du contenu tagué avec le nouveau slug, ses bornes dans `CITY_BOUNDS` (`scripts/download-tiles.ts`), puis `npm run download-tiles -- <ville>`.

## Modèle de données du vote de groupe

Le backend n'est **pas** un projet Supabase cloud : le plan gratuit plafonne à deux projets actifs par utilisateur, et DewDrop et DeckHand les occupent. Arpente tourne donc sur une stack Supabase **auto-hébergée** sur le serveur Hetzner, derrière `api.arpente.heianenterprise.com`. L'API est identique — même `supabase-js`, mêmes politiques, même schéma. Détails d'exploitation : `INFRASTRUCTURE.md` du conteneur `Projets/`.

`supabase/schema.sql` est appliqué **à la main** sur cette base — le projet n'utilise pas d'outil de migration. Le fichier décrit l'état cible du schéma ; toute évolution s'y ajoute et se rejoue.

| Table | Rôle |
|---|---|
| `profiles` | Pseudo attaché à l'utilisateur anonyme ; unicité insensible à la casse |
| `groups` | Groupe de visite : code d'invitation, ville, statut `voting` / `decided` |
| `group_members` | Roster (clé primaire composite) |
| `poi_votes` | Vote d'approbation : une ligne = un membre approuve un POI |
| `preference_votes` | Une ligne par membre : nombre de POI et durée souhaités |
| `visited_pois` | Checklist partagée — n'importe quel membre coche pour le groupe |
| `decided_routes` | Instantané immuable d'un parcours décidé ; une nouvelle décision = une nouvelle ligne |

Trois fonctions `security definer` portent la logique sensible : `generate_join_code()` (alphabet sans `O`/`0` ni `I`/`1`, ambigus à l'oral), `preview_group_by_code()` et `join_group_by_code()` — elles permettent de rejoindre un groupe **sans exposer la table `groups` en lecture**. `is_group_member()` est également `security definer` : une policy sur `group_members` qui se référencerait elle-même provoquerait une récursion RLS.

`utils/voteAggregation.ts` implémente l'agrégation complète ; l'écran de groupe affiche le roster et n'appelle pas cette fonction.

### Deux pièges que seul un essai réel révèle

**Une variable PL/pgSQL ne doit jamais porter le nom d'une colonne.** `generate_join_code()` déclarait `code text` en regard de `groups.code` : Postgres refuse l'ambiguïté avec `42702` plutôt que de choisir, et **toute création de groupe échouait**. D'où le préfixe `v_` — convention déjà suivie par `join_group_by_code`.

**Le créateur doit pouvoir relire son groupe.** Le client fait `.insert(…).select().single()`, et ce `RETURNING` exige que la ligne soit lisible **immédiatement**. Or l'adhésion du créateur intervient à l'appel suivant : une policy limitée à `is_group_member(id)` rendait donc la ligne invisible à celui qui venait de l'écrire, et Postgres rejetait l'insertion entière. La clause `or created_by = auth.uid()` ferme le trou — sans elle, personne ne peut connaître le code d'invitation de son propre groupe.

Les deux bugs ont survécu à la relecture et au typage : ils ne vivent ni dans le TypeScript ni dans le SQL isolément, mais dans leur rencontre à l'exécution.

### Suppression d'un compte

`groups.created_by` référence `profiles(id)` **sans `on delete`**. Un profil ayant créé un groupe ne peut donc pas être supprimé tant que le groupe existe. C'est protecteur — aucun groupe ne perd son créateur par accident — mais cela veut dire qu'une suppression de compte devra traiter les groupes créés avant de retirer le profil.

## Flux typique — rejoindre un groupe par son code

1. L'utilisateur ouvre `/groups/<CODE>`. La route est en `ssr: false` (`routeRules`) : un code créé après le build ne peut pas être pré-rendu.
2. `authStore.ensureSession()` reprend la session Supabase ou crée une **session anonyme** ; le jeton est stocké via `@capacitor/preferences` en natif (le `localStorage` d'une WebView peut être purgé sous pression mémoire), via le stockage par défaut sur le web.
3. Le profil est chargé ; sans pseudo, l'écran renvoie vers `/groups` pour en choisir un (`profiles` en upsert).
4. `previewGroupByCode()` appelle la fonction `security definer` : nom, ville, statut et nombre de membres, sans droit de lecture sur `groups`.
5. `join_group_by_code()` insère l'adhésion avec `auth.uid()`, en `on conflict do nothing`.
6. Dès l'adhésion, la RLS bascule : `is_group_member()` devient vrai, et le groupe, son roster et ses votes deviennent lisibles.
7. Le roster s'affiche ; les tables sont publiées dans `supabase_realtime`, l'arrivée d'un membre peut être poussée en direct.

## Flux typique — voter dans un groupe

1. La page du groupe charge les POI depuis Nuxt Content et les filtre sur **la ville du groupe** — pas sur la ville active du sélecteur : on ne vote pas sur des lieux de Caen dans un groupe formé à Troyes.
2. `voteStore.load()` reconstruit l'état depuis `poi_votes` et `preference_votes`, puis `subscribe()` ouvre un canal Realtime filtré sur `group_id`.
3. Cocher un lieu insère une ligne dans `poi_votes` ; décocher la supprime. La contrainte `(group_id, user_id, poi_slug)` rend l'opération idempotente — deux appareils qui cochent en même temps ne créent pas de doublon.
4. Realtime diffuse l'événement aux autres membres, **RLS comprise** : un non-membre abonné au même canal ne reçoit rien. Les compteurs se mettent à jour sans rechargement.
5. Les curseurs de préférences écrivent en `upsert` sur `(group_id, user_id)` après un anti-rebond de 600 ms — sans quoi un simple glissement produirait une dizaine d'écritures et autant de diffusions.
6. Si le canal ne s'ouvre pas, `isLive` passe à faux : l'interface l'affiche et propose un rafraîchissement manuel. Les votes restent enregistrés, seule la mise à jour spontanée disparaît.

**Le piège de l'upsert** : `.upsert(…, { onConflict: 'group_id,user_id' })` — sans `onConflict`, PostgREST vise la clé primaire, qui ne peut jamais entrer en conflit puisqu'elle est générée. L'insertion se heurte alors à la contrainte unique et rend un `409` au lieu de mettre à jour.

**Le piège du DELETE en Realtime** : un `DELETE` ne transporte que l'identité de réplique. Sans `REPLICA IDENTITY FULL`, l'événement ne porte que la clé primaire — pas le `poi_slug`. Le store recharge donc au lieu de deviner ; c'est le prix à payer pour ne pas alourdir le WAL de toutes les colonnes.

## Flux typique — une visite hors ligne

1. `layouts/default.vue` monte le sélecteur de ville et hydrate la ville mémorisée.
2. `pages/index.vue` interroge la collection `pois`, filtre sur la ville active, et passe centre et zoom à la carte.
3. Leaflet sert les tuiles depuis `public/tiles/` ; sur une zone non téléchargée, le service worker relaie vers OSM et met en cache 30 jours.
4. `useGeolocation` suit la position, `useProximity` détecte l'entrée dans le rayon d'un POI, vibre, et ouvre le bottom sheet.
5. Avec un parcours actif, `useRouting` trace l'itinéraire vers l'étape suivante — pré-chargé au démarrage par `plugins/precache-routes.client.ts`, ce qui rend les parcours navigables sans réseau.

## Patterns imposés

- **Client-only pour tout ce qui touche au navigateur.** Leaflet et la caméra vivent dans des composants `.client.vue` ou des plugins `.client.ts` ; le contraire casse la génération statique.
- **Le contenu passe par les collections.** `queryCollection('pois' | 'routes' | 'puzzles' | 'tips')`, déclarées dans `content.config.ts` ; pas de `fetch` sur les fichiers.
- **Les composables renvoient des `ref` / `computed` / fonctions**, jamais des valeurs brutes — sinon la réactivité est perdue au point d'appel.
- **Coordonnées** : `{ lat, lng }` pour le monde, `{ x, y }` relatif 0-1 pour les puzzles. Ne jamais mélanger les deux.
- **Nommage** : `kebab-case` pour les fichiers et les slugs, `PascalCase` pour les composants dans les templates, français pour les textes d'interface.
- **Style** : SCSS avec les variables de `assets/styles/variables.scss`, mobile-first, aucune bibliothèque CSS.

## Anti-patterns

- ❌ Envelopper un `.yaml` de `content/` dans des délimiteurs `---` — échec de parsing **silencieux**.
- ❌ Réutiliser un slug déjà pris par une autre ville : les POI partagent un espace de noms unique.
- ❌ Coder en dur des coordonnées, un zoom ou un nom de ville dans un composant.
- ❌ Appeler `useSupabase()` en dehors des pages de groupe, ou supposer un client non nul.
- ❌ Créer une table sans policy RLS **et** sans `grant` au rôle `authenticated` — les policies seules donnent un « permission denied for schema public ».
- ❌ Committer un `.env` ou un certificat `*.pem`.
- ❌ Mettre de la logique métier dans un composant plutôt que dans un composable, un store ou `utils/`.
- ❌ Ajouter une bibliothèque de réalité augmentée pour le tracé : le puzzle est un overlay Canvas 2D, MindAR ne sert qu'à reconnaître l'image.

## Stratégie de vérification

Le projet n'a **ni tests ni CI**. Trois filets seulement :

1. `npm run typecheck` (vue-tsc, TypeScript strict) — la vérification de référence avant tout commit.
2. `npm run generate` — un build statique qui passe prouve que le contenu parse et que rien de client-only n'a fuité côté serveur.
3. L'appareil — GPS, caméra, tracé tactile et vibration ne se valident nulle part ailleurs.

`utils/` est écrit en fonctions pures précisément pour rester vérifiable à la main ; c'est là qu'un premier harnais de tests aurait le meilleur rapport valeur/effort.

## Dépendances externes

| Service | Usage | Comportement en cas de défaillance |
|---|---|---|
| OpenStreetMap (tuiles) | Fond de carte | Tuiles pré-téléchargées ; en ligne, cache PWA de 30 jours |
| OSRM public (`router.project-osrm.org`) | Itinéraire piéton | Pré-chargé au démarrage, cache de 7 jours ; l'app reste utilisable sans tracé |
| Supabase | Groupes, pseudo, temps réel | Facultatif : sans configuration, seules les pages `/groups` sont hors service |
| Compilateur MindAR en ligne | Génération des fichiers `.mind` | Étape manuelle assumée : le paquet `canvas` dont dépend mind-ar ne compile pas sous Windows. `scripts/compile-targets.ts` documente la marche à suivre et vérifie la présence des fichiers. |

## Secrets et configuration

`.env` (gitignoré, modèle dans `.env.example`) porte `NUXT_PUBLIC_SUPABASE_URL` et `NUXT_PUBLIC_SUPABASE_ANON_KEY`, relayés par `runtimeConfig.public`. La copie maîtresse vit dans `.arpente-secrets/`, à la racine du conteneur `Projets/`, hors de tout dépôt. Le serveur de développement n'exige plus aucun certificat : il en génère un à la volée, valable pour les IP locales détectées. La règle `*.pem` du `.gitignore` ne couvre plus qu'un certificat fourni à la main.
