import type { RackInstance, RackTemplate, SlotKey, StockItem } from '../types'
import { allSlots, getSlotCell, roleAtLevel } from './rackGeometry'

/**
 * Does the product physically go in the slot?
 *
 * Volume alone cannot answer that: a 1985 mm bar has a modest cube and would pass a
 * volume check for a picking slot whose opening is 280 × 150 × 980 mm. This compares the
 * measured outer dimensions against the slot's actual opening.
 */

/** Interior opening of a slot, in millimetres. */
export interface OpeningMm {
  w: number
  h: number
  d: number
}

export interface DimsMm {
  l: number
  w: number
  h: number
}

/**
 * The opening a product has to pass through, from the slot cell geometry the 3D view
 * already uses (it subtracts the upright, the beam and a depth clearance).
 *
 * `null` on a PALLET level, and that is the point: those levels are ADDRESSED per column
 * but LOADED per pallet — there are no uprights between the columns, goods routinely
 * overhang the beams, and a euro pallet is wider than any single 45 cm column. A
 * column-sized opening cannot describe such a position, so rather than invent a number
 * (and flag every pallet in the warehouse as oversized) the check simply does not apply
 * there. Shelf levels, where the column IS the physical compartment, are checked.
 */
export function slotOpeningMm(t: RackTemplate, level: number): OpeningMm | null {
  if (roleAtLevel(t, level) === 'pallet') return null
  const [w, h, d] = getSlotCell(t, 0, level).scale
  return { w: w * 1000, h: h * 1000, d: d * 1000 }
}

/**
 * Whether one unit fits, trying every axis permutation — goods get laid on their side, so
 * a 395 mm guide bar fits a 280 mm wide slot when it goes in along the 980 mm depth.
 */
export function fitsOpening(dims: DimsMm, o: OpeningMm): boolean {
  const [a, b, c] = [dims.l, dims.w, dims.h]
  const perms: [number, number, number][] = [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ]
  const EPS = 1e-6
  return perms.some(([x, y, z]) => x <= o.w + EPS && y <= o.h + EPS && z <= o.d + EPS)
}

/**
 * Products recorded at this slot that cannot physically be there. Items without measured
 * dimensions are never reported — an unmeasured product is unknown, not wrong.
 */
export function misfitItems(t: RackTemplate, level: number, items: StockItem[]): StockItem[] {
  const opening = slotOpeningMm(t, level)
  if (!opening) return []
  return items.filter((i) => i.unitDimsMm && !fitsOpening(i.unitDimsMm, opening))
}

/**
 * Slots of one rack holding something that cannot fit. Lives here rather than in
 * `rackGeometry` so the geometry module stays free of stock concerns — and so the two
 * files do not import each other.
 */
export function countMisfit(
  t: RackTemplate,
  rack: RackInstance,
  stock: Record<SlotKey, StockItem[]> | null | undefined,
): number {
  if (!stock) return 0
  let bad = 0
  for (const s of allSlots(t, rack)) {
    if (misfitItems(t, s.level, stock[s.key] ?? []).length > 0) bad++
  }
  return bad
}

/** Compact "395×65×3" for a badge or a warning line. */
export function formatDims(d: DimsMm): string {
  return `${Math.round(d.l)}×${Math.round(d.w)}×${Math.round(d.h)}`
}

export function formatOpening(o: OpeningMm): string {
  return `${Math.round(o.w)}×${Math.round(o.h)}×${Math.round(o.d)}`
}
