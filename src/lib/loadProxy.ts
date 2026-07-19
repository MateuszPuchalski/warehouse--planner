import type { CarrierKind, RackTemplate, ResolvedSlot, StockItem } from '../types'
import { getSlotCell, stockVolumeM3, type Member } from './rackGeometry'

/** Height of the pallet base slab under a pallet load, in meters. */
export const PALLET_BASE_H = 0.12

/** Fill level used for a slot that holds stock but has no per-unit volume data. */
const UNKNOWN_FILL = 0.4

/** Footprint fraction (of the slot interior) each carrier occupies, [width, depth]. */
const CARRIER_FOOTPRINT: Record<CarrierKind, [number, number]> = {
  pallet: [0.82, 0.9],
  carton: [0.85, 0.82],
  bin: [0.72, 0.78],
}

/** The carrier of a template — explicit field, else inferred from rack depth. */
export function carrierKind(t: RackTemplate): CarrierKind {
  if (t.carrier) return t.carrier
  return t.depth >= 0.8 ? 'pallet' : t.depth >= 0.45 ? 'carton' : 'bin'
}

/**
 * Stock-only fill of a slot for the 3D load proxy. Returns null when nothing is
 * stored there. When the stock carries volume data, the fill scales with it;
 * otherwise a fixed indicator height is used (hasVolume = false).
 */
export function stockProxyFill(
  slot: ResolvedSlot,
  items: StockItem[] | undefined,
): { util: number; hasVolume: boolean } | null {
  if (!items || items.length === 0) return null
  const v = stockVolumeM3(items)
  if (v > 0 && slot.maxVolumeM3 > 0) {
    return { util: Math.min(1, Math.max(0.05, v / slot.maxVolumeM3)), hasVolume: true }
  }
  return { util: UNKNOWN_FILL, hasVolume: false }
}

/**
 * Local-space transforms of the load box (and pallet base, for pallet carriers)
 * sitting on the shelf floor of one slot, rising to `util` of the slot height.
 */
export function proxyTransforms(
  t: RackTemplate,
  level: number,
  util: number,
  carrier: CarrierKind,
): { load: Member; base: Member | null } {
  const cell = getSlotCell(t, 0, level)
  const [cw, ch, cd] = cell.scale
  const floorY = cell.pos[1] - ch / 2
  const [fw, fd] = CARRIER_FOOTPRINT[carrier]
  const baseH = carrier === 'pallet' ? Math.min(PALLET_BASE_H, ch * 0.25) : 0
  const loadH = Math.max(0.02, (ch - baseH) * Math.min(1, Math.max(0, util)))

  const load: Member = {
    pos: [0, floorY + baseH + loadH / 2, 0],
    scale: [cw * fw, loadH, cd * fd],
  }
  const base: Member | null =
    carrier === 'pallet'
      ? { pos: [0, floorY + baseH / 2, 0], scale: [cw * fw * 1.02, baseH, cd * fd * 1.02] }
      : null
  return { load, base }
}
