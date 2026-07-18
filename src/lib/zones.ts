import type { Zone, ZoneDraft, ZoneKind } from '../types'

/** Minimum drawable zone side, in grid cells, so a tiny click-drag is ignored. */
export const MIN_ZONE_CELLS = 1

export const ZONE_KINDS: ZoneKind[] = ['packing', 'staging', 'dock', 'office', 'custom']

export const ZONE_KIND_COLORS: Record<ZoneKind, string> = {
  packing: '#f5a623',
  staging: '#4c9aff',
  dock: '#3ddc84',
  office: '#b58cff',
  custom: '#8a93a3',
}

export function zoneColor(zone: Zone): string {
  return zone.color ?? ZONE_KIND_COLORS[zone.kind ?? 'custom']
}

/** Normalized center + size of a zone rectangle, in meters. */
export function zoneRectM(
  zone: Zone | ZoneDraft,
  cellSize: number,
): { cx: number; cz: number; w: number; d: number } {
  const minX = Math.min(zone.x1, zone.x2) * cellSize
  const maxX = Math.max(zone.x1, zone.x2) * cellSize
  const minZ = Math.min(zone.z1, zone.z2) * cellSize
  const maxZ = Math.max(zone.z1, zone.z2) * cellSize
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ }
}
