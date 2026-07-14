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

export function slotColor(slot: ResolvedSlot, mode: ColorMode): string {
  if (mode === 'utilization') {
    if (slot.status === 'blocked') return STATUS_COLORS.blocked
    if (slot.currentWeightKg <= 0) return STATUS_COLORS.empty
    return utilizationColor(slot.utilization)
  }
  return STATUS_COLORS[slot.status]
}
