import type { RackRotation, WarehouseLayout } from '../types'
import { rackIndex } from './collision'
import { runAxis, runCoords, structuralWidth } from './runs'

/**
 * How far a rack may be pulled to snap onto a neighbour. Kept just under one cell so
 * the join never overrides an unambiguous grid intent, and it scales with fine grids.
 */
export function snapRadius(cellSize: number): number {
  return Math.min(0.45, 0.9 * cellSize)
}

export interface JoinSnap {
  neighbourId: string
  /** World centre that makes the two structural spans meet exactly. */
  worldX: number
  worldZ: number
  axis: 'x' | 'z'
  /** Junction position, for drawing the shared-frame marker. */
  markerAlong: number
  markerCross: number
}

/**
 * Nearest position at which the candidate rack would share an upright frame with an
 * existing one. Only same-template, same-facing, collinear neighbours qualify, so the
 * snap can never produce a placement the collision rules would reject.
 */
export function findJoinSnap(
  layout: WarehouseLayout,
  templateId: string,
  rotation: RackRotation,
  worldX: number,
  worldZ: number,
  excludeIds?: Set<string>,
): JoinSnap | null {
  const t = layout.templates[templateId]
  if (!t) return null
  const cell = layout.floor.cellSize
  const radius = snapRadius(cell)
  const axis = runAxis(rotation)
  const half = structuralWidth(t) / 2
  const raw = runCoords(worldX / cell, worldZ / cell, rotation, cell)

  let best: JoinSnap | null = null
  let bestScore = Infinity

  for (const entry of rackIndex(layout)) {
    if (excludeIds?.has(entry.id)) continue
    const p = entry.pose
    if (p.templateId !== templateId) continue
    if (p.rotation % 180 !== rotation % 180) continue
    if (p.axis !== axis) continue
    const crossDelta = Math.abs(p.cross - raw.cross)
    if (crossDelta > radius) continue

    // Attach on either side: our structural edge meets theirs.
    for (const along of [p.max + half, p.min - half]) {
      const alongDelta = Math.abs(along - raw.along)
      if (alongDelta > radius) continue
      const score = alongDelta + crossDelta
      // Ties break on rack id so the ghost never flickers between equidistant neighbours.
      if (score < bestScore || (score === bestScore && best && entry.id < best.neighbourId)) {
        bestScore = score
        const worldAlong = along
        const worldCross = p.cross
        best = {
          neighbourId: entry.id,
          worldX: axis === 'x' ? worldAlong : worldCross,
          worldZ: axis === 'x' ? worldCross : worldAlong,
          axis,
          markerAlong: along === p.max + half ? p.max : p.min,
          markerCross: worldCross,
        }
      }
    }
  }
  return best
}
