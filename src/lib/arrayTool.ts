import type { WarehouseLayout } from '../types'
import { overlaps, rackIndex, validateGroupPlacement } from './collision'
import { aabbFor } from './rackGeometry'

export interface ArraySpec {
  countX: number
  countZ: number
  /** Step between copies, in grid cells (footprint + gap). */
  spacingXCells: number
  spacingZCells: number
  signX: 1 | -1
  signZ: 1 | -1
}

export interface ArrayResult {
  specs: { sourceId: string; gridX: number; gridZ: number }[]
  /** Copies dropped because they overlapped or left the floor. */
  skipped: number
}

/**
 * Lay the source racks out in a countX × countZ grid. Copies are validated
 * incrementally — each accepted copy joins the obstacle set — so copies never collide
 * with each other, and ones that don't fit are dropped rather than aborting the array.
 */
export function buildArraySpecs(
  layout: WarehouseLayout,
  sourceIds: string[],
  spec: ArraySpec,
): ArrayResult {
  const sources = sourceIds
    .map((id) => layout.racks[id])
    .filter((r): r is NonNullable<typeof r> => !!r)
  if (sources.length === 0) return { specs: [], skipped: 0 }

  const cell = layout.floor.cellSize
  const placed = rackIndex(layout).map((e) => e.aabb)
  const specs: ArrayResult['specs'] = []
  let skipped = 0

  for (let ix = 0; ix < spec.countX; ix++) {
    for (let iz = 0; iz < spec.countZ; iz++) {
      if (ix === 0 && iz === 0) continue // the sources themselves
      const dx = spec.signX * ix * spec.spacingXCells
      const dz = spec.signZ * iz * spec.spacingZCells
      for (const src of sources) {
        const template = layout.templates[src.templateId]
        if (!template) continue
        const gridX = src.gridX + dx
        const gridZ = src.gridZ + dz
        const aabb = aabbFor(gridX, gridZ, src.rotation, template, cell)
        const fits =
          validateGroupPlacement(layout, [
            { rackId: `${src.id}#a${ix}_${iz}`, gridX, gridZ, templateId: src.templateId, rotation: src.rotation },
          ]).valid && !placed.some((p) => overlaps(aabb, p))
        if (!fits) {
          skipped++
          continue
        }
        placed.push(aabb)
        specs.push({ sourceId: src.id, gridX, gridZ })
      }
    }
  }
  return { specs, skipped }
}
