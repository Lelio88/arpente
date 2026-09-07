<script setup lang="ts">
import type { Puzzle, PuzzlePoint } from '~/types'
import { usePuzzleStore } from '~/stores/puzzle'
import { usePuzzle } from '~/composables/usePuzzle'
import { projectPath, projectPoint, getApparentScale } from '~/utils/arTransform'

definePageMeta({
  layout: 'ar',
})

const params = useRoute().params
const puzzleStore = usePuzzleStore()
const showSuccess = ref(false)
const cameraRef = ref<{ videoRef: HTMLVideoElement } | null>(null)

// Charger les donnees du puzzle
const { data: puzzleRaw } = await useAsyncData(`puzzle-${params.id}`, () =>
  queryCollection('puzzles').where('stem', '=', `puzzles/${params.id}`).first(),
)

const puzzle = computed<Puzzle | null>(() => {
  if (!puzzleRaw.value) return null
  const doc = puzzleRaw.value as any
  return {
    id: doc.meta?.id || doc.id,
    title: doc.title || doc.meta?.title,
    location: doc.meta?.location,
    difficulty: doc.meta?.difficulty,
    path: doc.meta?.path,
    target: doc.meta?.target,
    successMessage: doc.meta?.successMessage,
    reward: doc.meta?.reward,
  }
})

// Image tracking AR — import dynamique pour eviter le SSR
const isDetected = ref(false)
const modelViewTransform = ref<number[][] | null>(null)
const projectionMatrix = ref<number[] | null>(null)
const targetRatio = ref(1)
let startTracking: ((video: HTMLVideoElement, mindFileUrl: string) => Promise<void>) | null = null
let stopTracking: (() => void) | null = null

if (import.meta.client) {
  const { useImageTracking } = await import('~/composables/useImageTracking')
  const tracking = useImageTracking()
  isDetected.value = tracking.isDetected.value
  modelViewTransform.value = tracking.modelViewTransform.value
  projectionMatrix.value = tracking.projectionMatrix.value
  targetRatio.value = tracking.targetRatio.value
  startTracking = tracking.start
  stopTracking = tracking.stop

  // Sync les refs
  watch(tracking.isDetected, (v) => { isDetected.value = v })
  watch(tracking.modelViewTransform, (v) => { modelViewTransform.value = v })
  watch(tracking.projectionMatrix, (v) => { projectionMatrix.value = v })
  watch(tracking.targetRatio, (v) => { targetRatio.value = v })
}

// Calculer le chemin projete en coordonnees ecran
const canvasSize = ref({ width: 0, height: 0 })

const dpr = computed(() => import.meta.client ? (window.devicePixelRatio || 1) : 1)

const projectedPath = computed<PuzzlePoint[] | null>(() => {
  if (!puzzle.value || !modelViewTransform.value || !projectionMatrix.value || !canvasSize.value.width) return null
  return projectPath(
    puzzle.value.path.points,
    modelViewTransform.value,
    projectionMatrix.value,
    canvasSize.value.width * dpr.value,
    canvasSize.value.height * dpr.value,
    targetRatio.value,
  )
})

const projectedStart = computed<PuzzlePoint | null>(() => {
  if (!puzzle.value || !modelViewTransform.value || !projectionMatrix.value || !canvasSize.value.width) return null
  return projectPoint(
    puzzle.value.path.startPoint,
    modelViewTransform.value,
    projectionMatrix.value,
    canvasSize.value.width * dpr.value,
    canvasSize.value.height * dpr.value,
    targetRatio.value,
  )
})

const tolerancePx = computed<number>(() => {
  if (!modelViewTransform.value || !projectionMatrix.value || !canvasSize.value.width) return 30
  const scale = getApparentScale(
    modelViewTransform.value,
    projectionMatrix.value,
    canvasSize.value.width * dpr.value,
    targetRatio.value,
  )
  return Math.max(20, scale * 0.08) * dpr.value
})

// Puzzle state machine avec support AR
const puzzleRef = computed(() => puzzle.value)
const {
  state: puzzleState,
  userTrace,
  progress,
  startScanning,
  startTracking: startPuzzleTracking,
  addPoint,
  reset: resetPuzzle,
} = usePuzzle(puzzleRef, {
  projectedPath,
  projectedStart,
  tolerancePx,
  isDetected,
})

// Demarrer le scan quand la camera est prete
watch(
  () => cameraRef.value?.videoRef,
  async (videoEl) => {
    if (!videoEl || !puzzle.value?.target?.mindFile) return

    // Attendre que la video soit prete
    if (videoEl.readyState < 2) {
      await new Promise<void>((resolve) => {
        videoEl.addEventListener('loadeddata', () => resolve(), { once: true })
      })
    }

    if (startTracking) {
      await startTracking(videoEl, puzzle.value.target.mindFile)
    }
    startScanning()
  },
)

// Mettre a jour la taille du canvas
onMounted(() => {
  function updateSize() {
    canvasSize.value = { width: window.innerWidth, height: window.innerHeight }
  }
  updateSize()
  window.addEventListener('resize', updateSize)
  onUnmounted(() => window.removeEventListener('resize', updateSize))
})

// Gerer les touch events depuis PuzzleOverlay
function onTouchStart(point: PuzzlePoint) {
  if (puzzleState.value === 'scanning' || puzzleState.value === 'idle') {
    startPuzzleTracking(point)
  }
}

function onTouchMove(point: PuzzlePoint) {
  addPoint(point)
}

function onTouchEnd() {
  if (puzzleState.value === 'tracking') {
    resetPuzzle()
  }
}

// Surveiller succes/echec
watch(puzzleState, (newState) => {
  if (newState === 'success') {
    if (puzzle.value) {
      puzzleStore.markCompleted(puzzle.value.id)
    }
    showSuccess.value = true
  }
  if (newState === 'fail') {
    if (navigator.vibrate) navigator.vibrate(200)
    setTimeout(() => resetPuzzle(), 500)
  }
})

function onCloseSuccess() {
  showSuccess.value = false
  stopTracking?.()
  navigateTo('/ar')
}
</script>

<template>
  <div class="page-puzzle">
    <template v-if="puzzle">
      <!-- Bouton retour -->
      <button class="puzzle-back" @click="stopTracking?.(); navigateTo('/ar')">
        ← Retour
      </button>

      <!-- Titre du puzzle -->
      <div class="puzzle-title">
        {{ puzzle.title }}
      </div>

      <!-- Barre de progression -->
      <div v-if="puzzleState === 'tracking'" class="puzzle-progress">
        <div class="progress-fill" :style="{ width: `${progress * 100}%` }" />
      </div>

      <!-- Camera + Overlay + Tracker -->
      <ArCamera ref="cameraRef">
        <ArTracker
          :is-detected="isDetected"
          :is-tracking="puzzleState === 'tracking'"
        />
        <PuzzleOverlay
          :puzzle="puzzle"
          :state="puzzleState"
          :user-trace="userTrace"
          :projected-path="projectedPath"
          :projected-start="projectedStart"
          :is-detected="isDetected"
          @touch-start="onTouchStart"
          @touch-move="onTouchMove"
          @touch-end="onTouchEnd"
        />
      </ArCamera>

      <!-- Ecran de succes -->
      <PuzzleSuccess
        v-if="showSuccess"
        :puzzle="puzzle"
        @close="onCloseSuccess"
      />
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-puzzle {
  position: relative;
  width: 100%;
  height: 100%;
}

.puzzle-back {
  position: absolute;
  top: env(safe-area-inset-top, 16px);
  left: $spacing-md;
  z-index: $z-modal;
  padding: $spacing-sm $spacing-md;
  background: rgba(0, 0, 0, 0.6);
  border-radius: $radius-sm;
  color: $color-text;
  font-size: $font-size-sm;
  backdrop-filter: blur(8px);
}

.puzzle-title {
  position: absolute;
  top: env(safe-area-inset-top, 16px);
  left: 50%;
  transform: translateX(-50%);
  z-index: $z-modal;
  padding: $spacing-xs $spacing-md;
  background: rgba(0, 0, 0, 0.6);
  border-radius: $radius-sm;
  color: $color-text;
  font-size: $font-size-sm;
  font-weight: 600;
  backdrop-filter: blur(8px);
  white-space: nowrap;
}

.puzzle-progress {
  position: absolute;
  top: calc(env(safe-area-inset-top, 16px) + 40px);
  left: $spacing-lg;
  right: $spacing-lg;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  z-index: $z-modal;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: $color-success;
  border-radius: 2px;
  transition: width 0.1s ease-out;
}
</style>
