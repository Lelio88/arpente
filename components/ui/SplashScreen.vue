<script setup lang="ts">
/**
 * L'écran d'ouverture : le A se trace comme un parcours sur la carte.
 *
 * **Portage de la maquette validée à l'œil et à l'oreille**, sur le modèle des
 * intros de DewDrop et DeckHand : les pointillés montent puis redescendent la
 * lettre, le chemin se remplit, l'épingle tombe sur le sommet, la barre corail
 * ferme le A, le mot monte. SVG et CSS sont repris tels quels — toute retouche
 * du mouvement se juge d'abord à l'œil, pas dans le code.
 *
 * **Même grammaire que les deux autres apps** : 2,2 s d'animation, un plancher
 * de 2,3 s pour qu'on voie le logo posé, six notes, un toucher saute l'attente,
 * et l'accueil est monté *sous* l'intro dès le premier rendu (`app.vue`).
 *
 * **Invariant : [BATTUES] est jumelle de `BATTUES` dans
 * `scripts/gen-intro-jingle.ts`**, décalée de [DEBUT_SON]. Les gestes CSS
 * lisent ces valeurs via les variables `--b1`…`--b6`. Déplacer une battue d'un
 * côté sans l'autre désynchronise l'intro, et cela ne s'entend qu'à l'oreille.
 *
 * **L'animation part au montage, pas au premier affichage.** Le HTML généré
 * montre le fond seul ; le son et le mouvement démarrent ensemble quand Vue
 * prend la main, sinon un démarrage lent de la WebView les décalerait.
 *
 * **Le son n'est jamais une erreur** : navigateur qui refuse la lecture sans
 * geste, fichier absent du cache hors ligne — l'intro reste muette et continue.
 * Dans l'app, Capacitor autorise la lecture sans geste.
 */

/** Les six battues, en ms depuis le montage — cf. invariant ci-dessus. */
const BATTUES = [200, 500, 800, 1100, 1300, 1600] as const
/** Le jingle part avec le premier geste, pas avec l'écran. */
const DEBUT_SON = BATTUES[0]
/** 100 ms de plus que l'animation (2 200 ms) : on quitte l'intro sur le logo. */
const PLANCHER = 2300
const JINGLE = '/audio/arpente_intro.mp3'

const emit = defineEmits<{ fini: [] }>()

const visible = ref(true)
const etat = ref<'attente' | 'joue' | 'fige'>('attente')
const battues = Object.fromEntries(BATTUES.map((ms, i) => [`--b${i + 1}`, `${ms}ms`]))

let minuteurSon: ReturnType<typeof setTimeout> | undefined
let minuteurFin: ReturnType<typeof setTimeout> | undefined

function jouerLeSon(): void {
  const audio = new Audio(JINGLE)
  audio.play().catch(() => { /* muet plutôt qu'en erreur, cf. en-tête */ })
}

function decouvrir(): void {
  clearTimeout(minuteurFin)
  visible.value = false
}

onMounted(() => {
  const calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  etat.value = calme ? 'fige' : 'joue'
  minuteurSon = setTimeout(jouerLeSon, DEBUT_SON)
  minuteurFin = setTimeout(decouvrir, PLANCHER)
})

onBeforeUnmount(() => {
  // Le son déjà lancé finit sa note ; seul un son pas encore parti est annulé.
  clearTimeout(minuteurSon)
  clearTimeout(minuteurFin)
})
</script>

<template>
  <Transition name="splash-fade" @after-leave="emit('fini')">
    <div
      v-if="visible"
      class="splash"
      :class="{ joue: etat === 'joue', fige: etat === 'fige' }"
      :style="battues"
      @click="decouvrir"
    >
      <div class="splash-content">
        <!-- Le monogramme de l'app, identique à l'icône du lanceur et à
             l'écran de démarrage natif (drawable*/splash.png) : l'intro le
             dessine, sa dernière image est la marque. -->
        <svg class="marque" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <linearGradient id="splashCorail" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stop-color="#e94560" />
              <stop offset="1" stop-color="#ff9a6b" />
            </linearGradient>
            <mask id="splashMasqueGauche" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
              <path class="anime pointilles-g" d="M 168 382 L 256 148" pathLength="1" fill="none" stroke="#fff" stroke-width="40" />
            </mask>
            <mask id="splashMasqueDroite" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
              <path class="anime pointilles-d" d="M 256 148 L 344 382" pathLength="1" fill="none" stroke="#fff" stroke-width="40" />
            </mask>
          </defs>
          <g
            class="anime pointilles" fill="none" stroke="#eaeaea" stroke-width="14"
            stroke-linecap="round" stroke-dasharray="0 30" opacity=".6"
          >
            <path d="M 168 382 L 256 148" mask="url(#splashMasqueGauche)" />
            <path d="M 256 148 L 344 382" mask="url(#splashMasqueDroite)" />
          </g>
          <path
            class="anime trait" d="M 168 382 L 256 148 L 344 382" pathLength="1" fill="none"
            stroke="#eaeaea" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"
          />
          <path
            class="anime barre" d="M 208 306 L 304 306" pathLength="1" fill="none"
            stroke="#f2604f" stroke-width="28" stroke-linecap="round"
          />
          <circle class="anime onde" cx="256" cy="148" r="23" fill="none" stroke="#ff9a6b" stroke-width="5" />
          <circle class="anime epingle" cx="256" cy="148" r="23" fill="url(#splashCorail)" />
        </svg>
        <h1 class="anime splash-title">Arpente</h1>
        <p class="anime splash-subtitle">Découvrez la ville autrement</p>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

$sortie: cubic-bezier(.33, 1, .68, 1);

.splash {
  position: fixed;
  inset: 0;
  background: $color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.splash-content {
  text-align: center;
}

.marque {
  display: block;
  width: 112px;
  height: 112px;
  margin: 0 auto $spacing-lg;
  overflow: visible;
}

.splash-title {
  font-size: $font-size-2xl;
  font-weight: 700;
  color: $color-text;
  margin-bottom: $spacing-xs;
}

.splash-subtitle {
  font-size: $font-size-sm;
  color: $color-text-muted;
}

// Avant le montage, rien n'est dessiné : l'écran attend le premier geste.
.splash:not(.joue):not(.fige) .anime {
  visibility: hidden;
}

.pointilles-g, .pointilles-d, .trait, .barre { stroke-dasharray: 1 1; }
.epingle, .onde { transform-box: fill-box; }
.epingle { transform-origin: 50% 100%; }
.onde { transform-origin: 50% 50%; opacity: 0; }

.joue {
  .pointilles-g { animation: dessine 300ms $sortie var(--b1) both; }
  .pointilles-d { animation: dessine 300ms $sortie var(--b2) both; }
  .pointilles { animation: eteint 200ms ease calc(var(--b3) + 250ms) both; }
  .trait { animation: dessine 260ms cubic-bezier(.65, 0, .35, 1) var(--b3) both; }
  // La chute dure 180 ms : l'épingle touche le sommet pile sur la battue.
  .epingle { animation: tombe 330ms linear calc(var(--b4) - 180ms) both; }
  // « forwards », pas « both » : l'onde ne doit pas se voir pendant son délai.
  .onde { animation: onde 600ms $sortie var(--b4) forwards; }
  .barre { animation: dessine 240ms $sortie var(--b5) both; }
  .splash-title { animation: monte 400ms $sortie var(--b6) both; }
  .splash-subtitle { animation: monte 400ms $sortie calc(var(--b6) + 120ms) both; }
}

.splash-fade-leave-active {
  transition: opacity 0.4s ease;
}

.splash-fade-leave-to {
  opacity: 0;
}

// pathLength=1 : un décalage de 1 masque le chemin entier. L'opacité nulle au
// départ cache la calotte ronde du trait, qui dépasserait sinon.
@keyframes dessine {
  0% { stroke-dashoffset: 1; opacity: 0; }
  1% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}

@keyframes eteint {
  to { opacity: 0; }
}

@keyframes tombe {
  0% { transform: translateY(-190px); opacity: 0; animation-timing-function: cubic-bezier(.55, 0, 1, .45); }
  15% { opacity: 1; }
  55% { transform: translateY(0) scale(1.18, .8); animation-timing-function: ease-out; }
  78% { transform: translateY(-10px) scale(.94, 1.06); animation-timing-function: ease-in; }
  100% { transform: translateY(0) scale(1, 1); opacity: 1; }
}

@keyframes onde {
  0% { transform: scale(1); opacity: .75; }
  100% { transform: scale(3.4); opacity: 0; }
}

@keyframes monte {
  0% { transform: translateY(12px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
</style>
