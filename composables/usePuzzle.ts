import { ref, computed, type Ref } from 'vue'
import type { Puzzle, PuzzlePoint, PuzzleState } from '~/types'

function distanceToSegment(point: PuzzlePoint, a: PuzzlePoint, b: PuzzlePoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = a.x + t * dx
  const projY = a.y + t * dy

  return Math.hypot(point.x - projX, point.y - projY)
}

/**
 * Calcule la longueur totale d'un chemin (somme des segments).
 */
function pathLength(points: PuzzlePoint[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  }
  return len
}

/**
 * Trouve le segment le plus proche d'un point et retourne la distance
 * cumulee le long du chemin jusqu'a la projection.
 */
function projectOnPath(point: PuzzlePoint, pathPoints: PuzzlePoint[]): { distance: number; cumulative: number } {
  let minDist = Infinity
  let bestCumulative = 0
  let cumulative = 0

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const a = pathPoints[i]!
    const b = pathPoints[i + 1]!
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)

    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy

    let t = 0
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
    }

    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const dist = Math.hypot(point.x - projX, point.y - projY)

    if (dist < minDist) {
      minDist = dist
      bestCumulative = cumulative + t * segLen
    }

    cumulative += segLen
  }

  return { distance: minDist, cumulative: bestCumulative }
}

interface UsePuzzleOptions {
  /**
   * Points du chemin projetes en espace ecran (pixels).
   * Si fourni, la comparaison se fait en pixels. Sinon, en coordonnees normalisees.
   */
  projectedPath: Ref<PuzzlePoint[] | null>
  /**
   * Point de depart projete en espace ecran.
   */
  projectedStart: Ref<PuzzlePoint | null>
  /**
   * Tolerance en pixels (dynamique selon l'echelle apparente de la cible).
   */
  tolerancePx: Ref<number>
  /**
   * La cible est-elle detectee ?
   */
  isDetected: Ref<boolean>
}

export function usePuzzle(puzzle: Ref<Puzzle | null>, options?: UsePuzzleOptions) {
  const state = ref<PuzzleState>('idle')
  const userTrace = ref<PuzzlePoint[]>([])
  const progress = ref(0)

  const isActive = computed(() => state.value === 'tracking')
  const isComplete = computed(() => state.value === 'success')
  const isScanning = computed(() => state.value === 'scanning')

  function startScanning() {
    state.value = 'scanning'
    userTrace.value = []
    progress.value = 0
  }

  function startTracking(touchPoint: PuzzlePoint) {
    if (!puzzle.value) return

    const startPt = options?.projectedStart.value
    if (!startPt) {
      // Mode sans AR : utiliser les coordonnees normalisees
      const start = puzzle.value.path.startPoint
      const toleranceNorm = puzzle.value.path.tolerance / Math.max(window.innerWidth, window.innerHeight)
      const dist = Math.hypot(touchPoint.x - start.x, touchPoint.y - start.y)
      if (dist > toleranceNorm * 2) return
    } else {
      // Mode AR : comparaison en pixels ecran
      const dist = Math.hypot(touchPoint.x - startPt.x, touchPoint.y - startPt.y)
      if (dist > (options?.tolerancePx.value ?? 30) * 2) return
    }

    state.value = 'tracking'
    userTrace.value = [touchPoint]
    progress.value = 0
  }

  function addPoint(touchPoint: PuzzlePoint) {
    if (state.value !== 'tracking' || !puzzle.value) return

    // Pause si la detection est perdue (mode AR)
    if (options && !options.isDetected.value) return

    const pathPts = options?.projectedPath.value ?? puzzle.value.path.points
    const tolerance = options
      ? options.tolerancePx.value
      : puzzle.value.path.tolerance / Math.max(window.innerWidth, window.innerHeight)

    if (!pathPts || pathPts.length < 2) return

    // Verifier que le point est sur le chemin
    const { distance: minDist, cumulative } = projectOnPath(touchPoint, pathPts)

    if (minDist > tolerance) {
      state.value = 'fail'
      return
    }

    userTrace.value.push(touchPoint)

    // Calculer la progression
    const totalLen = pathLength(pathPts)
    progress.value = totalLen > 0 ? Math.min(1, cumulative / totalLen) : 0

    // Verifier si on a atteint la fin (dernier point du chemin)
    const endPoint = pathPts[pathPts.length - 1]!
    const distToEnd = Math.hypot(touchPoint.x - endPoint.x, touchPoint.y - endPoint.y)
    if (distToEnd < tolerance * 1.5) {
      state.value = 'success'
    }
  }

  function reset() {
    state.value = options ? 'scanning' : 'idle'
    userTrace.value = []
    progress.value = 0
  }

  return {
    state,
    userTrace,
    progress,
    isActive,
    isComplete,
    isScanning,
    startScanning,
    startTracking,
    addPoint,
    reset,
  }
}
