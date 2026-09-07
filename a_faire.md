# A faire : Photos de reference des meurtrieres

## Objectif

Prendre des photos de chaque meurtriere du Chateau de Caen pour que l'app puisse les reconnaitre en AR via MindAR.

## Sur place au chateau

### Consignes de prise de photo

- **3 a 5 photos par meurtriere** (pas plus)
- **Cadrer la meurtriere entiere** : le rond en bas + la fente verticale + un peu de pierre autour
- **Orientation portrait** (le telephone a la verticale, comme on tiendra le telephone en jouant)
- **Distance** : se placer a environ 50-80 cm de la meurtriere (la distance de jeu)
- **Varier legerement** entre les photos :
  - 1 photo bien de face
  - 1 photo decalee a gauche (~10-15°)
  - 1 photo decalee a droite (~10-15°)
  - 1 photo un peu plus proche (optionnel)
  - 1 photo un peu plus loin (optionnel)
- **Lumiere** : eviter le contre-jour (pas de soleil direct dans la fente). Idealement prendre les photos en lumiere diffuse (temps couvert) ou a l'ombre
- **Nettete** : s'assurer que la photo est nette, pas floue. Tapoter sur l'ecran pour faire la mise au point sur la pierre
- **Pas de doigts/ombres** dans le cadre

### Alternative : filmer + extraire des frames

Si c'est plus simple, filmer chaque meurtriere pendant 5 secondes en bougeant legerement, puis extraire les images :

```bash
ffmpeg -i video.mp4 -vf "fps=1" -q:v 2 meurtriere-XX-%02d.jpg
```

Puis choisir les 3-5 meilleures images (nettes, angles varies).

### Nommage des fichiers

Placer les photos dans `assets/targets/raw/` avec le nommage :

```
meurtriere-01.png       (ou .jpg)
meurtriere-01-b.png     (2e angle)
meurtriere-01-c.png     (3e angle)
meurtriere-02.png
meurtriere-02-b.png
...
```

### Noter pour chaque meurtriere

- **Emplacement** : quelle tour, quel mur, quel etage
- **Coordonnees GPS** : ouvrir Google Maps et copier les coords
- **Indice** : un texte court pour guider le joueur (ex: "Face nord, deuxieme ouverture en partant de la gauche")

## De retour a la maison

### 1. Compiler les fichiers .mind

Pour chaque meurtriere, aller sur le compilateur MindAR :

**https://hiukim.github.io/mind-ar-js-doc/tools/compile**

- Cliquer "Upload Images"
- Selectionner les 3-5 photos de la **meme** meurtriere
- Cliquer "Start"
- Attendre la compilation (~10-30 secondes)
- Telecharger le fichier `targets.mind`
- Le renommer et le placer dans `public/targets/` :
  - `meurtriere-01.mind`
  - `meurtriere-02.mind`
  - etc.

**Important** : 1 compilation = 1 meurtriere = 1 fichier .mind

### 2. Creer les fichiers puzzle YAML

Pour chaque nouvelle meurtriere, creer un fichier dans `content/puzzles/` en copiant le modele de `meurtriere-01.yaml` :

```yaml
id: "meurtriere-XX"
title: "Meurtriere de la Tour ..."
location:
  lat: 49.XXXX
  lng: -0.XXXX
  hint: "Description de l'emplacement"
difficulty: 1
target:
  mindFile: "/targets/meurtriere-XX.mind"
  imageIndex: 0
path:
  startPoint:
    x: 0.5
    y: 0.82
  points:
    # Adapter les coordonnees si la forme de la meurtriere est differente
    # x et y sont relatifs a l'image (0 = bord gauche/haut, 1 = bord droit/bas)
    - x: 0.5
      y: 0.82
    # ... (copier depuis meurtriere-01.yaml si la forme est la meme)
  tolerance: 30
  style:
    color: "#00FFAA"
    width: 6
    glowColor: "rgba(0, 255, 170, 0.25)"
    glowWidth: 20
successMessage: "Bravo ! ..."
reward:
  type: "anecdote"
  text: "..."
```

### 3. Verifier

```bash
npm run compile-targets    # verifie que tous les .mind sont presents
npm run dev                # tester en pointant le telephone vers une photo de meurtriere sur un ecran
```

## Checklist

- [ ] Photos des meurtrieres prises (3-5 par meurtriere)
- [ ] Photos placees dans `assets/targets/raw/`
- [ ] Fichiers .mind compiles via le site MindAR
- [ ] Fichiers .mind places dans `public/targets/`
- [ ] Fichiers YAML crees dans `content/puzzles/`
- [ ] Test en dev avec photo sur ecran
- [ ] Test reel au chateau
