import type { PuzzlePoint } from '~/types'

/**
 * Projette un point de l'espace cible (0-1) vers l'espace ecran (pixels).
 * La matrice modelViewTransform vient de MindAR (4x3, row-major).
 * projectionMatrix vient de MindAR.getProjectionMatrix().
 */
export function projectPoint(
  point: PuzzlePoint,
  modelViewTransform: number[][],
  projectionMatrix: number[],
  canvasWidth: number,
  canvasHeight: number,
  targetRatio: number,
): PuzzlePoint {
  // Convertir le point (0-1) en coordonnees cible centrees
  // MindAR utilise un repere ou la cible va de -targetRatio/2 a +targetRatio/2 en X
  // et de -0.5 a +0.5 en Y
  const x = (point.x - 0.5) * targetRatio
  const y = (point.y - 0.5) * -1 // Y inverse (haut = positif dans MindAR)
  const z = 0

  // Appliquer modelViewTransform (4x3 : 3 lignes de 4 colonnes)
  const mv = modelViewTransform
  const vx = mv[0]![0]! * x + mv[0]![1]! * y + mv[0]![2]! * z + mv[0]![3]!
  const vy = mv[1]![0]! * x + mv[1]![1]! * y + mv[1]![2]! * z + mv[1]![3]!
  const vz = mv[2]![0]! * x + mv[2]![1]! * y + mv[2]![2]! * z + mv[2]![3]!

  // Appliquer projectionMatrix (4x4, column-major comme OpenGL)
  const p = projectionMatrix
  const clipX = p[0]! * vx + p[4]! * vy + p[8]! * vz + p[12]!
  const clipY = p[1]! * vx + p[5]! * vy + p[9]! * vz + p[13]!
  const clipW = p[3]! * vx + p[7]! * vy + p[11]! * vz + p[15]!

  // Perspective divide -> NDC (-1 a 1)
  const ndcX = clipX / clipW
  const ndcY = clipY / clipW

  // NDC vers pixels ecran
  const screenX = ((ndcX + 1) / 2) * canvasWidth
  const screenY = ((1 - ndcY) / 2) * canvasHeight

  return { x: screenX, y: screenY }
}

/**
 * Projette un tableau de points.
 */
export function projectPath(
  points: PuzzlePoint[],
  modelViewTransform: number[][],
  projectionMatrix: number[],
  canvasWidth: number,
  canvasHeight: number,
  targetRatio: number,
): PuzzlePoint[] {
  return points.map((p) =>
    projectPoint(p, modelViewTransform, projectionMatrix, canvasWidth, canvasHeight, targetRatio),
  )
}

/**
 * Retourne l'echelle apparente de la cible (pour ajuster la tolerance).
 * Plus la cible est grande a l'ecran, plus la tolerance en pixels augmente.
 */
export function getApparentScale(
  modelViewTransform: number[][],
  projectionMatrix: number[],
  canvasWidth: number,
  targetRatio: number,
): number {
  // Projeter deux points opposes de la cible pour mesurer la taille a l'ecran
  const left = projectPoint(
    { x: 0, y: 0.5 },
    modelViewTransform, projectionMatrix,
    canvasWidth, canvasWidth, targetRatio,
  )
  const right = projectPoint(
    { x: 1, y: 0.5 },
    modelViewTransform, projectionMatrix,
    canvasWidth, canvasWidth, targetRatio,
  )
  return Math.hypot(right.x - left.x, right.y - left.y)
}
