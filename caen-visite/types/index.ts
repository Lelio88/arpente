export interface Coordinates {
  lat: number
  lng: number
}

export interface Poi {
  title: string
  slug: string
  category: PoiCategory
  lat: number
  lng: number
  epoch?: string
  builder?: string
  image?: string
  tags: string[]
  proximityRadius: number
  description?: string
  body?: unknown
}

export type PoiCategory =
  | 'monument'
  | 'eglise'
  | 'ww2'
  | 'architecture'
  | 'gastronomie'
  | 'romantique'
  | 'musee'

export interface RouteThematic {
  title: string
  slug: string
  description: string
  duration: string
  distance: string
  difficulty: 'facile' | 'moyen' | 'difficile'
  color: string
  pois: RoutePoiEntry[]
}

export interface RoutePoiEntry {
  slug: string
  note?: string
}

export interface PuzzlePath {
  startPoint: PuzzlePoint
  points: PuzzlePoint[]
  tolerance: number
  style: PuzzleStyle
}

export interface PuzzlePoint {
  x: number
  y: number
}

export interface PuzzleStyle {
  color: string
  width: number
  glowColor: string
  glowWidth: number
}

export interface PuzzleTarget {
  mindFile: string
  imageIndex: number
}

export interface Puzzle {
  id: string
  title: string
  location: {
    lat: number
    lng: number
    hint: string
  }
  difficulty: number
  path: PuzzlePath
  target?: PuzzleTarget
  successMessage: string
  reward: {
    type: 'anecdote' | 'image' | 'badge'
    text: string
  }
}

export type PuzzleState = 'idle' | 'scanning' | 'tracking' | 'success' | 'fail'

export type BottomSheetState = 'closed' | 'peek' | 'half' | 'full'

export interface Tip {
  title: string
  slug: string
  icon: string
  order: number
  color: string
  description: string
}
