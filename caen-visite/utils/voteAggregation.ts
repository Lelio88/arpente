import type { Coordinates } from '~/types'

export interface AggregationInput {
  approvals: Record<string, string[]> // poiSlug -> userIds ayant approuve ce POI
  poiCountPreferences: number[] // target_poi_count soumis par les membres
  durationPreferences: number[] // target_duration_minutes soumis par les membres
  poiCoordinates: Record<string, Coordinates>
}

export interface AggregationResult {
  orderedSlugs: string[]
  targetPoiCount: number
  targetDurationMinutes: number | null
}

const DEFAULT_POI_COUNT = 8

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

export function nearestNeighborOrder(
  slugs: string[],
  coords: Record<string, Coordinates>,
  startSlug: string,
): string[] {
  const remaining = new Set(slugs)
  const ordered: string[] = []

  let current = startSlug
  remaining.delete(current)
  ordered.push(current)

  while (remaining.size > 0) {
    let closest: string | null = null
    let closestDistance = Infinity

    for (const slug of remaining) {
      const dist = haversineDistance(coords[current]!, coords[slug]!)
      if (dist < closestDistance) {
        closest = slug
        closestDistance = dist
      }
    }

    current = closest!
    remaining.delete(current)
    ordered.push(current)
  }

  return ordered
}

export function aggregateGroupVotes(input: AggregationInput): AggregationResult {
  const approvedSlugs = Object.keys(input.approvals).filter(
    (slug) => input.approvals[slug]!.length > 0,
  )

  const medianCount = median(input.poiCountPreferences)
  const targetPoiCount = medianCount !== null
    ? Math.round(medianCount)
    : Math.min(DEFAULT_POI_COUNT, approvedSlugs.length)

  const targetDurationMinutes = median(input.durationPreferences)

  const ranked = [...approvedSlugs].sort((a, b) => {
    const diff = input.approvals[b]!.length - input.approvals[a]!.length
    return diff !== 0 ? diff : a.localeCompare(b) // egalite -> ordre alphabetique, deterministe
  })

  const selected = ranked.slice(0, Math.max(targetPoiCount, 0))

  if (selected.length === 0) {
    return { orderedSlugs: [], targetPoiCount, targetDurationMinutes }
  }

  const orderedSlugs = nearestNeighborOrder(selected, input.poiCoordinates, selected[0]!)

  return { orderedSlugs, targetPoiCount, targetDurationMinutes }
}
