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

export type DimKind = 'hall' | 'rack' | 'wall'

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
  const entries = rackIndex(layout)
  const self = entries.find((e) => e.id === rackId)
  if (!self) return []
  const walls = wallIndex(layout)
  const rackBoxes = entries.filter((e) => e.id !== rackId).map((e) => e.aabb)
  const allBlockers = [...entries.map((e) => e.aabb), ...walls]
  const minAisle = layout.floor.minAisleWidthM

  const best: Partial<Record<'px' | 'nx' | 'pz' | 'nz', DimLine>> = {}
  const cx = (self.aabb.minX + self.aabb.maxX) / 2
  const cz = (self.aabb.minZ + self.aabb.maxZ) / 2

  const consider = (other: AABB, kind: DimKind) => {
    const g = gapBetween(self.aabb, other)
    if (!g || g.gap > MAX_GAP_M) return
    // Racks abutting in the same run (or set back-to-back) are intentional, not a
    // clearance — measuring those just prints "0.01 m" noise. Walls keep any distance.
    if (kind === 'rack' ? g.gap <= FLUE_GAP_M : g.gap <= MIN_WALL_GAP_M) return
    if (zoneBlocked(g.zone, allBlockers, self.aabb, other)) return
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

  for (const box of rackBoxes) consider(box, 'rack')
  for (const box of walls) consider(box, 'wall')
  return Object.values(best)
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
