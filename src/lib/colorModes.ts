import type { AbcClass, ColorMode, PickStat, ResolvedSlot, SlotRole, SlotStatus } from '../types'

export const STATUS_COLORS: Record<SlotStatus, string> = {
  empty: '#4b5563',
  ok: '#3ddc84',
  warning: '#ffb020',
  overweight: '#ff5c5c',
  blocked: '#a78bfa',
}

/** Continuous green → yellow → red by weight utilization. */
export function utilizationColor(utilization: number): string {
  const u = Math.min(1, Math.max(0, utilization))
  const hue = Math.round(120 * (1 - u))
  return `hsl(${hue}, 70%, 52%)`
}

/** Slot fill by Subiekt stock: occupied blue, deeper when several SKUs share it. */
export const STOCK_COLORS = { one: '#38bdf8', multi: '#0369a1' }

/** Slot fill by operational function: pallet positions blue, picking faces amber. */
export const ROLE_COLORS: Record<SlotRole, string> = {
  pallet: '#4c9aff',
  pick: '#f5a623',
}

/**
 * Movement class of the goods in a slot: A burns red, C cools to blue. Deliberately not
 * the green→red utilization ramp — this axis is demand, not fill, and reading one as the
 * other is the mistake the slotting panel exists to correct.
 */
export const ABC_COLORS: Record<AbcClass, string> = {
  A: '#ff5c5c',
  B: '#ffb020',
  C: '#38bdf8',
}

const CLASS_ORDER: AbcClass[] = ['A', 'B', 'C']

/**
 * Fastest-moving class among a slot's goods, or null when nothing there appears in the
 * picking report. One slot shows the demand it actually serves, so a shelf mixing an A
 * and a C reads as A — that is the walk the picker makes.
 */
export function slotAbcClass(
  items: { symbol: string }[] | undefined,
  stats: Record<string, PickStat> | undefined,
): AbcClass | null {
  if (!items || !stats) return null
  let best: AbcClass | null = null
  for (const item of items) {
    const abc = stats[item.symbol]?.abc
    if (!abc) continue
    if (!best || CLASS_ORDER.indexOf(abc) < CLASS_ORDER.indexOf(best)) best = abc
  }
  return best
}

export function slotColor(
  slot: ResolvedSlot,
  mode: ColorMode,
  stockCount = 0,
  volumeUtil?: number,
  abc?: AbcClass | null,
): string {
  if (mode === 'utilization') {
    if (slot.status === 'blocked') return STATUS_COLORS.blocked
    if (slot.currentWeightKg <= 0) return STATUS_COLORS.empty
    return utilizationColor(slot.utilization)
  }
  if (mode === 'volume') {
    if (slot.status === 'blocked') return STATUS_COLORS.blocked
    const u = volumeUtil ?? slot.volumeUtilization
    if (u <= 0) return STATUS_COLORS.empty
    return utilizationColor(u)
  }
  if (mode === 'stock') {
    if (slot.status === 'blocked') return STATUS_COLORS.blocked
    if (stockCount > 1) return STOCK_COLORS.multi
    if (stockCount === 1) return STOCK_COLORS.one
    return STATUS_COLORS.empty
  }
  if (mode === 'function') {
    return ROLE_COLORS[slot.role]
  }
  if (mode === 'demand') {
    if (slot.status === 'blocked') return STATUS_COLORS.blocked
    // Occupied but absent from the report = goods that never moved in the period, which is
    // a finding in itself; they keep the empty grey rather than borrowing a class color.
    return abc ? ABC_COLORS[abc] : STATUS_COLORS.empty
  }
  return STATUS_COLORS[slot.status]
}
