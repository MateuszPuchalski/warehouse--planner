import type { AABB, AlignGuide, RackRotation, WarehouseLayout } from '../types'
import { rackIndex, wallIndex } from './collision'
import { getFootprint } from './rackGeometry'

/**
 * How far a rack is pulled onto an alignment line, in meters. Grid-independent for the
 * same reason the join magnet is (see `snapReach`): tying it to the cell size made it
 * useless at a fine grid step. Smaller than the join reach, since joining is the
 * stronger intent and gets to win.
 */
export const ALIGN_REACH_M = 0.25

/** How far a guide line is drawn past the two boxes it connects. */
const GUIDE_OVERSHOOT = 0.4

interface Candidate {
  /** Where our centre would land. */
  center: number
  /** Distance we would be pulled. */
  delta: number
  /** The line we snapped to, and the neighbour that owns it. */
  at: number
  kind: AlignGuide['kind']
  otherMin: number
  otherMax: number
}

/** Edges and centre of a box on one axis. */
function lines(box: AABB, axis: 'x' | 'z'): { at: number; kind: AlignGuide['kind'] }[] {
  const min = axis === 'x' ? box.minX : box.minZ
  const max = axis === 'x' ? box.maxX : box.maxZ
  return [
    { at: min, kind: 'edge' },
    { at: max, kind: 'edge' },
    { at: (min + max) / 2, kind: 'center' },
  ]
}

function bestOnAxis(
  axis: 'x' | 'z',
  center: number,
  half: number,
  boxes: AABB[],
): Candidate | null {
  let best: Candidate | null = null
  for (const box of boxes) {
    const across = axis === 'x' ? [box.minZ, box.maxZ] : [box.minX, box.maxX]
    for (const line of lines(box, axis)) {
      // Our left edge, our centre or our right edge may land on that line.
      for (const wanted of [line.at + half, line.at, line.at - half]) {
        const delta = wanted - center
        if (Math.abs(delta) > ALIGN_REACH_M) continue
        if (best && Math.abs(delta) >= Math.abs(best.delta)) continue
        best = {
          center: wanted,
          delta,
          at: line.at,
          kind: line.kind,
          otherMin: across[0],
          otherMax: across[1],
        }
      }
    }
  }
  return best
}

export interface AlignSnapResult {
  worldX: number
  worldZ: number
  guides: AlignGuide[]
}

/**
 * Pull a candidate placement onto the nearest alignment line of the racks and walls
 * around it — edge to edge, centre to centre — one snap per axis, independently.
 *
 * This is the loose counterpart to the join magnet: it works across templates and
 * rotations and only lines things up, it never claims the two racks share a frame.
 */
export function findAlignSnap(
  layout: WarehouseLayout,
  templateId: string,
  rotation: RackRotation,
  worldX: number,
  worldZ: number,
  excludeIds?: Set<string>,
): AlignSnapResult | null {
  const tpl = layout.templates[templateId]
  if (!tpl) return null
  const { w, d } = getFootprint(tpl, rotation)
  const boxes = [
    ...rackIndex(layout)
      .filter((e) => !excludeIds?.has(e.id))
      .map((e) => e.aabb),
    ...wallIndex(layout),
  ]
  if (boxes.length === 0) return null

  const x = bestOnAxis('x', worldX, w / 2, boxes)
  const z = bestOnAxis('z', worldZ, d / 2, boxes)
  if (!x && !z) return null

  const outX = x ? x.center : worldX
  const outZ = z ? z.center : worldZ
  const guides: AlignGuide[] = []
  if (x) {
    // A guide at constant x runs along z, spanning our box and the neighbour's.
    const lo = Math.min(x.otherMin, outZ - d / 2) - GUIDE_OVERSHOOT
    const hi = Math.max(x.otherMax, outZ + d / 2) + GUIDE_OVERSHOOT
    guides.push({ axis: 'x', at: x.at, from: lo, to: hi, kind: x.kind })
  }
  if (z) {
    const lo = Math.min(z.otherMin, outX - w / 2) - GUIDE_OVERSHOOT
    const hi = Math.max(z.otherMax, outX + w / 2) + GUIDE_OVERSHOOT
    guides.push({ axis: 'z', at: z.at, from: lo, to: hi, kind: z.kind })
  }
  return { worldX: outX, worldZ: outZ, guides }
}
