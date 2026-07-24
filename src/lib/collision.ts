import type { AABB, AisleViolation, RackRotation, WarehouseLayout } from '../types'
import { aabbFor } from './rackGeometry'

const EPS = 1e-3

/**
 * Racks closer than this are treated as intentional back-to-back placement
 * (flue gap) rather than an undersized aisle.
 */
export const FLUE_GAP_M = 0.5

export function overlaps(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS
}

export interface FacingGap {
  gap: number
  axis: 'x' | 'z'
  zone: AABB
}

/**
 * Face-to-face gap between two axis-aligned racks. Returns null when the
 * racks are diagonal neighbors (no aisle relationship) or overlapping.
 */
export function gapBetween(a: AABB, b: AABB): FacingGap | null {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX)
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ)
  if (dx > EPS && dz > EPS) return null
  if (dx > EPS) {
    const zMin = Math.max(a.minZ, b.minZ)
    const zMax = Math.min(a.maxZ, b.maxZ)
    if (zMax - zMin < EPS) return null
    return {
      gap: dx,
      axis: 'x',
      zone: { minX: Math.min(a.maxX, b.maxX), maxX: Math.max(a.minX, b.minX), minZ: zMin, maxZ: zMax },
    }
  }
  if (dz > EPS) {
    const xMin = Math.max(a.minX, b.minX)
    const xMax = Math.min(a.maxX, b.maxX)
    if (xMax - xMin < EPS) return null
    return {
      gap: dz,
      axis: 'z',
      zone: { minX: xMin, maxX: xMax, minZ: Math.min(a.maxZ, b.maxZ), maxZ: Math.max(a.minZ, b.minZ) },
    }
  }
  return null
}

/** Floor-plane AABBs of all walls, so gaps split by a wall don't count as aisles. */
export function wallAABBs(layout: WarehouseLayout): AABB[] {
  const cs = layout.floor.cellSize
  return Object.values(layout.walls ?? {}).map((w) => {
    const half = w.thicknessM / 2
    return {
      minX: Math.min(w.x1, w.x2) * cs - half,
      maxX: Math.max(w.x1, w.x2) * cs + half,
      minZ: Math.min(w.z1, w.z2) * cs - half,
      maxZ: Math.max(w.z1, w.z2) * cs + half,
    }
  })
}

export interface RackEntry {
  id: string
  aabb: AABB
}

/**
 * Rack AABBs for a layout, memoized on the layout object's identity. Every store
 * mutation runs the layout through `touch()`, producing a fresh object, so identity
 * is a correct cache key and stale entries are garbage-collected with the layout.
 */
const rackIndexCache = new WeakMap<WarehouseLayout, RackEntry[]>()
const wallIndexCache = new WeakMap<WarehouseLayout, AABB[]>()
const aisleCache = new WeakMap<WarehouseLayout, AisleViolation[]>()

export function rackIndex(layout: WarehouseLayout): RackEntry[] {
  const hit = rackIndexCache.get(layout)
  if (hit) return hit
  const out: RackEntry[] = []
  for (const r of Object.values(layout.racks)) {
    const t = layout.templates[r.templateId]
    if (!t) continue
    out.push({ id: r.id, aabb: aabbFor(r.gridX, r.gridZ, r.rotation, t, layout.floor.cellSize) })
  }
  rackIndexCache.set(layout, out)
  return out
}

export function wallIndex(layout: WarehouseLayout): AABB[] {
  const hit = wallIndexCache.get(layout)
  if (hit) return hit
  const out = wallAABBs(layout)
  wallIndexCache.set(layout, out)
  return out
}

/** True when the footprint lies fully inside the floor rectangle. */
function withinFloor(aabb: AABB, layout: WarehouseLayout): boolean {
  const hw = layout.floor.widthM / 2
  const hd = layout.floor.depthM / 2
  return !(aabb.minX < -hw - EPS || aabb.maxX > hw + EPS || aabb.minZ < -hd - EPS || aabb.maxZ > hd + EPS)
}

export interface RackMove {
  rackId: string
  gridX: number
  gridZ: number
  /** Omitted = keep the rack's current rotation. */
  rotation?: RackRotation
  /** Omitted = keep the rack's current template (differs for array/duplicate copies). */
  templateId?: string
}

export interface GroupValidity {
  valid: boolean
  invalidIds: Set<string>
}

/**
 * Validity of a whole group of moves in one pass: each moved footprint against the
 * floor bounds, against every rack that is NOT moving, and against the other moved
 * footprints. Moving racks are excluded from the static set so they never collide
 * with the positions they are leaving.
 */
export function validateGroupPlacement(layout: WarehouseLayout, moves: RackMove[]): GroupValidity {
  const invalidIds = new Set<string>()
  const movingIds = new Set(moves.map((m) => m.rackId))
  const statics = rackIndex(layout).filter((e) => !movingIds.has(e.id))

  const placed: { id: string; aabb: AABB }[] = []
  for (const m of moves) {
    const rack = layout.racks[m.rackId]
    const templateId = m.templateId ?? rack?.templateId
    const t = templateId ? layout.templates[templateId] : undefined
    if (!t) {
      invalidIds.add(m.rackId)
      continue
    }
    const rotation = m.rotation ?? rack?.rotation ?? 0
    const aabb = aabbFor(m.gridX, m.gridZ, rotation, t, layout.floor.cellSize)
    let ok = withinFloor(aabb, layout)
    if (ok) {
      for (const s of statics) {
        if (overlaps(aabb, s.aabb)) {
          ok = false
          break
        }
      }
    }
    if (ok) {
      for (const p of placed) {
        if (overlaps(aabb, p.aabb)) {
          ok = false
          invalidIds.add(p.id)
          break
        }
      }
    }
    if (!ok) invalidIds.add(m.rackId)
    placed.push({ id: m.rackId, aabb })
  }
  return { valid: invalidIds.size === 0, invalidIds }
}

/** Hard placement rule: inside floor bounds and no overlap with other racks. */
export function isPlacementValid(
  layout: WarehouseLayout,
  templateId: string,
  gridX: number,
  gridZ: number,
  rotation: RackRotation,
  excludeId?: string,
): boolean {
  const t = layout.templates[templateId]
  if (!t) return false
  const aabb = aabbFor(gridX, gridZ, rotation, t, layout.floor.cellSize)
  if (!withinFloor(aabb, layout)) return false
  for (const other of rackIndex(layout)) {
    if (other.id === excludeId) continue
    if (overlaps(aabb, other.aabb)) return false
  }
  return true
}

/** True when another rack or a wall sits inside the gap zone — then the pair doesn't face across an aisle. */
function zoneBlocked(zone: AABB, all: AABB[], skipA: AABB, skipB: AABB): boolean {
  return all.some((o) => o !== skipA && o !== skipB && overlaps(zone, o))
}

/** Soft rule: every facing pair with a gap between flue tolerance and min aisle width. */
export function validateAisles(layout: WarehouseLayout): AisleViolation[] {
  const entries = rackIndex(layout)
  const aabbs = [...entries.map((e) => e.aabb), ...wallIndex(layout)]
  const minAisle = layout.floor.minAisleWidthM
  const out: AisleViolation[] = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const g = gapBetween(entries[i].aabb, entries[j].aabb)
      if (
        g &&
        g.gap > FLUE_GAP_M + EPS &&
        g.gap < minAisle - EPS &&
        !zoneBlocked(g.zone, aabbs, entries[i].aabb, entries[j].aabb)
      ) {
        out.push({ rackA: entries[i].id, rackB: entries[j].id, gap: g.gap, axis: g.axis, zone: g.zone })
      }
    }
  }
  return out
}

/**
 * `validateAisles` memoized on layout identity. It is O(n²) and is read by both the
 * 3D guides and the status bar, so the uncached version ran twice per commit.
 */
export function validateAislesCached(layout: WarehouseLayout): AisleViolation[] {
  const hit = aisleCache.get(layout)
  if (hit) return hit
  const out = validateAisles(layout)
  aisleCache.set(layout, out)
  return out
}

export interface MeasureLine {
  from: [number, number, number]
  to: [number, number, number]
  gap: number
  ok: boolean
}

/**
 * Distance guides from a candidate footprint to its nearest facing rack on
 * each side, for display while placing/moving.
 */
export function measureToNeighbors(
  candidate: AABB,
  others: AABB[],
  minAisle: number,
  maxRange = 12,
  blockers: AABB[] = [],
): MeasureLine[] {
  const best: Partial<Record<'px' | 'nx' | 'pz' | 'nz', MeasureLine>> = {}
  const cx = (candidate.minX + candidate.maxX) / 2
  const cz = (candidate.minZ + candidate.maxZ) / 2
  const allBlockers = [...others, ...blockers]
  for (const o of others) {
    const g = gapBetween(candidate, o)
    if (!g || g.gap > maxRange) continue
    if (zoneBlocked(g.zone, allBlockers, candidate, o)) continue
    const ok = g.gap >= minAisle || g.gap <= FLUE_GAP_M
    if (g.axis === 'x') {
      const side = (o.minX + o.maxX) / 2 > cx ? 'px' : 'nx'
      const zMid = (g.zone.minZ + g.zone.maxZ) / 2
      if (!best[side] || g.gap < best[side].gap) {
        best[side] = { from: [g.zone.minX, 0.08, zMid], to: [g.zone.maxX, 0.08, zMid], gap: g.gap, ok }
      }
    } else {
      const side = (o.minZ + o.maxZ) / 2 > cz ? 'pz' : 'nz'
      const xMid = (g.zone.minX + g.zone.maxX) / 2
      if (!best[side] || g.gap < best[side].gap) {
        best[side] = { from: [xMid, 0.08, g.zone.minZ], to: [xMid, 0.08, g.zone.maxZ], gap: g.gap, ok }
      }
    }
  }
  return Object.values(best)
}
