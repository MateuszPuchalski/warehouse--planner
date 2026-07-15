import type { ColorMode, ResolvedSlot, SlotStatus } from '../types'

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

export function slotColor(slot: ResolvedSlot, mode: ColorMode, stockCount = 0): string {
  if (mode === 'utilization') {
    if (slot.status === 'blocked') return STATUS_COLORS.blocked
    if (slot.currentWeightKg <= 0) return STATUS_COLORS.empty
    return utilizationColor(slot.utilization)
  }
  if (mode === 'stock') {
    if (slot.status === 'blocked') return STATUS_COLORS.blocked
    if (stockCount > 1) return STOCK_COLORS.multi
    if (stockCount === 1) return STOCK_COLORS.one
    return STATUS_COLORS.empty
  }
  return STATUS_COLORS[slot.status]
}
