import type { FloorConfig, Wall, WallDraft } from '../types'
import { worldToGrid } from './grid'

/** Minimum drawable wall length, in grid cells, so a tiny click-drag is ignored. */
export const MIN_WALL_CELLS = 1

/** World-space length of a wall in meters. */
export function wallLengthM(wall: Wall | WallDraft, cellSize: number): number {
  const dx = (wall.x2 - wall.x1) * cellSize
  const dz = (wall.z2 - wall.z1) * cellSize
  return Math.hypot(dx, dz)
}

/**
 * Stable ids for the four boundary walls (north, east, south, west in corner
 * order), so gate/door openings survive floor-dimension changes.
 */
const PERIMETER_IDS = ['wall-perimeter-n', 'wall-perimeter-e', 'wall-perimeter-s', 'wall-perimeter-w'] as const

/**
 * The four boundary walls around the warehouse floor, sized from its
 * width × depth. Regenerated whenever the dimensions change; pass the previous
 * walls to carry each side's openings over to the rebuilt wall.
 */
export function makePerimeterWalls(floor: FloorConfig, prev?: Record<string, Wall>): Wall[] {
  const hwG = floor.widthM / 2 / floor.cellSize
  const hdG = floor.depthM / 2 / floor.cellSize
  const corners: [number, number][] = [
    [-hwG, -hdG],
    [hwG, -hdG],
    [hwG, hdG],
    [-hwG, hdG],
  ]
  const walls: Wall[] = []
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = corners[i]
    const [x2, z2] = corners[(i + 1) % 4]
    const id = PERIMETER_IDS[i]
    const openings = prev?.[id]?.openings
    walls.push({
      id,
      x1,
      z1,
      x2,
      z2,
      heightM: floor.wallHeightM,
      thicknessM: floor.wallThicknessM,
      perimeter: true,
      ...(openings && openings.length > 0 ? { openings } : {}),
    })
  }
  return walls
}

// ---------- Openings (gates / doors) ----------

/** Solid stretch of a wall, in meters along the wall from endpoint 1. */
export interface WallSegment {
  start: number
  end: number
}

/** Lintel above a door-height opening: spans the opening, from yBottom to the wall top. */
export interface WallLintel {
  start: number
  end: number
  yBottom: number
}

/**
 * Split a wall into solid segments and lintels around its openings. Openings
 * are clamped to the wall length and overlapping ones are merged (a merged
 * interval only keeps a lintel when every participant has one).
 */
export function computeWallCuts(
  wall: Wall,
  cellSize: number,
): { lengthM: number; solids: WallSegment[]; lintels: WallLintel[] } {
  const lengthM = wallLengthM(wall, cellSize)
  const H = Math.max(0.05, wall.heightM)

  // Normalize: clamp to the wall, drop degenerate entries.
  const spans: { start: number; end: number; yBottom: number | null }[] = []
  for (const o of wall.openings ?? []) {
    const start = Math.min(Math.max(o.offsetM, 0), lengthM)
    const end = Math.min(Math.max(o.offsetM + Math.max(0.1, o.widthM), start), lengthM)
    if (end - start < 0.01) continue
    const yBottom = o.heightM !== undefined && o.heightM < H - 0.01 ? o.heightM : null
    spans.push({ start, end, yBottom })
  }
  spans.sort((a, b) => a.start - b.start)

  // Merge overlapping openings.
  const merged: typeof spans = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s.start <= last.end + 0.001) {
      last.end = Math.max(last.end, s.end)
      last.yBottom = last.yBottom === null || s.yBottom === null ? null : Math.min(last.yBottom, s.yBottom)
    } else {
      merged.push({ ...s })
    }
  }

  const solids: WallSegment[] = []
  let cursor = 0
  for (const m of merged) {
    if (m.start - cursor > 0.01) solids.push({ start: cursor, end: m.start })
    cursor = m.end
  }
  if (lengthM - cursor > 0.01) solids.push({ start: cursor, end: lengthM })
  if (merged.length === 0) return { lengthM, solids: [{ start: 0, end: lengthM }], lintels: [] }

  const lintels: WallLintel[] = merged
    .filter((m) => m.yBottom !== null)
    .map((m) => ({ start: m.start, end: m.end, yBottom: m.yBottom as number }))

  return { lengthM, solids, lintels }
}

/**
 * Snap a dragged segment to the grid and axis-lock it when it is nearly
 * horizontal or vertical, so hand-drawn walls stay clean and aligned.
 */
export function snapWallSegment(
  worldX1: number,
  worldZ1: number,
  worldX2: number,
  worldZ2: number,
  cellSize: number,
): { x1: number; z1: number; x2: number; z2: number } {
  const x1 = worldToGrid(worldX1, cellSize)
  const z1 = worldToGrid(worldZ1, cellSize)
  let x2 = worldToGrid(worldX2, cellSize)
  let z2 = worldToGrid(worldZ2, cellSize)
  const dx = Math.abs(x2 - x1)
  const dz = Math.abs(z2 - z1)
  // Axis-lock: collapse the minor axis when the drag is close to straight.
  if (dz <= dx * 0.25) z2 = z1
  else if (dx <= dz * 0.25) x2 = x1
  return { x1, z1, x2, z2 }
}
