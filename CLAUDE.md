# Arpente — Contexte d'Opération et Garde-Fous Agentiques

Résolvez les problèmes sans introduire de régression ni de dette technique architecturale.

## I. Finalité

**Application** : Arpente (`fr.arpente.app`) — guide de visite interactif multi-ville, embarqué en app mobile.
**Objectif** : une carte, des parcours thématiques et des fiches historiques qui se déclenchent à la proximité GPS, utilisables **hors ligne** ; à Caen s'ajoute un mini-jeu de tracé en réalité augmentée sur les meurtrières du château. Deux villes sont livrées (Caen, Troyes) ; en accueillir une troisième relève du contenu, pas du code. Une couche de groupes en ligne (Supabase) permet à plusieurs visiteurs de préparer un parcours ensemble.

## II. Architecture

**Modèle** : application Nuxt monopage générée en statique (SSG), contenu en fichiers, état en stores Pinia, backend optionnel Supabase. Aucune couche serveur propre au projet.

**Détails complets** (diagramme des couches, catalogue des modules, flux d'une visite, modèle de données du vote, anti-patterns) : voir [`docs/architecture.md`](./docs/architecture.md).

Topologie rapide — le dépôt **est** l'application, sans sous-dossier intermédiaire :
- `content/` — POI (`.md`), parcours, tips et puzzles (`.yaml`) : la donnée éditoriale, embarquée dans le build
- `components/` — vues par domaine : `map/`, `poi/`, `route/`, `ar/`, `group/`, `ui/`
- `composables/` — capteurs et logique réutilisable (géoloc, proximité, caméra, tracking, itinéraire)
- `stores/` — état global Pinia : `city`, `route`, `puzzle`, `auth`, `group`, `vote`, `decision`, `groupRoute`
- `utils/` — fonctions pures sans dépendance Vue (géométrie, agrégation de votes, iCalendar, slugs), vérifiées par `verif/` ; **importer explicitement** entre fichiers d'`utils/` plutôt que de compter sur l'auto-import de Nuxt, sinon ils ne s'exécutent plus hors du runtime
- `supabase/schema.sql` — schéma, RLS et fonctions de la couche groupes
- `scripts/` — outillage hors-app : extraction du fond de carte, contrôle avant build, compilation des cibles AR
- `android/` — projet natif Capacitor, **versionné** : il porte les permissions, le `versionCode`, la signature et les icônes, que `npx cap add` ne saurait pas régénérer

## III. Pile Technologique

*Versions contraintes par `package.json`. N'introduisez aucune dépendance alternative sans approbation.*

- **Nuxt 4** + **Vue 3** (Composition API), **TypeScript strict**, SSG (`nitro.preset: 'static'`)
- **Nuxt Content v3** — collections déclarées dans `content.config.ts`
- **Pinia 3** (état), **VueUse 14** (capteurs)
- **Leaflet 1.9** (carte) + **protomaps-leaflet 5** / **pmtiles 3** : fond vectoriel hors ligne extrait du basemap Protomaps (OSM, ODbL) ; **OSRM** public pour l'itinéraire piéton
- **mind-ar 1.2** (reconnaissance d'image) + Canvas 2D (tracé du puzzle)
- **Capacitor 8** (Android/iOS : caméra, géoloc, haptique, préférences, calendrier)
- **@supabase/supabase-js 2** (auth anonyme, Postgres, Realtime) — **optionnel au runtime**
- **@vite-pwa/nuxt** (service worker : pré-cache du fond de carte, cache OSRM), **SCSS** sans framework CSS

## IV. Garde-Fous non négociables

1. **Les `.yaml` de `content/routes/` et `content/puzzles/` ne portent jamais de délimiteurs `---`.** Wrappés, Nuxt Content échoue *silencieusement* : le titre retombe sur le nom de fichier et `meta` est vide. Toujours commencer par `title:`.
2. **Tout POI, parcours ou tip porte un champ `city`** (`caen` | `troyes`) et un **slug unique sur tout le projet**, toutes villes confondues — préfixer par la ville en cas de risque de collision.
3. **L'app doit rester utilisable sans Supabase.** Le plugin ne crée le client que si l'URL et la clé sont présentes ; toute page hors `/groups` doit fonctionner offline, sans session, sans réseau.
4. **Toute nouvelle table Supabase arrive avec sa RLS.** `enable row level security`, ses policies, **et** le `grant` au rôle `authenticated` — les policies seules ne suffisent pas. Passer par `is_group_member()` (`security definer`) pour éviter la récursion RLS.
   - Une policy `select` doit rendre la ligne lisible **au moment même de l'insertion** si le client fait `.insert().select()` : le `RETURNING` s'évalue avant toute autre écriture, et une ligne invisible fait échouer l'insertion entière.
   - Une variable PL/pgSQL ne porte **jamais** le nom d'une colonne du même bloc — préfixer `v_`, sinon Postgres refuse avec `42702` au lieu d'arbitrer.
5. **Aucun secret dans le dépôt.** Les clés Supabase transitent par `.env` (gitignoré) → `runtimeConfig.public`. La copie maîtresse vit dans `.arpente-secrets/` à la racine du conteneur `Projets/`.
6. **TypeScript strict, pas de `any`.** `<script setup lang="ts">` partout, types du domaine dans `types/index.ts`, pas de logique métier dans les composants (déléguer aux composables, stores et `utils/`).
7. **Rien de spécifique à une ville en dur dans le code.** Centre, zoom et libellés viennent de `CITIES` (`stores/city.ts`) ; la carte reçoit `center`, `zoom` et `city` en props.
8. **Le fond de carte ne se télécharge jamais depuis `tile.openstreetmap.org`.** La politique de la fondation OSM interdit le téléchargement en masse et le service le refuse. Chaque ville a son archive `public/basemaps/<ville>.pmtiles`, extraite du basemap Protomaps par `npm run download-basemap` — dossier non versionné, dont l'absence arrête le build. L'attribution OpenStreetMap est obligatoire : elle est portée par la couche Leaflet.
9. **`android/` se modifie, ne se régénère pas.** Le dossier est versionné parce qu'il porte ce qu'aucun outil ne saurait reconstituer : le `versionCode` — que Play exige **strictement croissant** d'un envoi à l'autre, sans retour en arrière possible —, la configuration de signature, les permissions et les icônes. `npx cap sync` recopie les assets web sans y toucher ; `npx cap add android` les effacerait.
10. **Le manifeste ne déclare que les permissions réellement exercées.** Aujourd'hui : `INTERNET` et la géolocalisation, plus `VIBRATE` fusionnée depuis Haptics. Pas de `CAMERA` tant que le puzzle AR est éteint, pas de permission d'agenda puisque `useCalendar` délègue l'écriture au système via `createEventWithPrompt`. Chaque permission ajoutée se paie en justification auprès de Google et en ligne de plus dans la Data safety.

## V. Flux de Travail (Explore → Plan → Code → Verify)

1. **Exploration** — lire les fichiers adjacents pour calquer les patterns ; pour du contenu, copier un POI ou un parcours existant de la même ville.
2. **Planification** — soumettre l'approche pour tout changement non trivial (schéma Supabase, système AR, structure du contenu).
3. **Implémentation** — changement minimal, dans la couche qui en a la responsabilité.
4. **Vérification** — `npm run typecheck`, `npm run verif`, puis `npm run generate`. Le projet n'a pas de harnais de test, mais `verif/` exécute les fonctions pures de `utils/` avec `tsx`, contre la vraie implémentation : c'est là qu'un comportement se fige. Le typage strict et un build statique réussi complètent le filet. Tout comportement GPS, caméra ou tactile se valide sur appareil (`npx cap run android`), jamais au clavier.

`typecheck` sort une erreur connue : `mind-ar` ne publie pas de déclarations TypeScript, d'où un `TS7016` sur l'import de `composables/useImageTracking.ts`. Tant qu'aucun `.d.ts` ne déclare ce module, c'est la **seule** erreur attendue — toute autre est une régression.

**Auto-documentation (règle transverse)** — tout nouveau composable, store ou utilitaire publie en tête un commentaire qui dit ce qu'il fait, **pourquoi** un choix surprenant a été fait, et l'invariant à ne pas casser. Ce projet en dépend déjà : le pourquoi de l'hydratation différée du store `city`, du stockage Capacitor de la session, ou du client Supabase optionnel ne vit nulle part ailleurs.

## VI. Commandes de Développement

```bash
npm install
npm run dev                      # dev en HTTPS, certificat auto-genere (cf. nuxt.config.ts)
npm run typecheck                # vue-tsc — la vérification de référence
npm run verif                    # exécute les fonctions pures de utils/ (tsx, sans harnais)
npm run generate                 # build statique offline → .output/public
npm run download-basemap         # fond de carte des deux villes (-- caen | -- troyes pour une seule)
                                 # prerequis : binaire pmtiles sur le PATH — voir README
npm run compile-targets          # compile les cibles AR (.mind) depuis assets/targets/raw/
npx cap sync && npx cap open android
```

**Sous Windows, `npm install` échoue** sur `canvas`, dépendance native de `mind-ar`, faute de chaîne d'outils MSVC. Installer avec `npm install --ignore-scripts` : Nuxt, le typecheck et le build statique fonctionnent normalement. Seule la compilation locale des cibles `.mind` reste indisponible — elle passe de toute façon par le compilateur MindAR en ligne (voir `scripts/compile-targets.ts`).

La caméra et la géolocalisation exigent un contexte sécurisé, y compris depuis une IP locale : le serveur de dev tourne donc en HTTPS. Le certificat est **auto-généré à chaque démarrage** par listhen, et couvre les IP du réseau local détectées — un téléphone sur le même Wi-Fi n'a qu'un avertissement d'auto-signature à accepter, sans erreur de nom. Aucun fichier `*.pem` à fournir.

## VII. Maintenance documentaire

**Règle d'or** : le diff du code et celui de la doc correspondante vont dans **le même commit**.

| Modification | Fichier à mettre à jour |
|---|---|
| Ville ajoutée (`CITIES`, contenu, bornes) | `README.md` + `scripts/cities.ts` + section « Système multi-ville » de [`docs/architecture.md`](./docs/architecture.md) |
| Table, policy ou fonction Supabase | `supabase/schema.sql` + « Modèle de données » de `docs/architecture.md` |
| Nouveau composable, store ou utilitaire | Catalogue correspondant dans `docs/architecture.md` |
| Nouvelle variable d'environnement | `.env.example` + `runtimeConfig` de `nuxt.config.ts` |
| Dépendance critique ajoutée ou retirée | Section III ci-dessus + `package.json` |
| Permission Android ajoutée | `android/app/src/main/AndroidManifest.xml` + garde-fou 10 ci-dessus + la Data safety de la fiche Play, qui doit rester en accord |
| Marque retouchée (icône, écran de démarrage) | `assets/icon.png` puis recomposition des `mipmap-*` et `drawable*` — procédure et pièges dans « Plateforme Android » de `docs/architecture.md` |
| Nouvel anti-pattern découvert | Section « Anti-patterns » de `docs/architecture.md` |

## VIII. Contexte de Session

- **Dernier focus** : —
- **Focus immédiat** : —
