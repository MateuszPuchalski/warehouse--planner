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

function rackAABBs(layout: WarehouseLayout): { id: string; aabb: AABB }[] {
  const out: { id: string; aabb: AABB }[] = []
  for (const r of Object.values(layout.racks)) {
    const t = layout.templates[r.templateId]
    if (!t) continue
    out.push({ id: r.id, aabb: aabbFor(r.gridX, r.gridZ, r.rotation, t, layout.floor.cellSize) })
  }
  return out
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
  const hw = layout.floor.widthM / 2
  const hd = layout.floor.depthM / 2
  if (aabb.minX < -hw - EPS || aabb.maxX > hw + EPS || aabb.minZ < -hd - EPS || aabb.maxZ > hd + EPS) {
    return false
  }
  for (const other of rackAABBs(layout)) {
    if (other.id === excludeId) continue
    if (overlaps(aabb, other.aabb)) return false
  }
  return true
}

/** Soft rule: every facing pair with a gap between flue tolerance and min aisle width. */
export function validateAisles(layout: WarehouseLayout): AisleViolation[] {
  const entries = rackAABBs(layout)
  const minAisle = layout.floor.minAisleWidthM
  const out: AisleViolation[] = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const g = gapBetween(entries[i].aabb, entries[j].aabb)
      if (g && g.gap > FLUE_GAP_M + EPS && g.gap < minAisle - EPS) {
        out.push({ rackA: entries[i].id, rackB: entries[j].id, gap: g.gap, axis: g.axis, zone: g.zone })
      }
    }
  }
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
): MeasureLine[] {
  const best: Partial<Record<'px' | 'nx' | 'pz' | 'nz', MeasureLine>> = {}
  const cx = (candidate.minX + candidate.maxX) / 2
  const cz = (candidate.minZ + candidate.maxZ) / 2
  for (const o of others) {
    const g = gapBetween(candidate, o)
    if (!g || g.gap > maxRange) continue
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
