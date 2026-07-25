import type { RackRotation, WarehouseLayout } from '../types'
import { gridToWorld } from './grid'
import { lineOf } from './locationCode'

/** Rack number inside its line: "A01" → 1, "A1" → 1. Returns null when not code-shaped. */
export function rackNoOf(code: string): number | null {
  const m = /^[A-Z](\d{1,3})$/.exec(code.trim().toUpperCase())
  return m ? Number(m[1]) : null
}

/**
 * Whether a rack can appear in the route and be addressed from the ERP: it needs a code
 * shaped like "A01". Single source of truth so the route and the floor labels agree on
 * what "uncoded" means.
 */
export function isAddressable<T extends { code?: string }>(rack: T): rack is T & { code: string } {
  return !!rack.code && rackNoOf(rack.code) !== null
}

export interface PickStop {
  rackId: string
  code: string
  /** 1-based position in the walking order. */
  seq: number
  /** Standing point in front of the rack face, in world meters. */
  x: number
  z: number
}

/**
 * Outward normal of a rack's picking face. Rotating by θ maps local (x,z) to
 * (x·cosθ + z·sinθ, −x·sinθ + z·cosθ), so the local −Z face points at world −Z for 0°,
 * −X for 90°, +Z for 180° and +X for 270°.
 */
function faceNormal(rotation: RackRotation): { nx: number; nz: number } {
  switch (rotation) {
    case 90:
      return { nx: -1, nz: 0 }
    case 180:
      return { nx: 0, nz: 1 }
    case 270:
      return { nx: 1, nz: 0 }
    default:
      return { nx: 0, nz: -1 }
  }
}

const routeCache = new WeakMap<WarehouseLayout, PickStop[]>()

/**
 * Walking order derived strictly from ERP rack codes: line letter A→Z, then rack
 * number ascending. With serpentine on, every other line is walked back the other way,
 * which is how a picker actually moves through a hall.
 *
 * Racks without a code are outside the sequence by construction — they have no ERP
 * address, so nothing can be picked from them.
 *
 * Note this reflects the CODES, not the geometry: if the codes don't follow the
 * physical layout the route will zig-zag, and seeing that is the point.
 */
export function pickRoute(layout: WarehouseLayout): PickStop[] {
  const hit = routeCache.get(layout)
  if (hit) return hit

  const cell = layout.floor.cellSize
  const serpentine = layout.floor.pickSerpentine !== false

  // Group coded racks by line letter.
  const byLine = new Map<string, { rackId: string; code: string; no: number }[]>()
  for (const rack of Object.values(layout.racks)) {
    if (!isAddressable(rack)) continue
    const no = rackNoOf(rack.code)!
    const line = lineOf(rack.code)
    const entry = { rackId: rack.id, code: rack.code, no }
    const list = byLine.get(line)
    if (list) list.push(entry)
    else byLine.set(line, [entry])
  }

  const stops: PickStop[] = []
  const lines = [...byLine.keys()].sort()
  lines.forEach((line, lineIdx) => {
    const racks = byLine.get(line)!.sort((a, b) => a.no - b.no || a.code.localeCompare(b.code))
    if (serpentine && lineIdx % 2 === 1) racks.reverse()
    for (const entry of racks) {
      const rack = layout.racks[entry.rackId]
      const tpl = layout.templates[rack.templateId]
      if (!tpl) continue
      const { nx, nz } = faceNormal(rack.rotation)
      // Stand clear of the face rather than inside the rack.
      const offset = tpl.depth / 2 + 0.4
      stops.push({
        rackId: rack.id,
        code: entry.code,
        seq: stops.length + 1,
        x: gridToWorld(rack.gridX, cell) + nx * offset,
        z: gridToWorld(rack.gridZ, cell) + nz * offset,
      })
    }
  })

  routeCache.set(layout, stops)
  return stops
}

/** rackId → 0-based traversal index, for any consumer that needs to sort by the route. */
export function pickOrder(layout: WarehouseLayout): Map<string, number> {
  const out = new Map<string, number>()
  pickRoute(layout).forEach((s, i) => out.set(s.rackId, i))
  return out
}

/** Racks left out of the sequence because they carry no usable ERP code. */
export function uncodedRackIds(layout: WarehouseLayout): string[] {
  return Object.values(layout.racks)
    .filter((r) => !isAddressable(r))
    .map((r) => r.id)
}
