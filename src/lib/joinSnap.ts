import type { RackRotation, WarehouseLayout } from '../types'
import { rackIndex } from './collision'
import { joinKeyOf, runAxis, runCoords, structuralWidth } from './runs'

/**
 * Magnet reach along the run, in meters. Deliberately NOT tied to the grid step: a
 * cell-sized radius collapsed to a few centimetres on a fine grid (5–10 cm snap), so a
 * rack dragged up to its neighbour almost never clicked into the run and you were left
 * with a 1–2 cm gap and a doubled frame. A coarse grid still widens the magnet, and
 * Ctrl suppresses joining whenever the plain grid position is what you actually want.
 */
const REACH_ALONG_M = 0.9
/** Across the run the reach stays tight, so a rack is never yanked out of its row. */
const REACH_CROSS_M = 0.35

export function snapReach(cellSize: number): { along: number; cross: number } {
  return {
    along: Math.max(REACH_ALONG_M, 0.9 * cellSize),
    cross: Math.max(REACH_CROSS_M, 0.9 * cellSize),
  }
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
 * Every position within magnet reach at which the candidate rack would share an upright
 * frame with an existing one, nearest first. Only neighbours of the same frame system,
 * facing the same way and collinear qualify — so this accepts a sibling template with a
 * different level layout, and a join can never produce a placement the collision rules
 * would reject on its own — but the *nearest* join may still be taken by another rack, which
 * is why this returns the whole ranked list for the caller to walk.
 */
export function findJoinSnaps(
  layout: WarehouseLayout,
  templateId: string,
  rotation: RackRotation,
  worldX: number,
  worldZ: number,
  excludeIds?: Set<string>,
): JoinSnap[] {
  const t = layout.templates[templateId]
  if (!t) return []
  const cell = layout.floor.cellSize
  const reach = snapReach(cell)
  const axis = runAxis(rotation)
  const key = joinKeyOf(t)
  const half = structuralWidth(t) / 2
  const raw = runCoords(worldX / cell, worldZ / cell, rotation, cell)

  const found: { snap: JoinSnap; score: number }[] = []

  for (const entry of rackIndex(layout)) {
    if (excludeIds?.has(entry.id)) continue
    const p = entry.pose
    if (p.joinKey !== key) continue
    if (p.rotation % 180 !== rotation % 180) continue
    if (p.axis !== axis) continue
    const crossDelta = Math.abs(p.cross - raw.cross)
    if (crossDelta > reach.cross) continue

    // Attach on either side: our structural edge meets theirs.
    for (const along of [p.max + half, p.min - half]) {
      const alongDelta = Math.abs(along - raw.along)
      if (alongDelta > reach.along) continue
      // Normalized by each reach, since they differ: 10 cm off the row line is a much
      // weaker match than 10 cm short along it.
      const score = alongDelta / reach.along + crossDelta / reach.cross
      const worldCross = p.cross
      found.push({
        score,
        snap: {
          neighbourId: entry.id,
          worldX: axis === 'x' ? along : worldCross,
          worldZ: axis === 'x' ? worldCross : along,
          axis,
          markerAlong: along === p.max + half ? p.max : p.min,
          markerCross: worldCross,
        },
      })
    }
  }

  // Ties break on rack id so the ghost never flickers between equidistant neighbours.
  found.sort((a, b) => a.score - b.score || a.snap.neighbourId.localeCompare(b.snap.neighbourId))
  return found.map((f) => f.snap)
}

/** Nearest join position, ignoring whether it is already occupied. */
export function findJoinSnap(
  layout: WarehouseLayout,
  templateId: string,
  rotation: RackRotation,
  worldX: number,
  worldZ: number,
  excludeIds?: Set<string>,
): JoinSnap | null {
  return findJoinSnaps(layout, templateId, rotation, worldX, worldZ, excludeIds)[0] ?? null
}
