import type { WarehouseLayout } from '../types'
import { rackIndex, type RackMove } from './collision'
import { canJoin, joinedSpacing, runAxis, runCoords } from './runs'

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

/** Why a set of racks cannot be packed into one run. */
export type PackRefusal = 'tooFew' | 'mixed'

/**
 * Close the selected racks up into one continuous run: same row line, structural spans
 * meeting exactly, original order preserved. The rack lowest along the run stays put and
 * the others come to it.
 *
 * This is the deterministic counterpart to the drag magnet — on a fine grid, or across a
 * long row, hitting every junction by hand is fiddly. Only racks of one frame system
 * facing one way can form a run (`runIndex`' rule), so level layouts may differ but
 * anything genuinely incompatible is refused rather than silently rearranged.
 */
export function packRunMoves(
  layout: WarehouseLayout,
  ids: string[],
): { moves: RackMove[] } | { refusal: PackRefusal } {
  const racks = ids.map((id) => layout.racks[id]).filter((r): r is NonNullable<typeof r> => !!r)
  if (racks.length < 2) return { refusal: 'tooFew' }
  const first = racks[0]
  const tpl = layout.templates[first.templateId]
  if (!tpl) return { refusal: 'mixed' }
  // 0°≡180° and 90°≡270° render identically, so they may share a run.
  const facing = first.rotation % 180
  const templateOf = (r: (typeof racks)[number]) => layout.templates[r.templateId]
  if (
    racks.some((r) => {
      const t = templateOf(r)
      return !t || !canJoin(t, tpl) || r.rotation % 180 !== facing
    })
  ) {
    return { refusal: 'mixed' }
  }

  const cell = layout.floor.cellSize
  const axis = runAxis(first.rotation)
  const coords = new Map(
    racks.map((r) => [r.id, runCoords(r.gridX, r.gridZ, r.rotation, cell)] as const),
  )
  const sorted = [...racks].sort((a, b) => coords.get(a.id)!.along - coords.get(b.id)!.along)
  const anchor = coords.get(sorted[0].id)!

  const moves: RackMove[] = []
  // Widths may differ inside one frame system, so the step is per consecutive pair.
  let along = anchor.along
  sorted.forEach((r, i) => {
    if (i > 0) along += joinedSpacing(templateOf(sorted[i - 1])!, templateOf(r)!)
    const gridX = (axis === 'x' ? along : anchor.cross) / cell
    const gridZ = (axis === 'x' ? anchor.cross : along) / cell
    if (Math.abs(gridX - r.gridX) < 1e-9 && Math.abs(gridZ - r.gridZ) < 1e-9) return
    moves.push({ rackId: r.id, gridX, gridZ })
  })
  return { moves }
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
