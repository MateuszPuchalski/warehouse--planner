import type { WarehouseLayout } from '../types'
import { rackIndex, type RackMove } from './collision'

export type AlignMode = 'minX' | 'centerX' | 'maxX' | 'minZ' | 'centerZ' | 'maxZ'

/**
 * Align racks by their footprint EDGES rather than their grid centres, so racks of
 * different sizes come out genuinely flush. Grid coordinates stay fractional where
 * needed — snapping the centre would reintroduce the misalignment we're removing.
 */
export function alignMoves(layout: WarehouseLayout, ids: string[], mode: AlignMode): RackMove[] {
  const wanted = new Set(ids)
  const entries = rackIndex(layout).filter((e) => wanted.has(e.id))
  if (entries.length < 2) return []
  const cell = layout.floor.cellSize
  const axis = mode.endsWith('X') ? 'x' : 'z'

  const lo = Math.min(...entries.map((e) => (axis === 'x' ? e.aabb.minX : e.aabb.minZ)))
  const hi = Math.max(...entries.map((e) => (axis === 'x' ? e.aabb.maxX : e.aabb.maxZ)))
  const mid = (lo + hi) / 2

  const moves: RackMove[] = []
  for (const e of entries) {
    const rack = layout.racks[e.id]
    if (!rack) continue
    const min = axis === 'x' ? e.aabb.minX : e.aabb.minZ
    const max = axis === 'x' ? e.aabb.maxX : e.aabb.maxZ
    const center = (min + max) / 2
    let delta = 0
    if (mode === 'minX' || mode === 'minZ') delta = lo - min
    else if (mode === 'maxX' || mode === 'maxZ') delta = hi - max
    else delta = mid - center
    if (Math.abs(delta) < 1e-9) continue
    const dGrid = delta / cell
    moves.push({
      rackId: e.id,
      gridX: axis === 'x' ? rack.gridX + dGrid : rack.gridX,
      gridZ: axis === 'z' ? rack.gridZ + dGrid : rack.gridZ,
    })
  }
  return moves
}

/**
 * Spread racks so the gaps between consecutive footprints are equal along one axis.
 * The two outermost racks stay put and define the span.
 */
export function distributeMoves(
  layout: WarehouseLayout,
  ids: string[],
  axis: 'x' | 'z',
): RackMove[] {
  const wanted = new Set(ids)
  const entries = rackIndex(layout)
    .filter((e) => wanted.has(e.id))
    .sort((a, b) =>
      axis === 'x' ? a.aabb.minX - b.aabb.minX : a.aabb.minZ - b.aabb.minZ,
    )
  if (entries.length < 3) return []

  const cell = layout.floor.cellSize
  const size = (e: (typeof entries)[number]) =>
    axis === 'x' ? e.aabb.maxX - e.aabb.minX : e.aabb.maxZ - e.aabb.minZ
  const first = entries[0]
  const last = entries[entries.length - 1]
  const spanStart = axis === 'x' ? first.aabb.minX : first.aabb.minZ
  const spanEnd = axis === 'x' ? last.aabb.maxX : last.aabb.maxZ
  const totalSize = entries.reduce((sum, e) => sum + size(e), 0)
  const gap = (spanEnd - spanStart - totalSize) / (entries.length - 1)

  const moves: RackMove[] = []
  let cursor = spanStart
  for (const e of entries) {
    const rack = layout.racks[e.id]
    const min = axis === 'x' ? e.aabb.minX : e.aabb.minZ
    if (rack) {
      const delta = cursor - min
      if (Math.abs(delta) > 1e-9) {
        const dGrid = delta / cell
        moves.push({
          rackId: e.id,
          gridX: axis === 'x' ? rack.gridX + dGrid : rack.gridX,
          gridZ: axis === 'z' ? rack.gridZ + dGrid : rack.gridZ,
        })
      }
    }
    cursor += size(e) + gap
  }
  return moves
}
