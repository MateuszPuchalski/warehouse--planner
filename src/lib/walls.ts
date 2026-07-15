import type { FloorConfig, Wall, WallDraft } from '../types'
import { newId } from './ids'
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
 * The four boundary walls around the warehouse floor, sized from its
 * width × depth. Regenerated whenever the dimensions change.
 */
export function makePerimeterWalls(floor: FloorConfig): Wall[] {
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
    walls.push({
      id: newId(),
      x1,
      z1,
      x2,
      z2,
      heightM: floor.wallHeightM,
      thicknessM: floor.wallThicknessM,
      perimeter: true,
    })
  }
  return walls
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
