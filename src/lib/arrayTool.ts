import type { WarehouseLayout } from '../types'
import { blocks, poseFor, rackIndex, validateGroupPlacement } from './collision'
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
  // Pose-aware, so copies laid out at joined spacing count as shared frames rather
  // than being silently dropped as overlaps.
  const placed = rackIndex(layout).map((e) => ({ aabb: e.aabb, pose: e.pose }))
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
        const pose = poseFor(gridX, gridZ, src.rotation, template, src.templateId, cell)
        const candidate = { aabb, pose }
        const fits =
          validateGroupPlacement(layout, [
            { rackId: `${src.id}#a${ix}_${iz}`, gridX, gridZ, templateId: src.templateId, rotation: src.rotation },
          ]).valid && !placed.some((p) => blocks(candidate, p))
        if (!fits) {
          skipped++
          continue
        }
        placed.push(candidate)
        specs.push({ sourceId: src.id, gridX, gridZ })
      }
    }
  }
  return { specs, skipped }
}
