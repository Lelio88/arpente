/**
 * Génère le jingle de l'écran d'ouverture d'Arpente.
 *
 * **Un script plutôt qu'un fichier déposé**, comme chez DewDrop et DeckHand :
 * un son se refait — une note qui traîne, un volume qui gêne sur haut-parleur
 * de téléphone, une battue qu'on déplace. Le script le régénère à l'identique ;
 * un MP3 figé obligerait à rouvrir un éditeur et à retrouver les valeurs.
 *
 * **Le rythme est celui de l'animation, pas l'inverse.** Une note par geste :
 * les pointillés qui montent la jambe gauche, ceux qui descendent la droite, le
 * trait qui se remplit, l'épingle qui touche le sommet, la barre corail, le mot.
 * [BATTUES] est jumelle de `BATTUES` dans `components/ui/SplashScreen.vue` :
 * déplacer l'une sans l'autre désynchronise l'intro, et cela ne s'entend qu'à
 * l'oreille.
 *
 * **Six notes, comme les deux autres applications, et une autre couleur.**
 * DewDrop monte un arpège de do majeur en 8-bit, DeckHand descend sur une
 * corde pincée en sol mixolydien. Arpente souffle dans du bois, en fa lydien,
 * et dessine son A : trois notes qui montent, le sommet sur l'épingle, puis la
 * redescente — le si naturel, quarte augmentée du lydien, porte la barre, et
 * le mot se pose sur une tierce fa–la.
 *
 * **Le timbre n'est pas un réglage mais une description.** Une flûte, c'est un
 * fondamental presque pur, des harmoniques faibles, un souffle filtré qui
 * claque à l'attaque (le « chiff ») puis persiste en fond, et un vibrato qui
 * n'arrive qu'après la note posée. Toucher ces coefficients change
 * l'instrument, pas le volume.
 *
 * **Déterministe** : le souffle vient d'un générateur pseudo-aléatoire à graine
 * fixe, donc deux exécutions produisent le même fichier.
 *
 * Usage :
 *
 *     npm run gen-jingle
 *
 * Écrit `public/audio/arpente_intro.mp3`. Exige `ffmpeg` sur le PATH pour
 * l'encodage ; sans lui, le WAV intermédiaire reste dans le dossier.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SORTIE = join(RACINE, 'public', 'audio')
const NOM = 'arpente_intro'

/**
 * Les six battues, en secondes depuis la première note.
 *
 * **Jumelle de `BATTUES` dans `SplashScreen.vue`**, où le son démarre à 0,2 s :
 * ces valeurs sont relatives à cet instant, pas à l'ouverture de l'écran. Même
 * cadence que DeckHand, par grammaire commune.
 */
const BATTUES = [0.0, 0.3, 0.6, 0.9, 1.1, 1.4]

/** Fréquence d'une note MIDI (la4 = 69 = 440 Hz). */
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

const FA5 = 77
const SOL5 = 79
const LA5 = 81
const SI5 = 83
const DO6 = 84

interface Note {
  /** Notes jouées ensemble — la dernière est une tierce. */
  midi: number[]
  /** Durée tenue, relâchement compris. */
  duree: number
  /** Accent relatif : le sommet est un peu plus appuyé. */
  force: number
}

const MELODIE: Note[] = [
  { midi: [FA5], duree: 0.3, force: 0.8 },
  { midi: [SOL5], duree: 0.3, force: 0.8 },
  { midi: [LA5], duree: 0.3, force: 0.85 },
  { midi: [DO6], duree: 0.22, force: 1.0 },
  { midi: [SI5], duree: 0.3, force: 0.85 },
  { midi: [FA5, LA5], duree: 0.95, force: 0.9 },
]

/** Générateur mulberry32 : le souffle doit être identique d'un rendu à l'autre. */
function aleatoire(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1
  }
}

// Harmoniques d'une flûte douce : le fondamental domine, le reste colore.
const HARMONIQUES = [1.0, 0.18, 0.07, 0.025]
const ATTAQUE = 0.035
const RELACHE = 0.09
const VIBRATO_HZ = 5.2
const VIBRATO_PROFONDEUR = 0.0045
const VIBRATO_DELAI = 0.13
const CHIFF = 0.22
const SOUFFLE = 0.035

/** Rend une voix de flûte dans `buf`, à partir de l'échantillon `debut`. */
function flute(buf: Float32Array, debut: number, f0: number, duree: number, force: number, graine: number): void {
  const bruit = aleatoire(graine)
  const n = Math.floor(duree * SR)
  // Filtre d'état variable (Chamberlin) : passe-bande centré sur le 2e
  // harmonique, là où le souffle d'une flûte s'entend.
  const fc = 2 * Math.sin((Math.PI * Math.min(2 * f0, SR / 6)) / SR)
  const q = 0.5
  let bas = 0
  let bande = 0
  let phase = 0
  for (let i = 0; i < n && debut + i < buf.length; i++) {
    const t = i / SR
    const monte = t < ATTAQUE ? Math.sin((Math.PI / 2) * (t / ATTAQUE)) ** 2 : 1
    const reste = duree - t
    const descend = reste < RELACHE ? reste / RELACHE : 1
    const env = monte * descend

    const vib = t < VIBRATO_DELAI ? 0 : Math.min(1, (t - VIBRATO_DELAI) / 0.15)
    const f = f0 * (1 + VIBRATO_PROFONDEUR * vib * Math.sin(2 * Math.PI * VIBRATO_HZ * t))
    phase += (2 * Math.PI * f) / SR

    let ton = 0
    HARMONIQUES.forEach((a, k) => {
      ton += a * Math.sin((k + 1) * phase)
    })

    const haut = bruit() - bas - q * bande
    bande += fc * haut
    bas += fc * bande
    const chiff = CHIFF * Math.exp(-t / 0.045)
    const souffle = bande * (chiff + SOUFFLE)

    buf[debut + i] = buf[debut + i]! + force * env * (0.55 * ton + souffle)
  }
}

/**
 * Réverbération de Schroeder, courte : une salle, pas une cathédrale.
 * Quatre peignes en parallèle puis deux passe-tout en série.
 */
function reverbere(sec: Float32Array, melange: number): Float32Array {
  const peigne = (x: Float32Array, retard: number, g: number): Float32Array => {
    const y = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) y[i] = x[i]! + (i >= retard ? g * y[i - retard]! : 0)
    return y
  }
  const passeTout = (x: Float32Array, retard: number, g: number): Float32Array => {
    const y = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      const xr = i >= retard ? x[i - retard]! : 0
      const yr = i >= retard ? y[i - retard]! : 0
      y[i] = -g * x[i]! + xr + g * yr
    }
    return y
  }
  const humide = new Float32Array(sec.length)
  for (const [ms, g] of [[29.7, 0.72], [37.1, 0.7], [41.1, 0.68], [43.7, 0.66]] as const) {
    const c = peigne(sec, Math.round((ms / 1000) * SR), g)
    for (let i = 0; i < sec.length; i++) humide[i] = humide[i]! + c[i]! / 4
  }
  const diffuse = passeTout(passeTout(humide, Math.round(0.005 * SR), 0.7), Math.round(0.0017 * SR), 0.7)
  return sec.map((v, i) => (1 - melange) * v + melange * diffuse[i]!)
}

function rendre(): Float32Array {
  const queue = 0.6
  const total = BATTUES[BATTUES.length - 1]! + MELODIE[MELODIE.length - 1]!.duree + queue
  const sec = new Float32Array(Math.ceil(total * SR))
  MELODIE.forEach((note, i) => {
    const debut = Math.round(BATTUES[i]! * SR)
    note.midi.forEach((m, v) => {
      // La voix du dessous d'une tierce est plus douce : on doit entendre la
      // mélodie arriver sur le la, pas un accord plaqué.
      const force = note.force * (v === 0 && note.midi.length > 1 ? 0.6 : 1)
      flute(sec, debut, hz(m), note.duree, force, 1000 + i * 10 + v)
    })
  })
  const mix = reverbere(sec, 0.22)
  const crete = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  // Crête à -1 dBFS : le volume média du téléphone fait le reste.
  const gain = 0.89 / crete
  return mix.map((v) => v * gain)
}

function ecrireWav(chemin: string, s: Float32Array): void {
  const donnees = Buffer.alloc(s.length * 2)
  s.forEach((v, i) => donnees.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2))
  const entete = Buffer.alloc(44)
  entete.write('RIFF', 0)
  entete.writeUInt32LE(36 + donnees.length, 4)
  entete.write('WAVEfmt ', 8)
  entete.writeUInt32LE(16, 16)
  entete.writeUInt16LE(1, 20) // PCM
  entete.writeUInt16LE(1, 22) // mono
  entete.writeUInt32LE(SR, 24)
  entete.writeUInt32LE(SR * 2, 28)
  entete.writeUInt16LE(2, 32)
  entete.writeUInt16LE(16, 34)
  entete.write('data', 36)
  entete.writeUInt32LE(donnees.length, 40)
  writeFileSync(chemin, Buffer.concat([entete, donnees]))
}

mkdirSync(SORTIE, { recursive: true })
const wav = join(SORTIE, `${NOM}.wav`)
const mp3 = join(SORTIE, `${NOM}.mp3`)
ecrireWav(wav, rendre())
try {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '3', mp3])
  rmSync(wav)
  console.log(`Jingle écrit : ${mp3}`)
} catch {
  console.warn(`ffmpeg indisponible : WAV laissé tel quel (${wav})`)
  process.exitCode = 1
}
