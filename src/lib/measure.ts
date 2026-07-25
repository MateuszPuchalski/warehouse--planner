import type { AABB, WarehouseLayout } from '../types'
import { FLUE_GAP_M, gapBetween, rackIndex, wallIndex, zoneBlocked } from './collision'

/** Height of the dimension lines: above the zone outlines, below the label anchors. */
export const MEASURE_Y = 0.07
/** How far outside the floor edge the overall hall dimensions sit. */
const HALL_OFFSET = 1.1
/** Ignore gaps wider than this — they are open floor, not a measurable clearance. */
const MAX_GAP_M = 20
/** A rack this close to a wall is flush against it; there is nothing to measure. */
const MIN_WALL_GAP_M = 0.05

export type DimKind = 'hall' | 'rack' | 'wall' | 'selection' | 'span'

export interface DimLine {
  from: [number, number, number]
  to: [number, number, number]
  meters: number
  kind: DimKind
  /** False when a rack-to-rack clearance is below the minimum aisle width. */
  ok: boolean
  /** Axis the measurement runs along, for drawing the end ticks. */
  axis: 'x' | 'z'
}

/** Overall hall width and depth, drawn just outside the floor edges. */
export function hallDimensions(layout: WarehouseLayout): DimLine[] {
  const hw = layout.floor.widthM / 2
  const hd = layout.floor.depthM / 2
  return [
    {
      from: [-hw, MEASURE_Y, hd + HALL_OFFSET],
      to: [hw, MEASURE_Y, hd + HALL_OFFSET],
      meters: layout.floor.widthM,
      kind: 'hall',
      ok: true,
      axis: 'x',
    },
    {
      from: [-hw - HALL_OFFSET, MEASURE_Y, -hd],
      to: [-hw - HALL_OFFSET, MEASURE_Y, hd],
      meters: layout.floor.depthM,
      kind: 'hall',
      ok: true,
      axis: 'z',
    },
  ]
}

function lineAcross(zone: AABB, axis: 'x' | 'z', gap: number, kind: DimKind, ok: boolean): DimLine {
  if (axis === 'x') {
    const zMid = (zone.minZ + zone.maxZ) / 2
    return {
      from: [zone.minX, MEASURE_Y, zMid],
      to: [zone.maxX, MEASURE_Y, zMid],
      meters: gap,
      kind,
      ok,
      axis: 'x',
    }
  }
  const xMid = (zone.minX + zone.maxX) / 2
  return {
    from: [xMid, MEASURE_Y, zone.minZ],
    to: [xMid, MEASURE_Y, zone.maxZ],
    meters: gap,
    kind,
    ok,
    axis: 'z',
  }
}

/**
 * Clearance from one rack to the nearest obstruction on each of its four sides,
 * distinguishing racks from walls: a rack pair narrower than the minimum aisle is
 * flagged, while sitting close to a wall is normal and never flagged.
 */
export function rackClearances(layout: WarehouseLayout, rackId: string): DimLine[] {
  const self = rackIndex(layout).find((e) => e.id === rackId)
  if (!self) return []
  return boxClearances(layout, self.aabb, new Set([rackId]))
}

/**
 * The same four-side clearances for an arbitrary box, with some racks excluded from both
 * the candidates and the blockers. That is what a group drag needs: the box is the whole
 * selection's extent and its own members must not count as obstacles.
 */
export function boxClearances(
  layout: WarehouseLayout,
  box: AABB,
  skipIds: Set<string>,
): DimLine[] {
  const entries = rackIndex(layout).filter((e) => !skipIds.has(e.id))
  const walls = wallIndex(layout)
  const rackBoxes = entries.map((e) => e.aabb)
  const allBlockers = [...rackBoxes, ...walls]
  const minAisle = layout.floor.minAisleWidthM

  const best: Partial<Record<'px' | 'nx' | 'pz' | 'nz', DimLine>> = {}
  const cx = (box.minX + box.maxX) / 2
  const cz = (box.minZ + box.maxZ) / 2

  const consider = (other: AABB, kind: DimKind) => {
    const g = gapBetween(box, other)
    if (!g || g.gap > MAX_GAP_M) return
    // Racks abutting in the same run (or set back-to-back) are intentional, not a
    // clearance — measuring those just prints "0.01 m" noise. Walls keep any distance.
    if (kind === 'rack' ? g.gap <= FLUE_GAP_M : g.gap <= MIN_WALL_GAP_M) return
    if (zoneBlocked(g.zone, allBlockers, box, other)) return
    const side =
      g.axis === 'x'
        ? (other.minX + other.maxX) / 2 > cx
          ? 'px'
          : 'nx'
        : (other.minZ + other.maxZ) / 2 > cz
          ? 'pz'
          : 'nz'
    // A tight gap only matters between racks; a rack near a wall is normal.
    const ok = kind === 'wall' ? true : g.gap >= minAisle || g.gap <= FLUE_GAP_M
    const line = lineAcross(g.zone, g.axis, g.gap, kind, ok)
    if (!best[side] || g.gap < best[side].meters) best[side] = line
  }

  for (const other of rackBoxes) consider(other, 'rack')
  for (const other of walls) consider(other, 'wall')
  return Object.values(best)
}

/** How far outside the selection's bounding box its overall extent lines sit. */
const SPAN_OFFSET = 0.55

/**
 * Distances between the racks the user has selected, plus the selection's overall extent.
 *
 * Takes AABBs rather than ids so the caller can feed it the LIVE boxes of a group drag
 * (the ghost) instead of the stored positions — that is what makes the numbers move with
 * the racks. Only consecutive neighbours are measured, per axis, so a row of ten selected
 * racks yields nine gaps rather than forty-five.
 */
export function selectionDimensions(boxes: { id: string; aabb: AABB }[]): DimLine[] {
  if (boxes.length < 2) return []
  const out: DimLine[] = []

  for (const axis of ['x', 'z'] as const) {
    const along = (b: AABB) => (axis === 'x' ? (b.minX + b.maxX) / 2 : (b.minZ + b.maxZ) / 2)
    const sorted = [...boxes].sort((a, b) => along(a.aabb) - along(b.aabb))
    for (let i = 1; i < sorted.length; i++) {
      const g = gapBetween(sorted[i - 1].aabb, sorted[i].aabb)
      // Only pairs that actually face each other across THIS axis, and not the pairs that
      // are joined into one run — those read as "0.00 m" noise.
      if (!g || g.axis !== axis || g.gap > MAX_GAP_M || g.gap <= FLUE_GAP_M) continue
      out.push(lineAcross(g.zone, g.axis, g.gap, 'selection', true))
    }
  }

  // Overall extent of the whole selection, drawn just outside its bounding box.
  const minX = Math.min(...boxes.map((b) => b.aabb.minX))
  const maxX = Math.max(...boxes.map((b) => b.aabb.maxX))
  const minZ = Math.min(...boxes.map((b) => b.aabb.minZ))
  const maxZ = Math.max(...boxes.map((b) => b.aabb.maxZ))
  out.push({
    from: [minX, MEASURE_Y, minZ - SPAN_OFFSET],
    to: [maxX, MEASURE_Y, minZ - SPAN_OFFSET],
    meters: maxX - minX,
    kind: 'span',
    ok: true,
    axis: 'x',
  })
  out.push({
    from: [maxX + SPAN_OFFSET, MEASURE_Y, minZ],
    to: [maxX + SPAN_OFFSET, MEASURE_Y, maxZ],
    meters: maxZ - minZ,
    kind: 'span',
    ok: true,
    axis: 'z',
  })
  return out
}

const corridorCache = new WeakMap<WarehouseLayout, DimLine[]>()

/**
 * One measurement per distinct aisle corridor. Facing rack pairs that share the same
 * corridor collapse into a single line spanning the whole run, so a row of ten racks
 * facing another row yields one label instead of ten stacked on top of each other.
 * Memoized on layout identity, like `rackIndex`.
 */
export function aisleCorridors(layout: WarehouseLayout): DimLine[] {
  const hit = corridorCache.get(layout)
  if (hit) return hit

  const entries = rackIndex(layout)
  const allBlockers = [...entries.map((e) => e.aabb), ...wallIndex(layout)]
  const minAisle = layout.floor.minAisleWidthM

  // Group facing pairs by axis and the corridor's position across that axis.
  const groups = new Map<string, { zone: AABB; gap: number; axis: 'x' | 'z' }>()
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i].aabb
      const b = entries[j].aabb
      const g = gapBetween(a, b)
      if (!g || g.gap > MAX_GAP_M || g.gap <= FLUE_GAP_M) continue
      if (zoneBlocked(g.zone, allBlockers, a, b)) continue
      const across =
        g.axis === 'x' ? (g.zone.minX + g.zone.maxX) / 2 : (g.zone.minZ + g.zone.maxZ) / 2
      const key = `${g.axis}:${across.toFixed(2)}`
      const prev = groups.get(key)
      if (!prev) {
        groups.set(key, { zone: { ...g.zone }, gap: g.gap, axis: g.axis })
        continue
      }
      // Extend the corridor along its length and keep the tightest gap seen.
      if (g.axis === 'x') {
        prev.zone.minZ = Math.min(prev.zone.minZ, g.zone.minZ)
        prev.zone.maxZ = Math.max(prev.zone.maxZ, g.zone.maxZ)
      } else {
        prev.zone.minX = Math.min(prev.zone.minX, g.zone.minX)
        prev.zone.maxX = Math.max(prev.zone.maxX, g.zone.maxX)
      }
      prev.gap = Math.min(prev.gap, g.gap)
    }
  }

  const out = [...groups.values()].map((c) =>
    lineAcross(c.zone, c.axis, c.gap, 'rack', c.gap >= minAisle),
  )
  corridorCache.set(layout, out)
  return out
}
