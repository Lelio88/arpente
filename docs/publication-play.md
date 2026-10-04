# Publication Google Play — Arpente

Procédure **propre à Arpente**. La procédure générique — ordre des sections, listes
exhaustives d'options, questionnaires IARC — vit hors du dépôt :
[`../../docs/play-store-publication-guide.md`](../../docs/play-store-publication-guide.md). Ce
fichier ne la répète pas : il porte **les réponses** de cette application.

**Cible : test fermé** (piste `alpha`). La première release est partie à la main, comme
Google l'exige ; les suivantes passent par l'API, avec `scripts/publish_play.py`.

---

## 1. Ce qui est prêt dans le dépôt

| Pièce | État |
|---|---|
| `applicationId` | `app.arpente` — **définitif** dès la première mise en ligne |
| Version | voir `versionCode` / `versionName` dans `android/app/build.gradle` |
| Signature | câblée sur `android/keystore.properties`, clé dans `.arpente-secrets/` |
| AAB | `android/app/build/outputs/bundle/release/app-release.aab` (~21 Mo) |
| Politique de confidentialité | <https://arpente.heianenterprise.com/privacy.html> |
| Suppression du compte (web) | <https://api.arpente.heianenterprise.com/suppression-compte> |
| Icône 512 | `public/icons/icon-512.png` |
| Bannière 1024×500 | `assets/branding/feature-graphic.png` |
| Captures | `assets/branding/screenshots/{telephone,tablette-7,tablette-10}/` |
| Compte de test | **aucun** — l'examinateur se connecte avec son propre compte Google (§4) |

Reconstruire l'AAB après toute modification :
`npm run generate && npx cap sync android && cd android && ./gradlew bundleRelease`.
**Incrémenter `versionCode` avant tout nouvel envoi** : Play refuse un numéro déjà reçu,
et le refus arrive après le téléversement. Gradle 8 ne lit pas un JDK 25 (« Unsupported
class file major version 69 ») : si c'est le Java par défaut, pointer `JAVA_HOME` sur le
JDK 21 fourni avec Android Studio (`jbr/`).

Publier sur la piste de test, essai à blanc d'abord :

```bash
python scripts/publish_play.py --track alpha --language fr-FR --notes-file notes.txt --dry-run
python scripts/publish_play.py --track alpha --language fr-FR --notes-file notes.txt
```

Le script est **commun à tous les dépôts du conteneur** : on le recopie, on ne le modifie
pas ici. Il lit la clé du compte de service `play-publisher` dans `.play-secrets/`, à la
racine du conteneur, et ce compte n'a de droits que sur les pistes de test — la
production reste hors de sa portée. L'essai à blanc téléverse le bundle mais abandonne
l'edit : le `versionCode` n'est pas consommé. Dépend de `google-auth` et `requests`.

---

## 2. Créer l'application

| Champ | Réponse |
|---|---|
| Nom de l'application | `Arpente` |
| Nom du package | `app.arpente` — déjà compilé dans l'AAB. Si la console ne le demande pas à la création, elle le déduit du premier bundle téléversé. **Définitif** dans les deux cas. |
| Langue par défaut | Français (France) – fr-FR |
| Application ou jeu | **Application** |
| Gratuite ou payante | **Gratuite** — irréversible dans ce sens |
| Déclarations | cocher les deux |

---

## 3. Règles de confidentialité

<https://arpente.heianenterprise.com/privacy.html>

---

## 4. Informations de connexion (*App access*)

**Certaines fonctionnalités sont limitées** : la fonction Groupes demande un compte. La
carte, les parcours et les fiches restent libres. Aucun identifiant à fournir — la
connexion n'a pas de mot de passe, et le code par e-mail n'arriverait pas chez
l'examinateur — mais une instruction, qui l'envoie vers Google :

```
La carte, les parcours et les fiches sont accessibles sans compte. Seul l'onglet « Groupes » demande une connexion : touchez « Continuer avec Google » et utilisez n'importe quel compte Google (aucune invitation n'est nécessaire). La connexion par e-mail envoie un code à 6 chiffres à l'adresse saisie. Une fois connecté, créez un groupe : son code d'invitation permet à un second appareil de le rejoindre.
```

---

## 5. Annonces

- Contient des annonces ? → **Non** (aucun SDK publicitaire).
- Identifiant publicitaire ? → **Non**. L'app n'utilise ni AdMob, ni Firebase Analytics,
  ni aucun outil de mesure. Google recoupe cette réponse avec la permission
  `com.google.android.gms.permission.AD_ID` du manifeste fusionné, absente ici — se
  vérifie sans la console :

  ```bash
  aapt2 dump permissions android/app/build/outputs/apk/debug/app-debug.apk
  ```

---

## 6. Classification du contenu (IARC)

- E-mail : `heianenterpriseyt@gmail.com`
- Catégorie : **Tous les autres types d'applications**

Toutes les questions sur la violence, la peur, la sexualité, les jeux d'argent, le
langage, les substances, l'humour grossier, les achats numériques, les symboles nazis,
l'identité nationale, le terrorisme et les techniques criminelles → **Non**. L'application
montre des monuments et des textes historiques.

**Interaction entre utilisateurs → Oui.** Il n'y a pas de messagerie, mais un membre voit
le **pseudonyme** des autres et le **nom du groupe**, deux champs de texte libre. Sous-
déclarer expose à un retrait ; le sous-questionnaire se répond ainsi :

| Question | Réponse |
|---|---|
| Bloquer des utilisateurs ? | Non |
| Signaler des utilisateurs ou du contenu ? | Non |
| Modération des échanges ? | Non |
| Interactions limitées à des personnes invitées ? | **Oui** — on rejoint un groupe par un code privé, il n'existe aucun appariement public |

### Section « Divers » — tout à Non

| Question | Réponse |
|---|---|
| Partage de l'emplacement précis avec **d'autres utilisateurs** | **Non**. Aucune table ne stocke de coordonnées d'utilisateur : les membres voient les étapes cochées (`visited_pois`), jamais où quelqu'un se trouve. Sans contradiction avec la Data safety, qui déclare la position partagée **avec OSRM** — un service, pas un visiteur. |
| Achats d'articles numériques | Non |
| Récompenses, crypto, NFT | Non |
| Navigateur Web ou moteur de recherche | **Non**, bien que l'app tourne dans une WebView Capacitor : l'utilisateur ne peut ouvrir aucune URL de son choix. |
| Produit d'actualité ou d'éducation | **Non**. Les fiches sont documentaires, mais l'app n'est ni un média ni un produit pédagogique structuré — et sa catégorie est Voyages, pas Éducation. À revoir si cette catégorie changeait. |

---

## 7. Public cible

Tranches **18 ans et plus**, uniquement : cibler une tranche mineure déclencherait les
contrôles « public mixte » et la déclaration des normes de sécurité des enfants, alors
que l'app enregistre un pseudonyme et laisse des visiteurs se voir entre eux. Sans
conséquence pour les testeurs — un choix 18+ ne bloque pas le téléchargement et n'écarte
que les comptes supervisés par Family Link.

- **Pourrait attirer involontairement les enfants ?** → **Non**. Ni personnage animé, ni
  musique enfantine, ni mécanique de jeu : une carte, des photos de monuments, des textes
  historiques. La question mériterait réexamen si le puzzle AR était réactivé.
- **Programme Familles** → ne pas s'inscrire.

---

## 8. Sécurité des données

**Collecte ou partage de données ? Oui.** Deux flux sortent de l'appareil, et deux
seulement.

- Chiffrées en transit ? → **Oui** (HTTPS de bout en bout).
- Méthodes de création de compte → **« Nom d'utilisateur et autre méthode
  d'authentification »** (adresse e-mail et code à usage unique, sans mot de passe) **et**
  **« OAuth »** (Google).
- *« Les utilisateurs peuvent-ils se connecter avec des comptes créés en dehors de
  l'appli ? »* → **Oui** (compte Google).
- **URL de suppression du compte** (obligatoire dès qu'on crée des comptes) →
  <https://api.arpente.heianenterprise.com/suppression-compte> : connexion par code ou
  Google, puis confirmation. Dans l'app : *Groupes → Mon compte → Supprimer mon compte*.
- Suppression d'une partie des données sans supprimer le compte (facultatif) → **Non**.
- **Pas** l'option « supprimées automatiquement sous 90 jours » : les purges existent,
  mais à 6 mois pour un groupe et 1 an pour un compte inactif.
- Cette section s'envoie aussi par l'API (`applications.dataSafety`, CSV du modèle de
  Google) : les réponses ci-dessous en sont la source.

| Donnée | Collectée | Partagée | Éphémère | Requise ? | Finalités |
|---|---|---|---|---|---|
| **Position exacte** | ✔ | **✔** | Non | Facultative | Fonctionnement de l'appli |
| **Adresse e-mail** | ✔ | ✗ | Non | Facultative | Fonctionnement de l'appli · Gestion du compte |
| **Nom** (pseudonyme ; nom transmis par Google) | ✔ | ✗ | Non | Facultative | Fonctionnement de l'appli · Gestion du compte |
| **ID utilisateur** | ✔ | ✗ | Non | Facultative | Fonctionnement de l'appli · Gestion du compte |
| **Autre contenu généré par l'utilisateur** | ✔ | ✗ | Non | Facultative | Fonctionnement de l'appli |

**« Partagée » n'est coché que pour la position**, et c'est le piège de cette section. Le
calcul d'itinéraire envoie départ et arrivée à **OSRM**, une organisation extérieure :
c'est un partage. Ne sont **pas** des partages au sens de Google :
- les autres membres d'un groupe, qui voient le pseudonyme — des utilisateurs de la même
  app ne sont pas « un tiers », et le Supabase auto-hébergé est notre propre backend ;
- **Brevo** (envoi du code) et **Cloudflare Turnstile** (anti-robot), prestataires qui
  traitent pour notre compte ;
- l'**assistant IA**, qui ne reçoit des données que sur un geste explicite de
  l'utilisateur (l'accord), cas que Google exclut nommément du partage.

Turnstile examine l'adresse IP et des signaux techniques du navigateur le temps du
contrôle, sans identifiant d'appareil persistant : aucun type de la liste de Google.

**Aucune n'est éphémère** : « éphémère » désigne une donnée gardée en mémoire le temps de
répondre à une requête, jamais écrite. Tout ce qui est listé ici atterrit dans une table
Postgres (`profiles`, `poi_votes`, `visited_pois`, `groups`). La position affichée sur la
carte, elle, *serait* éphémère — mais la même donnée partant chez OSRM, la réponse **Non**
reste la juste.

**Toutes facultatives** : elles n'existent que si l'utilisateur ouvre la fonction Groupes,
seule à demander un compte. Aucune finalité d'analyse, de personnalisation ni de
publicité — seuls « Fonctionnement de l'appli » et, pour ce qui identifie le compte,
« Gestion du compte » sont cochés.

**Non collectées**, malgré ce qu'on pourrait croire : contacts, photos, fichiers, agenda
(l'ajout d'un parcours passe par l'application d'agenda du système, qui écrit elle-même),
journaux de plantage, identifiants publicitaires.

---

## 9 à 11. Gouvernement, finance, santé

- Application gouvernementale → **Non**
- Fonctionnalités financières → **« ne fournit aucune fonctionnalité financière »**
- Fonctionnalités de santé → **« ne propose aucune fonctionnalité de santé »**

---

## 12. Fiche du Play Store

- **Catégorie** : **Voyages et infos locales**. Pas *Cartes et navigation* — la carte est le
  support, pas le produit. Et surtout pas *Éducation*, qui contredirait la réponse IARC
  « produit d'actualité ou d'éducation → Non » : les deux doivent concorder.
- **Tags** (5 maximum, choisis dans une liste fermée) — par ordre de priorité : guide de
  voyage ou tourisme · cartes ou navigation · histoire, culture ou musées · hors ligne s'il
  existe, c'est le vrai différenciateur · ville ou découverte locale. Aucun tag évoquant
  l'éducation, pour la même raison de cohérence.

**Description courte** (80 caractères max) :

```
Carte, parcours et fiches historiques : visitez la ville, même sans réseau.
```

**Description longue** (~1 250 caractères sur 4 000).

⚠️ **Play conserve les retours à la ligne.** Ne pas replier ces paragraphes pour la
lisibilité du fichier : collés tels quels, les pliures apparaîtraient au milieu des phrases
sur un téléphone. Un paragraphe = une ligne.

```
Arpente est un guide de visite qui tient dans la poche et se passe de connexion.

UNE CARTE QUI FONCTIONNE HORS LIGNE
Le fond de carte est embarqué dans l'application. Aucune donnée mobile n'est nécessaire pour se repérer, suivre un parcours ou lire une fiche : tout est là avant même le départ.

DES FICHES QUI S'OUVRENT AU BON MOMENT
Approchez d'un monument et sa fiche apparaît : histoire, dates, anecdotes. Plus de 150 lieux documentés à Caen et à Troyes, des abbayes romanes aux maisons à pans de bois, des vestiges médiévaux aux traces de 1944.

DES PARCOURS THÉMATIQUES
Une douzaine d'itinéraires prêts à suivre — médiéval, architectural, gourmand, romantique, mémoire de la guerre — avec distance, durée et étapes numérotées.

À PLUSIEURS, SI VOUS VOULEZ
Connectez-vous avec un code reçu par e-mail ou avec Google, créez un groupe, partagez son code, votez pour les lieux qui vous tentent : l'application compose l'itinéraire qui met tout le monde d'accord, et chacun suit l'avancée du groupe.

RESPECTUEUX PAR CONSTRUCTION
Pas de compte pour visiter, pas de publicité, pas de traceur. Votre position ne quitte pas votre téléphone, sauf pour calculer un itinéraire à pied. Votre adresse e-mail n'est montrée à personne, pas même aux membres de vos groupes.

Cartographie OpenStreetMap. Photographies Wikimedia Commons, auteurs crédités dans l'application.
```

**Coordonnées** : `heianenterpriseyt@gmail.com` · site web :
<https://arpente.heianenterprise.com/>

**Visuels** — chemins dans le dépôt, section 1 ci-dessus.

---

## 13. Release en test fermé

Tests → **Test fermé** → Créer une version → téléverser l'AAB → laisser **Play App
Signing** activé → ajouter les testeurs → Envoyer pour examen.

⚠️ Un compte développeur **particulier créé après novembre 2023** doit réunir **12
testeurs pendant 14 jours continus** avant de pouvoir demander la production. Sans objet
si ce compte est antérieur ou a déjà satisfait l'exigence.

**Notes de version** — 399 caractères sur les 500 autorisés par langue. Mêmes retours à la
ligne conservés que pour la description : un paragraphe par ligne, sans repli.

```
Première version de test.

Caen et Troyes : plus de 150 lieux, 12 parcours, carte utilisable hors ligne. La fonction Groupes permet de préparer une visite à plusieurs.

Ce qui nous intéresse : la carte se charge-t-elle vite ? Les fiches s'ouvrent-elles au bon endroit quand vous marchez dans la rue ? Le parcours composé par un groupe vous paraît-il cohérent ?

Retours : heianenterpriseyt@gmail.com
```

Elles posent des questions au lieu de vanter l'app : ce qui n'a pas pu être vérifié ici,
c'est précisément le comportement en marchant — proximité GPS, vitesse de chargement de la
carte dehors. L'adresse de retour évite qu'un testeur trouve un bug sans savoir où le dire.

**Pays/régions** : tout cocher (la case en tête de tableau sélectionne les 175). Sans effet
réel en test fermé — seuls les testeurs de la liste installent — mais cette sélection est
reprise telle quelle le jour d'une promotion en production.

**Testeurs** : les listes d'adresses sont définies au niveau du **compte**, pas de l'app.
Réutiliser celle des autres applications plutôt que de ressaisir des adresses
(*Configuration → Test interne et fermé → Listes d'adresses e-mail*).

---

## 14. Après la première release

Inviter le compte de service sur cette application — Utilisateurs et autorisations →
`play-publisher@gen-lang-client-0893701619.iam.gserviceaccount.com`, limité à Arpente,
autorisation **Déployer les applications sur des canaux de test** et rien de plus. Les
envois suivants passeront alors par l'API (voir
[`../../docs/play-store-publication-guide.md`](../../docs/play-store-publication-guide.md) §13).

---

## Ce qui n'est volontairement pas dans cette version

- **Le puzzle en réalité augmentée** est désactivé (`utils/features.ts`) : ses cibles de
  reconnaissance d'image ne sont pas compilées. Ne pas le mentionner dans la fiche.
- **Six fiches sans illustration** — Musée de Normandie, Salle de l'Échiquier, Pont de
  Vaucelles, Saint-Étienne-le-Vieux, Saint-Ouen, Place de la Résistance. L'absence est
  gérée proprement à l'affichage.
