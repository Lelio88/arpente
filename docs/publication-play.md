# Publication Google Play — Arpente

Procédure **propre à Arpente**. La procédure générique — ordre des sections, listes
exhaustives d'options, questionnaires IARC — vit hors du dépôt :
[`../../play-store-publication-guide.md`](../../play-store-publication-guide.md). Ce
fichier ne la répète pas : il porte **les réponses** de cette application.

**Cible : test fermé** (piste `alpha`). Google exige une première release envoyée à la
main avant d'ouvrir l'API.

---

## 1. Ce qui est prêt dans le dépôt

| Pièce | État |
|---|---|
| `applicationId` | `app.arpente` — **définitif** dès la première mise en ligne |
| Version | `versionCode 1`, `versionName 1.0.0` (`android/app/build.gradle`) |
| Signature | câblée sur `android/keystore.properties`, clé dans `.arpente-secrets/` |
| AAB | `android/app/build/outputs/bundle/release/app-release.aab` (~21 Mo) |
| Politique de confidentialité | <https://lelio88.github.io/arpente/privacy.html> |
| Icône 512 | `public/icons/icon-512.png` |
| Bannière 1024×500 | `assets/branding/feature-graphic.png` |
| Captures | `assets/branding/screenshots/{telephone,tablette-7,tablette-10}/` |
| Compte de test | **aucun** — l'app n'a pas de connexion |

Reconstruire l'AAB après toute modification :
`npm run generate && npx cap sync android && cd android && ./gradlew bundleRelease`.
**Incrémenter `versionCode` avant tout nouvel envoi** : Play refuse un numéro déjà reçu,
et le refus arrive après le téléversement.

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

<https://lelio88.github.io/arpente/privacy.html>

---

## 4. Informations de connexion (*App access*)

**Non**, aucune partie de l'application n'est limitée. Pas de compte, pas de paywall, pas
de code d'accès. L'authentification anonyme de Supabase n'est **pas** une connexion :
l'utilisateur ne saisit aucun identifiant. Aucun compte de test à fournir.

---

## 5. Annonces

- Contient des annonces ? → **Non** (aucun SDK publicitaire).
- Identifiant publicitaire ? → **Non**. L'app n'utilise ni AdMob, ni Firebase Analytics,
  ni aucun outil de mesure.

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
- Méthode de création de compte → **« ne permet pas de créer un compte »** (identité
  anonyme, sans identifiant ni mot de passe).
- Sous-question qui suit : *« Les utilisateurs peuvent-ils se connecter avec des comptes
  créés en dehors de l'appli ? »* → **Non**. Ni Google Sign-In, ni SSO, ni OAuth.
- Moyen de demander la suppression des données (facultatif) → **Oui**, par courriel à
  `heianenterpriseyt@gmail.com`. URL à fournir si demandée :
  <https://lelio88.github.io/arpente/privacy.html>, dont la section « Vos droits » décrit
  la procédure. **Surtout pas** la troisième option (« supprimées automatiquement sous
  90 jours ») : ce serait faux, aucune purge automatique n'existe.

| Donnée | Collectée / Partagée | Requise ? | Finalité | Pourquoi |
|---|---|---|---|---|
| **Position exacte** | Collectée **et partagée** | Optionnelle | Fonctionnement de l'appli | Le calcul d'itinéraire envoie départ et arrivée à **OSRM**, service tiers. C'est un partage, pas un sous-traitant. La position affichée sur la carte, elle, ne quitte pas l'appareil. |
| **Nom** (pseudonyme) | Collectée | Optionnelle | Fonctionnement de l'appli | Choisi librement, visible des membres du groupe. Groupes uniquement. |
| **ID utilisateur** | Collectée | Optionnelle | Fonctionnement de l'appli | Identifiant anonyme créé pour la fonction Groupes. |
| **Autre contenu généré par l'utilisateur** | Collectée | Optionnelle | Fonctionnement de l'appli | Nom du groupe, votes sur les lieux, étapes visitées. |

Toutes sont **optionnelles** : elles n'existent que si l'utilisateur ouvre la fonction
Groupes. Aucune n'est traitée de façon éphémère — elles sont stockées en base. Aucune
finalité d'analyse, de personnalisation ni de publicité.

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

- **Catégorie** : Voyages et infos locales
- **Tags** (max 5) : Voyage · Tourisme · Cartes et navigation · Éducation · Culture

**Description courte** (80 caractères max) :

```
Carte, parcours et fiches historiques : visitez la ville, même sans réseau.
```

**Description longue** :

```
Arpente est un guide de visite qui tient dans la poche et se passe de connexion.

UNE CARTE QUI FONCTIONNE HORS LIGNE
Le fond de carte est embarqué dans l'application. Aucune donnée mobile n'est
nécessaire pour se repérer, suivre un parcours ou lire une fiche : tout est là
avant même le départ.

DES FICHES QUI S'OUVRENT AU BON MOMENT
Approchez d'un monument et sa fiche apparaît : histoire, dates, anecdotes.
Plus de 150 lieux documentés à Caen et à Troyes, des abbayes romanes aux
maisons à pans de bois, des vestiges médiévaux aux traces de 1944.

DES PARCOURS THÉMATIQUES
Une douzaine d'itinéraires prêts à suivre — médiéval, architectural, gourmand,
romantique, mémoire de la guerre — avec distance, durée et étapes numérotées.

À PLUSIEURS, SI VOUS VOULEZ
Créez un groupe, partagez son code, votez pour les lieux qui vous tentent :
l'application compose l'itinéraire qui met tout le monde d'accord, et chacun
suit l'avancée du groupe.

RESPECTUEUX PAR CONSTRUCTION
Pas de compte à créer, pas de publicité, pas de traceur. Votre position ne
quitte pas votre téléphone, sauf pour calculer un itinéraire à pied.

Cartographie OpenStreetMap. Photographies Wikimedia Commons, auteurs crédités
dans l'application.
```

**Coordonnées** : `heianenterpriseyt@gmail.com` · site web :
<https://lelio88.github.io/arpente/>

**Visuels** — chemins dans le dépôt, section 1 ci-dessus.

---

## 13. Release en test fermé

Tests → **Test fermé** → Créer une version → téléverser l'AAB → laisser **Play App
Signing** activé → ajouter les testeurs → Envoyer pour examen.

⚠️ Un compte développeur **particulier créé après novembre 2023** doit réunir **12
testeurs pendant 14 jours continus** avant de pouvoir demander la production. Sans objet
si ce compte est antérieur ou a déjà satisfait l'exigence.

**Notes de version** — 500 caractères maximum par langue :

```
Première version de test.

Caen et Troyes : plus de 150 lieux, une douzaine de parcours, carte hors ligne.
La fonction Groupes permet de préparer une visite à plusieurs.

Ce qu'on aimerait savoir : la carte se charge-t-elle vite ? Les fiches
s'ouvrent-elles au bon endroit quand vous marchez ? Le parcours proposé par un
groupe vous semble-t-il cohérent ?
```

---

## 14. Après la première release

Inviter le compte de service sur cette application — Utilisateurs et autorisations →
`play-publisher@gen-lang-client-0893701619.iam.gserviceaccount.com`, limité à Arpente,
autorisation **Déployer les applications sur des canaux de test** et rien de plus. Les
envois suivants passeront alors par l'API (voir
[`../../play-store-publication-guide.md`](../../play-store-publication-guide.md) §13).

---

## Ce qui n'est volontairement pas dans cette version

- **Le puzzle en réalité augmentée** est désactivé (`utils/features.ts`) : ses cibles de
  reconnaissance d'image ne sont pas compilées. Ne pas le mentionner dans la fiche.
- **Six fiches sans illustration** — Musée de Normandie, Salle de l'Échiquier, Pont de
  Vaucelles, Saint-Étienne-le-Vieux, Saint-Ouen, Place de la Résistance. L'absence est
  gérée proprement à l'affichage.
