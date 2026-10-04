# Architecture d'Arpente

## Vue d'ensemble

Arpente est une application Nuxt **générée en statique** puis encapsulée par Capacitor. L'app n'a besoin d'aucun serveur pour visiter : le contenu éditorial (points d'intérêt, parcours, anecdotes, puzzles) est compilé dans le bundle par Nuxt Content, le fond de carte est une archive vectorielle embarquée dans le build, et la progression individuelle vit en `localStorage`. Cette contrainte est délibérée — l'app doit fonctionner **au milieu d'une rue, sans réseau**.

Deux briques sont en ligne, et elles sont **facultatives** : Supabase porte les groupes de visite (compte par code e-mail ou Google, pseudo, adhésion par code, roster), et le **service** `service/` ouvre ces groupes à un assistant IA (serveur MCP et son serveur OAuth) et garde la connexion (passerelle devant GoTrue) — voir [`mcp-architecture.md`](./mcp-architecture.md). Le client Supabase n'est instancié que si l'URL et la clé sont configurées ; sinon `useSupabase()` lève, seules les pages `/groups` en souffrent, et le reste de l'app est intact.

Le code ne connaît aucune ville en particulier : une ville est une entrée de `CITIES` plus du contenu tagué. Ajouter une troisième ville ne demande pas une ligne de logique.

## Diagramme des couches

```
                       ┌──────────────────────────────────────────┐
   Coque native        │  Capacitor 8 (Android / iOS)             │
   (facultative,       │  caméra · géoloc · haptique · coffre     │
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
   │ Nuxt Content 3 │   │ public/basemaps/ + │   │ Supabase        │
   │ content/*.md   │   │ Service Worker PWA │   │ (facultatif)    │
   │ content/*.yaml │   │ PMTiles · OSRM     │   │ auth · RLS · RT │
   │ → dans le build│   │ → hors ligne       │   │ → groupes       │
   └────────────────┘   └────────────────────┘   └────────▲────────┘
                                                          │ au nom du membre (RLS)
                                                 ┌────────┴────────┐
   assistant IA (claude.ai, ChatGPT…) ── MCP ──► │ service/ (Node) │
                                                 │ OAuth · MCP ·   │
                                                 │ passerelle auth │
                                                 └─────────────────┘
```

Le sens de dépendance descend toujours : une page peut appeler un store et un composable, un store peut appeler `utils/` et Supabase, mais `utils/` n'importe **rien** — c'est la couche vérifiable à la main, sans harnais.

## Catalogue des modules

| Dossier | Rôle |
|---|---|
| `components/map/` | `MapView.client.vue` (Leaflet, client-only : Leaflet touche au `window` dès le montage) et la flèche de direction vers le prochain POI |
| `components/poi/` | `BottomSheet.vue` — volet à trois positions (`peek` / `half` / `full`), déclenché par la proximité ; `PoiImage.vue` — illustration qui s'efface si son fichier est absent, seul point où une image de POI est rendue |
| `components/route/` | Carte de parcours, checklist des étapes, suivi de progression |
| `components/ar/` | Flux caméra, reconnaissance de cible MindAR, overlay Canvas du tracé, animation de réussite |
| `components/group/` | Création et adhésion d'un groupe, demande de pseudo, liste des membres, vote sur les POI (`PoiVoteList`) et préférences de parcours (`PreferenceForm`) |
| `components/ui/` | Barre de navigation, sélecteur de ville, écran d'ouverture animé — voir « Ouverture de l'app » |
| `content/` | 151 POI, 12 parcours, 8 tips, 1 puzzle — la donnée éditoriale, versionnée avec le code |
| `scripts/` | Hors-app : extraction du fond de carte Protomaps, contrôle avant build, compilation des cibles AR, synthèse du jingle d'ouverture, publication sur Play (`publish_play.py`, recopié tel quel des autres dépôts) |
| `public/audio/` | Le jingle d'ouverture, **généré** par `npm run gen-jingle` : on ne le retouche pas dans un éditeur, on relance le script |
| `public/icons/` | Icônes servies par l'app : le manifest PWA les référence, et `icon-512.png` est aussi l'icône de la fiche Play |
| `public/images/pois/` | Illustrations des fiches, `<slug>.jpg`, issues de Wikimedia Commons. Une fiche sans fichier reste correcte — voir `PoiImage` |
| `assets/branding/` | Visuels destinés aux stores uniquement (bannière de la fiche). Jamais importés par le code, donc absents du bundle |
| `assets/icon.png` | Source 1024×1024 de la marque, dont `@capacitor/assets` dérive les icônes natives Android |
| `service/` | Service Node, seul serveur propre au projet : serveur MCP de l'assistant IA, son serveur OAuth, passerelle de connexion, pages d'accord et de suppression du compte. Il réutilise `utils/` (le calcul d'un parcours) et compile `content/` au build de son image — détail dans [`mcp-architecture.md`](./mcp-architecture.md) |

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
| `useGoogleSignIn` | « Continuer avec Google » par le greffon natif `GoogleSignIn` (Credential Manager) : jeton d'identité et nonce, jamais de script Google dans une page web |
| `useAccesAssistant` | Accès accordés à un assistant IA (`assistant_grants`, ses propres lignes) et leur révocation |
| `useBasemap` | Charge l'archive PMTiles d'une ville, en entier et une seule fois, et la garde en cache mémoire |

Le store `vote` porte en plus l'abonnement Realtime : un seul canal ouvert à la fois, fermé au démontage de la page. Sans cette discipline, changer de groupe accumule les abonnements et les événements arrivent en double.

## Stores — état global

| Store | Contenu | Persistance |
|---|---|---|
| `city` | Ville active et sa configuration (`CITIES` : centre, zoom, libellé) | `localStorage` (`arpente-city`) |
| `route` | Parcours actif, index de l'étape, POI déjà visités | mémoire |
| `puzzle` | Identifiants des puzzles résolus | `localStorage` |
| `auth` | Compte (code par e-mail ou Google), pseudo (`profiles.handle`), reprise d'une session — fermée si le compte a été effacé ou si elle était anonyme —, déconnexion locale, suppression du compte (`delete_my_account`) | Supabase + coffre chiffré (natif) |
| `group` | Groupes du membre, groupe courant, roster | Supabase |
| `vote` | Approbations par POI, préférences de chaque membre, canal temps réel | Supabase + WebSocket |
| `decision` | Dernier parcours arrêté du groupe | Supabase |
| `groupRoute` | Pont entre la décision et le parcours solo : checklist partagée, flux temps réel | Supabase + `localStorage` (reprise) |

## Utilitaires purs

| Fichier | Rôle |
|---|---|
| `geo.ts` | Distance haversine — base de la proximité et de l'ordonnancement |
| `slug.ts` | Extrait le slug du `stem` Nuxt Content v3 (`pois/chateau-de-caen` donne `chateau-de-caen`) |
| `arTransform.ts` | Projette un point de la cible (0-1) vers l'écran via les matrices MindAR |
| `ics.ts` | Génère un fichier iCalendar (RFC 5545) pour l'ajout à l'agenda depuis le navigateur |
| `voteAggregation.ts` | Agrège les votes d'un groupe : approbation par POI, **médiane** des préférences de nombre et de durée, puis ordonnancement au plus proche voisin |
| `decision.ts` | Le cœur d'une décision de groupe, **partagé par l'app et par le service de l'assistant IA** : `preparerDecision` (lieux connus seulement, refus d'un parcours vide) et `mesurerTrajet` (OSRM, ou somme des haversines marquée `isEstimated`), dont le transport réseau est injecté par l'appelant |
| `sessionStorage.ts` | Stockage de la session : coffre chiffré avec reprise unique de l'ancienne session en clair (`stockageSessionMigrant`) ; `identiteDisparue` distingue une identité effacée par le serveur d'une simple panne réseau |
| `liensLegaux.ts` | URL des pages légales publiées (`arpente.heianenterprise.com`) ; `confidentialite` est celle de la fiche Play |
| `features.ts` | Drapeaux de ce que l'app expose. `AR_PUZZLE_ENABLED` conditionne l'accès au puzzle, qui reste éteint tant qu'aucune cible `.mind` n'est compilée |

## Système multi-ville

- `City = 'caen' | 'troyes'` (`types/index.ts`) ; `city` est **obligatoire** sur `Poi`, `RouteThematic` et `Tip`.
- `CITIES` (`stores/city.ts`) déclare centre et zoom ; `MapView.client.vue` les reçoit en props et recentre quand ils changent.
- Toute page listant du contenu filtre sur `doc.meta?.city === cityStore.currentCity`.
- L'onglet AR n'apparaît qu'à Caen — le puzzle est propre au château — et seulement si `AR_PUZZLE_ENABLED` (`utils/features.ts`) est vrai. Le drapeau est à `false` : le tracé n'a pas de cible à reconnaître tant que les `.mind` du château ne sont pas compilés.
- Le store démarre **toujours** sur `caen` et n'est hydraté depuis `localStorage` qu'au `onMounted` du layout : le rendu statique n'a pas accès au stockage, un état initial divergent casserait l'hydratation.
- Chaque ville a **sa propre archive** `public/basemaps/<ville>.pmtiles` ; `MapView.client.vue` reçoit la ville en prop et remonte le fond correspondant quand elle change. Il n'existe pas de fond couvrant les deux.

**Ajouter une ville** : une entrée dans `CITIES`, du contenu tagué avec le nouveau slug, ses bornes dans `CITY_BOUNDS` (`scripts/cities.ts`), puis `npm run download-basemap -- <ville>`.

## Modèle de données du vote de groupe

Le backend n'est **pas** un projet Supabase cloud : le plan gratuit plafonne à deux projets actifs par utilisateur, et DewDrop et DeckHand les occupent. Arpente tourne donc sur une stack Supabase **auto-hébergée** sur le serveur Hetzner, derrière `api.arpente.heianenterprise.com`. L'API est identique — même `supabase-js`, mêmes politiques, même schéma. Détails d'exploitation : `INFRASTRUCTURE.md` du conteneur `Projets/`.

Devant cette pile, le Caddy du serveur tient le rôle de Kong (routage des préfixes `/auth/v1`, `/rest/v1`, `/realtime/v1` et réponses CORS). Ce vhost est **versionné ici**, dans [`deploy/caddy/arpente.caddy`](../deploy/caddy/arpente.caddy) : il ne vivait que sur le serveur, où une réinstallation aurait reperdu ses trois pièges résolus (l'en-tête `apikey` que GoTrue ignore, le tenant Realtime lu dans le `Host`, et `X-Supabase-Api-Version` à exposer sans quoi l'app n'affiche qu'un message générique pour toute erreur d'authentification). `sh deploy/deploy-caddy.sh <serveur>` l'installe, valide la configuration **avant** de recharger — ce Caddy sert aussi trois autres projets — et remet l'ancienne copie en cas d'échec.

`supabase/schema.sql` décrit l'**état complet** du schéma, pour une base neuve. La base en service évolue par les fichiers de `supabase/migrations/`, joués **à la main** et une seule fois (`psql -v ON_ERROR_STOP=1 -1 -f …` dans le conteneur `arpente_db`) ; chaque migration est reportée dans `schema.sql` dans le même commit. `supabase/tests/conformite.test.sql` éprouve la RLS et la purge sur une base **jetable** (un `supabase start` local) : il tourne dans une transaction annulée.

| Table | Rôle |
|---|---|
| `profiles` | Pseudo attaché au compte ; unicité insensible à la casse ; lisible par soi-même et ses **coéquipiers** seulement (`shares_group_with`) |
| `groups` | Groupe de visite : code d'invitation, ville, statut `voting` / `decided` |
| `group_members` | Roster (clé primaire composite) |
| `poi_votes` | Vote d'approbation : une ligne = un membre approuve un POI |
| `preference_votes` | Une ligne par membre : nombre de POI et durée souhaités |
| `visited_pois` | Checklist partagée — n'importe quel membre coche pour le groupe |
| `decided_routes` | Instantané immuable d'un parcours décidé ; une nouvelle décision = une nouvelle ligne |
| `assistant_grants` | Accès accordés à un assistant IA : l'app liste et révoque les siens (sans `refresh_gen`, le compteur de rotation des jetons) ; le service de l'assistant les crée et les vérifie à chaque appel |

**Les groupes sont réservés aux comptes** (e-mail ou Google). `compte_requis()` n'est vraie que pour un jeton dont le claim `is_anonymous` vaut `false` — un jeton sans ce claim est traité comme anonyme, l'échec est fermé. Chaque table des groupes porte une politique **restrictive** « compte requis », qui s'ajoute aux autres et vaut aussi pour Realtime ; `preview_group_by_code` et `join_group_by_code`, qui contournent la RLS, la vérifient elles-mêmes.

**Les slugs de lieux ont une forme imposée** (`^[a-z0-9-]{1,80}$`, sur `poi_votes`, `visited_pois` et chaque étape de `decided_routes`) : un membre écrit ces colonnes par PostgREST, et un texte libre atteindrait l'assistant IA d'un coéquipier.

**Le rôle `arpente_assistant`** est celui du service de l'assistant. Il est `NOINHERIT` : membre de `authenticated` sans en hériter les droits, il ne touche qu'à `assistant_grants` tant qu'il n'endosse pas un membre (`SET LOCAL ROLE authenticated` + claims) — et alors la RLS s'applique comme à l'app. La base est en Postgres 15, où la syntaxe `grant … with inherit false, set true` n'existe pas encore. `supabase/tests/role_assistant.test.sql` l'éprouve **depuis une session ouverte à son nom** : `SET ROLE` dépend de l'utilisateur de la session, un test joué en `postgres` ne prouverait rien.

Trois fonctions `security definer` portent la logique sensible : `generate_join_code()` (alphabet sans `O`/`0` ni `I`/`1`, ambigus à l'oral), `preview_group_by_code()` et `join_group_by_code()` — elles permettent de rejoindre un groupe **sans exposer la table `groups` en lecture**. `is_group_member()` est également `security definer` : une policy sur `group_members` qui se référencerait elle-même provoquerait une récursion RLS.

`utils/voteAggregation.ts` produit le parcours : il retient les POI les mieux soutenus, en nombre égal à la **médiane** des envies du groupe, puis les relie de proche en proche. `utils/decision.ts` l'enveloppe (lieux connus seulement, refus d'un parcours vide, mesure du trajet) ; le store `decision` l'appelle et écrit le résultat dans `decided_routes`, et le service de l'assistant IA fait de même — un parcours arrêté depuis l'app ou par l'assistant suit la même règle.

**La décision est un instantané, pas un calcul permanent.** Un vote qui arrive après ne la modifie pas : le groupe part avec le parcours qu'il a validé, et non avec un itinéraire qui bougerait sous ses pieds en cours de visite. Redécider écrit une **nouvelle ligne** — l'historique reste lisible, et c'est pourquoi la table n'a ni `update` ni contrainte d'unicité par groupe.

La distance vient d'OSRM quand le réseau répond, de la somme des haversines sinon. L'écart est réel — à pied, en ville, le trajet fait couramment 30 % de plus que la ligne droite — d'où le marqueur « à vol d'oiseau » dans l'interface : une approximation ne doit jamais s'afficher comme une mesure.

### Deux pièges que seul un essai réel révèle

**Une variable PL/pgSQL ne doit jamais porter le nom d'une colonne.** `generate_join_code()` déclarait `code text` en regard de `groups.code` : Postgres refuse l'ambiguïté avec `42702` plutôt que de choisir, et **toute création de groupe échouait**. D'où le préfixe `v_` — convention déjà suivie par `join_group_by_code`.

**Le créateur doit pouvoir relire son groupe.** Le client fait `.insert(…).select().single()`, et ce `RETURNING` exige que la ligne soit lisible **immédiatement**. Or l'adhésion du créateur intervient à l'appel suivant : une policy limitée à `is_group_member(id)` rendait donc la ligne invisible à celui qui venait de l'écrire, et Postgres rejetait l'insertion entière. La clause `or created_by = auth.uid()` ferme le trou — sans elle, personne ne peut connaître le code d'invitation de son propre groupe.

Les deux bugs ont survécu à la relecture et au typage : ils ne vivent ni dans le TypeScript ni dans le SQL isolément, mais dans leur rencontre à l'exécution.

### Droits, suppression et purge

- **Un membre ne change que le statut d'un groupe** : la policy `update` dit *qui* (un membre), le `grant update (status)` par colonne dit *quoi*. Le nom, le code, la ville et le créateur ne bougent plus après la création.
- **Seul le créateur supprime un groupe** (policy `delete`) ; tout part en cascade (votes, préférences, coches, parcours). Sous RLS, un `DELETE` refusé n'est pas une erreur mais zéro ligne affectée : `groupStore.deleteGroup` relit ce qu'il a supprimé et échoue s'il n'a rien touché.
- **Chacun supprime son identité** (`delete_my_account()`, `security definer`, l'identifiant vient du jeton) : le profil part en cascade depuis `auth.users`, avec ses adhésions, ses votes et ses préférences. Les traces laissées chez les autres (`groups.created_by`, `visited_pois.user_id`, `decided_routes.decided_by`) passent à `null` (`on delete set null`) : le groupe reste aux autres, l'auteur s'affiche « ? ».
- **Purge nocturne** (`purge_inactive()`, planifiée par `pg_cron` à 3 h 17) :
  - groupe sans activité depuis **6 mois** (sa trace la plus récente, toutes tables confondues) ;
  - adresse saisie mais jamais confirmée par son code, après **24 h** — chaque demande de code pour une adresse neuve en crée une ;
  - compte sans groupe et sans activité depuis **1 an** — l'activité est la plus récente de la dernière connexion, du dernier renouvellement de session (`last_sign_in_at` seul ne bouge pas quand la session se renouvelle) et du dernier usage d'un assistant ;
  - accès d'assistant expiré ; identité anonyme restante (GoTrue n'en crée plus).
  Ces durées sont celles que promet `docs/privacy.html`.
- **Supprimer son compte supprime ses accès d'assistant** (`assistant_grants.user_id` en cascade depuis `auth.users`).
- **L'app survit à une identité effacée** : au démarrage des groupes, `ensureSession` interroge le serveur (`getUser`) et, si l'identité n'existe plus (`identiteDisparue`), repart d'une identité neuve au lieu d'écrire un pseudo pour un compte disparu.

## Flux typique — rejoindre un groupe par son code

1. L'utilisateur ouvre `/groups/<CODE>`. La route est en `ssr: false` (`routeRules`) : un code créé après le build ne peut pas être pré-rendu.
2. `authStore.ensureSession()` reprend la session d'un **compte** (après avoir vérifié que le serveur le connaît encore ; une session anonyme d'une version précédente est fermée). Sans compte, la page affiche `ConnexionPanel` sur place — le code du groupe reste dans l'adresse — puis reprend le chargement. En natif, la session vit dans un **coffre chiffré par le Keystore** (`@aparajita/capacitor-secure-storage`, via `utils/sessionStorage.ts`) ; sur le web, dans le stockage par défaut.
3. Le profil est chargé ; sans pseudo, l'écran renvoie vers `/groups` pour en choisir un (`profiles` en upsert).
4. `previewGroupByCode()` appelle la fonction `security definer` : nom, ville, statut et nombre de membres, sans droit de lecture sur `groups`.
5. `join_group_by_code()` insère l'adhésion avec `auth.uid()`, en `on conflict do nothing`.
6. Dès l'adhésion, la RLS bascule : `is_group_member()` devient vrai, et le groupe, son roster et ses votes deviennent lisibles.
7. Le roster s'affiche ; les tables sont publiées dans `supabase_realtime`, l'arrivée d'un membre peut être poussée en direct.

## Flux typique — se connecter

1. `ConnexionPanel` demande une adresse ; le CAPTCHA (Cloudflare Turnstile) tourne dans un cadre vers `<api>/captcha`, une page du service, parce que Turnstile n'accepte que nos noms de domaine et que la WebView vit sous `https://localhost`. Le jeton revient par `postMessage`, accepté de la seule origine de l'API.
2. `signInWithOtp` (`shouldCreateUser`) part vers `/auth/v1/otp`, que Caddy confie à la **passerelle du service** : même réponse, même délai, que l'adresse ait un compte ou non. GoTrue envoie un code à 6 chiffres (gabarit `deploy/email/connexion.html`, identique pour une adresse neuve ou connue).
3. `verifyOtp` (`type: email`) ouvre la session ; 5 échecs pour une adresse imposent 15 minutes de pause (passerelle).
4. Ou bien « Continuer avec Google » (app seulement) : le greffon natif rend un jeton d'identité dont le nonce est haché, puis `signInWithIdToken` — Google et l'adresse e-mail désignent le même compte.
5. Les messages viennent de `utils/messagesConnexion.ts`, par code d'erreur : aucun ne dit si une adresse a déjà un compte.

`/groups/compte` regroupe l'adresse, le pseudo, la déconnexion (locale), les accès accordés à un assistant IA (avec « Révoquer ») et la suppression du compte.

## Flux typique — voter dans un groupe

1. La page du groupe charge les POI depuis Nuxt Content et les filtre sur **la ville du groupe** — pas sur la ville active du sélecteur : on ne vote pas sur des lieux de Caen dans un groupe formé à Troyes.
2. `voteStore.load()` reconstruit l'état depuis `poi_votes` et `preference_votes`, puis `subscribe()` ouvre un canal Realtime filtré sur `group_id`.
3. Cocher un lieu insère une ligne dans `poi_votes` ; décocher la supprime. La contrainte `(group_id, user_id, poi_slug)` rend l'opération idempotente — deux appareils qui cochent en même temps ne créent pas de doublon.
4. Realtime diffuse l'événement aux autres membres, **RLS comprise** : un non-membre abonné au même canal ne reçoit rien. Les compteurs se mettent à jour sans rechargement.
5. Les curseurs de préférences écrivent en `upsert` sur `(group_id, user_id)` après un anti-rebond de 600 ms — sans quoi un simple glissement produirait une dizaine d'écritures et autant de diffusions.
6. Si le canal ne s'ouvre pas, `isLive` passe à faux : l'interface l'affiche et propose un rafraîchissement manuel. Les votes restent enregistrés, seule la mise à jour spontanée disparaît.

**Le piège de l'upsert** : `.upsert(…, { onConflict: 'group_id,user_id' })` — sans `onConflict`, PostgREST vise la clé primaire, qui ne peut jamais entrer en conflit puisqu'elle est générée. L'insertion se heurte alors à la contrainte unique et rend un `409` au lieu de mettre à jour.

**Le piège du DELETE en Realtime** : un `DELETE` ne transporte que l'identité de réplique. Sans `REPLICA IDENTITY FULL`, l'événement ne porte que la clé primaire — pas le `poi_slug`. Le store recharge donc au lieu de deviner ; c'est le prix à payer pour ne pas alourdir le WAL de toutes les colonnes.

## Flux typique — mettre le parcours à l'agenda

Deux chemins, une seule intention. Sur mobile, `createEventWithPrompt` ouvre l'éditeur d'événement du système, prérempli ; sur le web, un fichier `.ics` est produit et téléchargé.

**Pourquoi le prompt et non l'écriture directe.** `createEvent` exigerait la permission d'écriture au calendrier — une demande intrusive pour une action que l'utilisateur vient précisément de déclencher. Le prompt lui montre l'événement, le laisse choisir son agenda et corriger l'heure. Aucune permission, et il garde la main.

L'import du plugin natif est **dynamique** : sur le web, ce module n'a rien à faire dans le bundle.

La durée annoncée n'est pas celle de la marche seule : on ajoute 15 minutes par lieu, sans quoi l'agenda afficherait une sortie deux fois trop courte. L'`UID` est dérivé du groupe, donc stable — rejouer l'ajout met l'événement à jour au lieu de le dupliquer.

### Les trois règles d'iCalendar qu'on oublie

Un fichier mal formé est refusé **sans message** par la moitié des agendas :

1. **Les fins de ligne sont CRLF**, pas LF. Google Agenda tolère, Outlook non.
2. **`\`, `;`, `,` et les retours à la ligne s'échappent** dans les champs texte. Une virgule non échappée dans un titre coupe la valeur.
3. **Les lignes de plus de 75 octets se plient**, la suite préfixée d'une espace. Le compte est en **octets**, pas en caractères : couper au milieu d'un caractère UTF-8 produit un fichier illisible — et « Cathédrale » suffit à déclencher le cas.

`verif/ics.ts` éprouve les trois, accents à la frontière de pliage compris.

## Flux typique — suivre le parcours du groupe

Le store solo `route` **n'est pas modifié** : il sait déjà tracer, guider et cocher. Le dupliquer pour le groupe aurait créé deux moteurs à maintenir. `groupRoute` traduit donc la décision en `RouteThematic` et la passe à `startRoute()` — carte, flèche de direction et checklist fonctionnent sans une ligne de plus.

1. Sur la page du groupe, « Suivre ce parcours » convertit la décision et redirige vers la carte.
2. `visitedSlugs` du store solo est écrasé par l'état de `visited_pois` : pour un parcours de groupe, c'est la base qui fait autorité, pas le `localStorage` de l'appareil.
3. Un `watch` compare les listes et propage les changements locaux. On observe plutôt qu'on n'intercepte : `toggleVisited` est appelé depuis plusieurs composants, et l'envelopper reviendrait à modifier le store solo.
4. Realtime applique les changements des autres membres. **Le drapeau `applicationDistante` coupe la boucle** — sans lui, un changement reçu du réseau repartirait aussitôt vers la base.
5. Seul l'identifiant du groupe est mémorisé en `localStorage` ; la décision est rechargée depuis la base au retour, pour ne jamais afficher un parcours périmé.

**`visited_pois` a une clé primaire `(group_id, poi_slug)`**, contrairement à `poi_votes` dont la clé est un uuid généré. Un `DELETE` transporte donc le slug dans son identité de réplique : le décochage d'un autre membre s'applique directement, sans rechargement. C'est vérifié explicitement — si l'hypothèse tombait, la checklist se désynchroniserait en silence.

**Le troisième piège d'upsert du projet** : cocher utilise `ignoreDuplicates` (`ON CONFLICT DO NOTHING`), et surtout **pas** `merge-duplicates`. Ce dernier produit un `ON CONFLICT DO UPDATE`, qui exige une policy `UPDATE` — or `visited_pois` n'en a pas — et le second membre à cocher recevrait un `403` silencieux. `DO NOTHING` dit d'ailleurs mieux l'intention : cocher un lieu déjà coché ne change rien, et le premier reste crédité.

## Flux typique — une visite hors ligne

1. `layouts/default.vue` monte le sélecteur de ville et hydrate la ville mémorisée.
2. `pages/index.vue` interroge la collection `pois`, filtre sur la ville active, et passe centre et zoom à la carte.
3. `loadCityBasemap` récupère l'archive PMTiles de la ville — servie par le service worker qui l'a pré-cachée — et Leaflet en dessine le fond vectoriel, sans aucune requête réseau.
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
- ❌ Télécharger des tuiles en masse depuis `tile.openstreetmap.org` : la politique de la fondation OSM l'interdit et le service refuse. Le fond de carte passe par l'extraction Protomaps, et rien d'autre.
- ❌ Compter sur `runtimeCaching` pour rendre le fond de carte disponible hors ligne : la règle est bien traversée par le service worker mais n'écrit jamais dans le Cache Storage. Les archives passent par `additionalManifestEntries`, dans le pré-cache.

## Stratégie de vérification

Le projet n'a **ni harnais de tests ni CI**. Les filets :

1. `npm run typecheck` (vue-tsc, TypeScript strict) — la vérification de référence avant tout commit.
2. `npm run verif` — exécute les fonctions pures de `utils/` avec `tsx` (agrégation des votes, iCalendar, stockage de session).
3. `supabase/tests/conformite.test.sql` — RLS, suppression et purge, sur une base jetable.
4. `npm run generate` — un build statique qui passe prouve que le contenu parse et que rien de client-only n'a fuité côté serveur.
5. L'appareil — GPS, caméra, tracé tactile, vibration et coffre chiffré ne se valident nulle part ailleurs.

## Dépendances externes

| Service | Usage | Comportement en cas de défaillance |
|---|---|---|
| Protomaps (basemap OSM, ODbL) | Fond de carte | Aucun appel au runtime : l'archive PMTiles est extraite au moment du build et pré-cachée. Le service n'est sollicité que par `npm run download-basemap`. |
| OSRM public (`router.project-osrm.org`) | Itinéraire piéton | Pré-chargé au démarrage, cache de 7 jours ; l'app reste utilisable sans tracé |
| Supabase | Comptes, groupes, pseudo, temps réel | Facultatif : sans configuration, seules les pages `/groups` sont hors service |
| Service d'Arpente (`service/`) | Passerelle de connexion, CAPTCHA, assistant IA | Sans lui, plus de connexion par code ; les sessions ouvertes continuent (rafraîchissement direct à GoTrue) |
| Cloudflare Turnstile | CAPTCHA avant l'envoi d'un code | Le cadre affiche « Réessayer » ; pas de code sans lui |
| Google (Credential Manager) | Connexion Google dans l'app | Le code par e-mail reste possible |
| Brevo (SMTP) | Envoi des codes de connexion | Quota quotidien partagé entre plusieurs apps : plafond d'envois dans GoTrue et CAPTCHA |
| Compilateur MindAR en ligne | Génération des fichiers `.mind` | Étape manuelle assumée : le paquet `canvas` dont dépend mind-ar ne compile pas sous Windows. `scripts/compile-targets.ts` documente la marche à suivre et vérifie la présence des fichiers. |

## Contenus tiers et attribution

Le fond de carte vient d'OpenStreetMap (ODbL) et les photographies des fiches de Wikimedia Commons. Sur 42 illustrations, 34 sont sous licence CC BY-SA ou CC BY : **nommer l'auteur et la licence est une obligation juridique**, que la redistribution par un store rend opposable.

`pages/credits.vue` porte ces mentions, alimentée par `assets/credits-images.json` — auteur, licence et lien vers la page du fichier, un par image. Le seul chemin qui y mène est un lien en bas de `/tips` : le retirer mettrait l'application en infraction, sans qu'aucun test ne s'en aperçoive.

Une image ajoutée sans sa ligne de crédit est un défaut de conformité. Le fichier se régénère depuis les métadonnées Commons ; les licences non libres sont refusées à la source, tout comme les appariements douteux — un article homonyme donne vite le portrait d'un notable en guise de médiathèque.

## Ouverture de l'app

`SplashScreen.vue` dessine la marque à chaque lancement : des pointillés montent puis redescendent le A comme un parcours sur la carte, le chemin se remplit, l'épingle tombe sur le sommet, la barre corail ferme la lettre, le mot monte. Six gestes, six notes de flûte en fa lydien — la mélodie monte jusqu'à l'épingle puis redescend, comme la lettre.

La grammaire est celle de DewDrop et DeckHand : 2,2 s d'animation, un plancher de 2,3 s pour quitter l'intro sur le logo posé, un toucher saute l'attente, et l'accueil est monté **sous** l'intro dès le premier rendu (`app.vue`), si bien que ses chargements partent pendant l'animation. L'intro se retire seule et émet `fini` après son fondu ; aucun minuteur extérieur ne la double.

- **Les battues sont jumelles.** `BATTUES` dans `SplashScreen.vue` (ms depuis le montage) et dans `scripts/gen-intro-jingle.ts` (s depuis la première note, soit 200 ms plus tard). Le CSS lit les premières via `--b1`…`--b6`. En déplacer une d'un seul côté désynchronise l'intro, ce qui ne s'entend qu'à l'oreille.
- **Mouvement et son partent au montage**, pas au premier affichage : le HTML généré ne montre que le fond. Sur une WebView lente à démarrer, lancer le CSS dès l'affichage le décalerait du son.
- **Le son n'est jamais une erreur.** Capacitor autorise la lecture sans geste (`setMediaPlaybackRequiresUserGesture(false)`) ; un navigateur la refuse, et en PWA hors ligne le MP3, hors du pré-cache, peut manquer. Dans les deux cas l'intro reste muette et continue.
- `prefers-reduced-motion` montre directement la dernière image, le temps du plancher.

## Plateforme Android

`android/` est un projet Capacitor **versionné**. Il contient ce qu'aucune régénération ne saurait reproduire : le `versionCode`, la configuration de signature, les permissions et les icônes. Le `.gitignore` que Capacitor y dépose écarte le dérivé — `build/`, `.gradle/`, `local.properties` et les assets web recopiés par `cap sync`, soit les 15 Mo du bundle et des fonds de carte.

`npm run generate` puis `npx cap sync android` suffisent à embarquer une nouvelle version du web. `npx cap add android` est à proscrire sur un projet existant : la commande réécrit le squelette.

**Le manifeste ne déclare que `INTERNET` et la géolocalisation** (fine et approximative, sans `ACCESS_BACKGROUND_LOCATION`). `VIBRATE` arrive par fusion depuis le manifeste du plugin Haptics. La caméra n'est pas demandée tant que le puzzle AR est éteint, et l'agenda pas davantage : `useCalendar` passe par `createEventWithPrompt`, qui confie l'écriture à l'application d'agenda du système.

**Icônes et écran de démarrage.** Ils dérivent tous de `assets/icon.png` (1024×1024). `capacitor-assets generate` met en place la matrice des densités, mais son résultat ne peut pas être conservé tel quel : l'outil traite l'icône source comme un *foreground* alors qu'elle est opaque et déjà composée, puis l'incruste avec 16,7 % de marge sur un fond blanc — d'où un liseré clair autour de l'icône, et un écran de démarrage blanc au milieu d'une app bleu nuit. Les fichiers en place ont donc été recomposés avec `sharp` :

- `mipmap-*/ic_launcher.png` et `ic_launcher_round.png` — l'icône complète, la seconde masquée par un cercle ;
- `mipmap-*/ic_launcher_background.png` — la même image en 108 dp, unique couche de l'icône adaptative : les XML de `mipmap-anydpi-v26/` déclarent un `<foreground>` transparent. La marque occupe 63 % du canvas, sous les 66 % visibles après masquage, donc aucun lanceur ne la rogne ;
- `drawable*/splash.png` — fond `#1a1a2e` et la marque seule, rasterisée depuis son SVG, à 30 % du plus petit côté.

`values/colors.xml` définit `colorPrimary`, `colorPrimaryDark` et `colorAccent`, que `styles.xml` référence sans que le squelette Capacitor ne les fournisse — sans ce fichier, la compilation échoue.

**Signature.** La convention est celle du conteneur — emplacement, alias `upload`, identité du certificat, câblage Gradle : [`../../docs/android-signing-guide.md`](../../docs/android-signing-guide.md). Ici, `android/app/build.gradle` lit `android/keystore.properties`, non versionné, qui désigne le keystore en **chemin absolu** — Gradle résout les chemins relatifs depuis `android/app/`, et une erreur de chemin y passe inaperçue. Le keystore et les mots de passe vivent dans `.arpente-secrets/`, à la racine du conteneur, jamais dans le dépôt.

Quand ce fichier manque, le build émet un avertissement et laisse l'AAB **non signé**, plutôt que de retomber sur la clé de débogage : un AAB signé en debug est accepté par Gradle et refusé par Play, c'est-à-dire découvert après l'envoi. Non signé, l'erreur est immédiate et se lit sur place.

## Poste de développement

**Sous Windows, `npm install` échoue** sur `canvas`, dépendance native de `mind-ar`, faute de chaîne d'outils MSVC. Installer avec `npm install --ignore-scripts` : Nuxt, le typecheck et le build statique fonctionnent normalement. Seule la compilation locale des cibles `.mind` reste indisponible — elle passe de toute façon par le compilateur MindAR en ligne (voir `scripts/compile-targets.ts`).

La caméra et la géolocalisation exigent un contexte sécurisé, y compris depuis une IP locale : le serveur de dev tourne donc en HTTPS. Le certificat est **auto-généré à chaque démarrage** par listhen, et couvre les IP du réseau local détectées — un téléphone sur le même Wi-Fi n'a qu'un avertissement d'auto-signature à accepter, sans erreur de nom. Aucun fichier `*.pem` à fournir.

## Secrets et configuration

`.env` (gitignoré, modèle dans `.env.example`) porte `NUXT_PUBLIC_SUPABASE_URL` et `NUXT_PUBLIC_SUPABASE_ANON_KEY`, relayés par `runtimeConfig.public`. La copie maîtresse vit dans `.arpente-secrets/`, à la racine du conteneur `Projets/`, hors de tout dépôt. Le serveur de développement n'exige plus aucun certificat : il en génère un à la volée, valable pour les IP locales détectées. La règle `*.pem` du `.gitignore` ne couvre plus qu'un certificat fourni à la main.
