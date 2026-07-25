import type { WarehouseLayout } from '../types'
import { rackIndex } from './collision'
import { isAddressable } from './pickPath'
import { frameHeightOf } from './runs'

/** How far above the rack's top beam its label floats. */
const LABEL_LIFT_M = 0.35

export interface RackLabel {
  rackId: string
  /** ERP code, or null when the rack has none (or an unusable one). */
  code: string | null
  x: number
  y: number
  z: number
}

const labelCache = new WeakMap<WarehouseLayout, RackLabel[]>()

/**
 * One label anchor per rack, floating just above its top beam so the rack cannot occlude
 * its own code and the codes never collide with the pick-route badges near the floor.
 *
 * Memoized on layout identity, like `rackIndex` — every store mutation runs the layout
 * through `touch()`, so identity is a correct cache key.
 */
export function rackLabels(layout: WarehouseLayout): RackLabel[] {
  const hit = labelCache.get(layout)
  if (hit) return hit

  const out: RackLabel[] = []
  for (const entry of rackIndex(layout)) {
    const rack = layout.racks[entry.id]
    if (!rack) continue
    const tpl = layout.templates[rack.templateId]
    if (!tpl) continue
    out.push({
      rackId: rack.id,
      code: isAddressable(rack) ? rack.code : null,
      x: (entry.aabb.minX + entry.aabb.maxX) / 2,
      y: frameHeightOf(tpl) + LABEL_LIFT_M,
      z: (entry.aabb.minZ + entry.aabb.maxZ) / 2,
    })
  }
  // Deterministic order, so a cap truncates predictably rather than arbitrarily.
  out.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '') || a.rackId.localeCompare(b.rackId))
  labelCache.set(layout, out)
  return out
}
