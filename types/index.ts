export interface Coordinates {
  lat: number
  lng: number
}

export type City = 'caen' | 'troyes'

export interface CityConfig {
  slug: City
  name: string
  center: Coordinates
  zoom: number
}

export interface Poi {
  title: string
  slug: string
  city: City
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
  city: City
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
  city: City
  icon: string
  order: number
  color: string
  description: string
}

export type GroupStatus = 'voting' | 'decided'

export interface Profile {
  id: string
  handle: string
}

export interface Group {
  id: string
  code: string
  name: string
  city: City
  status: GroupStatus
  /** null si le créateur a supprimé son identité : le groupe reste aux autres. */
  createdBy: string | null
  createdAt: string
}

/**
 * Le jumeau d'un groupe dans une autre app (Agora) : le code pour y rejoindre
 * le groupe jumeau. Protocole : utils/jumelage.ts.
 */
export interface GroupTwin {
  app: 'agora'
  remoteCode: string
}

export interface GroupMember {
  groupId: string
  userId: string
  handle: string
  joinedAt: string
}

export interface PoiVote {
  groupId: string
  userId: string
  poiSlug: string
}

export interface PreferenceVote {
  groupId: string
  userId: string
  targetPoiCount: number | null
  targetDurationMinutes: number | null
}

export interface VisitedGroupPoi {
  groupId: string
  poiSlug: string
  userId: string | null
  visitedAt: string
}

export interface DecidedRoute {
  id: string
  groupId: string
  poiSlugs: string[]
  city: City
  targetPoiCount: number
  targetDurationMinutes: number | null
  distanceMeters: number | null
  durationSeconds: number | null
  decidedAt: string
  decidedBy: string | null
}
