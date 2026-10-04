# Arpente — Contexte d'Opération et Garde-Fous Agentiques

Résolvez les problèmes sans introduire de régression ni de dette technique architecturale.

## I. Finalité

**Application** : Arpente (`app.arpente`) — guide de visite interactif multi-ville, embarqué en app mobile.
**Objectif** : une carte, des parcours thématiques et des fiches historiques qui se déclenchent à la proximité GPS, utilisables **hors ligne** ; à Caen s'ajoute un mini-jeu de tracé en réalité augmentée sur les meurtrières du château. Deux villes sont livrées (Caen, Troyes) ; en accueillir une troisième relève du contenu, pas du code. Une couche de groupes en ligne (Supabase), réservée aux comptes (code par e-mail ou Google), permet à plusieurs visiteurs de préparer un parcours ensemble — avec, s'ils le veulent, un assistant IA (MCP).

## II. Architecture

**Modèle** : application Nuxt monopage générée en statique (SSG), contenu en fichiers, état en stores Pinia, backend optionnel Supabase, et un seul service à soi, `service/` (assistant IA et passerelle de connexion : [`docs/mcp-architecture.md`](./docs/mcp-architecture.md)). **Détails complets** (diagramme des couches, catalogue des modules, flux d'une visite, modèle de données du vote, anti-patterns) : voir [`docs/architecture.md`](./docs/architecture.md).

Topologie rapide — le dépôt **est** l'application, sans sous-dossier intermédiaire :
- `content/` — POI (`.md`), parcours, tips et puzzles (`.yaml`) : la donnée éditoriale, embarquée dans le build
- `components/` — vues par domaine : `map/`, `poi/`, `route/`, `ar/`, `group/`, `ui/`
- `composables/` — capteurs et logique réutilisable (géoloc, proximité, caméra, tracking, itinéraire)
- `stores/` — état global Pinia : `city`, `route`, `puzzle`, `auth`, `group`, `vote`, `decision`, `groupRoute`
- `utils/` — fonctions pures sans dépendance Vue (géométrie, agrégation de votes, iCalendar, slugs), vérifiées par `verif/` ; **importer explicitement** entre fichiers d'`utils/` plutôt que de compter sur l'auto-import de Nuxt, sinon ils ne s'exécutent plus hors du runtime
- `supabase/` — `schema.sql` (état complet : schéma, RLS, fonctions, purge), `migrations/` (ce qui a été joué sur la base en service), `tests/conformite.test.sql` (RLS et purge, sur base jetable)
- `scripts/` — outillage hors-app : extraction du fond de carte, contrôle avant build, compilation des cibles AR, synthèse du jingle d'ouverture, publication sur Play (`publish_play.py`, commun aux dépôts du conteneur)
- `service/` — service Node : serveur MCP de l'assistant IA, son serveur OAuth, passerelle `/otp` et `/verify` devant GoTrue, pages d'accord et de suppression du compte ; réutilise `utils/` et compile `content/` au build de son image
- `deploy/` — vhost Caddy de l'API (`caddy/arpente.caddy`, avec la liste d'admission devant GoTrue), compose de production (`docker-compose.yml`) et son ajout pour les comptes et le service (`docker-compose.comptes.yml`), gabarits d'e-mail : **versionnés**, faute de quoi une réinstallation du serveur les perdrait ; installés par `deploy-caddy.sh` et `deploy-service.sh`
- `android/` — projet natif Capacitor, **versionné** : il porte les permissions, le `versionCode`, la signature et les icônes, que `npx cap add` ne saurait pas régénérer

## III. Pile Technologique

*Versions contraintes par `package.json`. N'introduisez aucune dépendance alternative sans approbation.*

- **Nuxt 4** + **Vue 3** (Composition API), **TypeScript strict**, SSG (`nitro.preset: 'static'`)
- **Nuxt Content v3** — collections déclarées dans `content.config.ts` ; **Pinia 3** (état), **VueUse 14** (capteurs)
- **Leaflet 1.9** (carte) + **protomaps-leaflet 5** / **pmtiles 3** : fond vectoriel hors ligne extrait du basemap Protomaps (OSM, ODbL) ; **OSRM** public pour l'itinéraire piéton
- **mind-ar 1.2** (reconnaissance d'image) + Canvas 2D (tracé du puzzle)
- **Capacitor 8** (Android/iOS : caméra, géoloc, haptique, préférences, calendrier)
- **@supabase/supabase-js 2** (connexion par code e-mail et Google, Postgres, Realtime) — **optionnel au runtime** ; session native dans **@aparajita/capacitor-secure-storage** (coffre chiffré par le Keystore)
- **@vite-pwa/nuxt** (service worker : pré-cache du fond de carte, cache OSRM), **SCSS** sans framework CSS
- **Service** (`service/package.json`) : Node 24, Express 5, SDK MCP v2 (`@modelcontextprotocol/server`), zod 4, pg, jose ; tests `node:test`

## IV. Garde-Fous non négociables

1. **Les `.yaml` de `content/routes/` et `content/puzzles/` ne portent jamais de délimiteurs `---`.** Wrappés, Nuxt Content échoue *silencieusement* : le titre retombe sur le nom de fichier et `meta` est vide. Toujours commencer par `title:`.
2. **Tout POI, parcours ou tip porte un champ `city`** (`caen` | `troyes`) et un **slug unique sur tout le projet**, toutes villes confondues — préfixer par la ville en cas de risque de collision.
3. **L'app doit rester utilisable sans Supabase.** Le plugin ne crée le client que si l'URL et la clé sont présentes ; toute page hors `/groups` doit fonctionner offline, sans session, sans réseau.
4. **Toute nouvelle table Supabase arrive avec sa RLS.** `enable row level security`, ses policies, **et** le `grant` au rôle `authenticated` — les policies seules ne suffisent pas. Passer par `is_group_member()` (`security definer`) pour éviter la récursion RLS ; les groupes sont réservés aux comptes (`compte_requis()`, politiques restrictives).
   - Une policy `select` doit rendre la ligne lisible **au moment même de l'insertion** si le client fait `.insert().select()` (le `RETURNING` s'évalue avant tout), et une variable PL/pgSQL ne porte **jamais** le nom d'une colonne du même bloc — préfixer `v_`, sinon `42702`.
5. **Aucun secret dans le dépôt — qui est public.** Un commit malheureux est ici immédiatement lisible de tous, et le retirer de l'historique ne le retire pas des clones. Les clés Supabase transitent par `.env` (gitignoré) → `runtimeConfig.public`. Le keystore de signature et ses mots de passe passent par `android/keystore.properties` (gitignoré). Les copies maîtresses des deux vivent dans `.arpente-secrets/`, à la racine du conteneur `Projets/`. `docs/` est servi par **GitHub Pages** sous notre domaine (<https://arpente.heianenterprise.com/privacy.html>, politique de confidentialité exigée par Play ; `docs/CNAME`, l'ancienne adresse redirige). Tout fichier qu'on y dépose devient une page publique. **L'entraînement des IA y est refusé** (bonnes-pratiques A8) : robots d'entraînement listés dans `docs/robots.txt`, et `<meta name="tdm-reservation" content="1">` dans **chaque** page — toute nouvelle page la porte.
6. **TypeScript strict, pas de `any`.** `<script setup lang="ts">` partout, types du domaine dans `types/index.ts`, pas de logique métier dans les composants (déléguer aux composables, stores et `utils/`).
7. **Rien de spécifique à une ville en dur dans le code.** Centre, zoom et libellés viennent de `CITIES` (`stores/city.ts`) ; la carte reçoit `center`, `zoom` et `city` en props.
8. **Le fond de carte ne se télécharge jamais depuis `tile.openstreetmap.org`.** La politique de la fondation OSM interdit le téléchargement en masse et le service le refuse. Chaque ville a son archive `public/basemaps/<ville>.pmtiles`, extraite du basemap Protomaps par `npm run download-basemap` — dossier non versionné, dont l'absence arrête le build. L'attribution OpenStreetMap est obligatoire : elle est portée par la couche Leaflet.
9. **`android/` se modifie, ne se régénère pas.** Le dossier est versionné parce qu'il porte ce qu'aucun outil ne saurait reconstituer : le `versionCode` — que Play exige **strictement croissant** d'un envoi à l'autre, sans retour en arrière possible —, la configuration de signature, les permissions et les icônes. `npx cap sync` recopie les assets web sans y toucher ; `npx cap add android` les effacerait.
10. **Le manifeste ne déclare que les permissions réellement exercées.** Aujourd'hui : `INTERNET` et la géolocalisation, plus `VIBRATE` fusionnée depuis Haptics. Pas de `CAMERA` tant que le puzzle AR est éteint, pas de permission d'agenda puisque `useCalendar` délègue l'écriture au système via `createEventWithPrompt`. Chaque permission ajoutée se paie en justification auprès de Google et en ligne de plus dans la Data safety.
11. **Assistant IA : un jeton qui ne vaut que pour `/mcp`.** Signé par `ASSISTANT_SECRET`, jamais le `JWT_SECRET` de GoTrue ; le service agit au nom du membre (`SET LOCAL ROLE authenticated`, la RLS décide) ; aucun outil ne touche au compte, aux adresses ni aux codes d'invitation.

## V. Flux de Travail (Explore → Plan → Code → Verify)

1. **Exploration** — lire les fichiers adjacents pour calquer les patterns ; pour du contenu, copier un POI ou un parcours existant de la même ville.
2. **Planification** — soumettre l'approche pour tout changement non trivial (schéma Supabase, système AR, structure du contenu).
3. **Implémentation** — changement minimal, dans la couche qui en a la responsabilité.
4. **Vérification** — `npm run typecheck`, `npm run verif` (fonctions pures de `utils/`, avec `tsx`, contre la vraie implémentation), `supabase/tests/conformite.test.sql` si la RLS change, puis `npm run generate`. GPS, caméra et tactile se valident sur appareil (`npx cap run android`). **Seule erreur attendue du typecheck** : `TS7016` sur `mind-ar` (`composables/useImageTracking.ts`), faute de déclarations — toute autre est une régression.
5. **Auto-documentation (règle transverse)** — tout nouveau composable, store ou utilitaire publie en tête un commentaire qui dit ce qu'il fait, **pourquoi** un choix surprenant a été fait, et l'invariant à ne pas casser. Ce projet en dépend déjà : le pourquoi de l'hydratation différée du store `city`, du stockage Capacitor de la session, ou du client Supabase optionnel ne vit nulle part ailleurs.

## VI. Commandes de Développement

```bash
npm install --ignore-scripts     # sous Windows, canvas (mind-ar) ne compile pas sans MSVC — voir « Poste de développement » (docs/architecture.md)
npm run dev                      # dev en HTTPS, certificat auto-genere (cf. nuxt.config.ts)
npm run typecheck                # vue-tsc — la vérification de référence
npm run verif                    # exécute les fonctions pures de utils/ (tsx, sans harnais)
npm run generate                 # build statique offline → .output/public
npm run download-basemap         # fonds de carte (-- caen | -- troyes) ; binaire pmtiles requis — voir README
npm run compile-targets          # compile les cibles AR (.mind) depuis assets/targets/raw/
npx cap sync && npx cap open android
cd service && npm run typecheck && npm test   # le service ; test:base sur base jetable ; mise en ligne : sh deploy/deploy-service.sh <serveur> (docs/mcp-architecture.md)
python scripts/publish_play.py --track alpha --notes-file notes.txt --dry-run   # puis sans --dry-run — voir docs/publication-play.md
```

## VII. Maintenance documentaire

**Règle d'or** : le diff du code et celui de la doc correspondante vont dans **le même commit**.

| Modification | Fichier à mettre à jour |
|---|---|
| Ville ajoutée (`CITIES`, contenu, bornes) | `README.md` + `scripts/cities.ts` + section « Système multi-ville » de [`docs/architecture.md`](./docs/architecture.md) |
| Table, policy ou fonction Supabase | une migration `supabase/migrations/` (jouée à la main sur la prod) **et** `supabase/schema.sql` + `supabase/tests/conformite.test.sql` si la RLS change + « Modèle de données » de `docs/architecture.md` |
| Donnée collectée, durée de conservation ou destinataire ; règle d'usage (compte, groupes, assistant) | `docs/privacy.html` (+ la purge de `schema.sql` si une durée change) + la Data safety de la fiche Play ; `docs/cgu.html` pour les règles d'usage |
| Nouveau composable, store ou utilitaire | Catalogue correspondant dans `docs/architecture.md` |
| Nouvelle variable d'environnement | `.env.example` + `runtimeConfig` de `nuxt.config.ts` (app) ; tableau « Configuration » de `docs/mcp-architecture.md` (service) |
| Outil MCP, route OAuth, page ou passerelle du service | `service/` + `docs/mcp-architecture.md` (un test exige chaque outil) + `docs/assistant.html` |
| Dépendance critique ajoutée ou retirée | Section III ci-dessus + `package.json` |
| Permission Android ajoutée | `android/app/src/main/AndroidManifest.xml` + garde-fou 10 ci-dessus + la Data safety de la fiche Play, qui doit rester en accord |
| Marque retouchée (icône, écran de démarrage) | `assets/icon.png` puis recomposition des `mipmap-*` et `drawable*` — procédure et pièges dans « Plateforme Android » de `docs/architecture.md` |
| Intro retouchée (geste ou note) | `BATTUES` de `SplashScreen.vue` **et** de `scripts/gen-intro-jingle.ts`, puis `npm run gen-jingle` (ffmpeg requis) |
| Nouvel anti-pattern découvert | Section « Anti-patterns » de `docs/architecture.md` |
| Illustration de POI ajoutée ou remplacée | `assets/credits-images.json` — auteur et licence, sans quoi l'app enfreint les licences CC BY-SA qu'elle redistribue |
| Routage, CORS ou port de l'API en ligne | `deploy/caddy/arpente.caddy` **puis** `sh deploy/deploy-caddy.sh <serveur>` + `INFRASTRUCTURE.md` du conteneur |

## VIII. Contexte de Session

- **Dernier focus** : comptes et assistant IA (branche `comptes-assistant`) ; côté serveur, GoTrue des comptes, liste d'admission, migration 1 et service tournent, anonyme encore permis et OAuth fermé.
- **Focus immédiat** : clients OAuth Google et widget Turnstile, puis publication de l'app sur la piste alpha, bascule (migration 2) et ouverture de l'assistant, dans l'ordre de `docs/mcp-architecture.md`.
