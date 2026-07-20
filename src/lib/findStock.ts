import type { StockItem, WarehouseLayout } from '../types'
import { resolveSlot, slotKey } from './rackGeometry'

export interface StockHit {
  item: StockItem
  rackId: string
  rackCode: string
  slotKey: string
  label: string
}

/** Products whose symbol, name, or EAN contains the query (case-insensitive). */
export function matchStock(items: StockItem[], query: string): StockItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return items.filter(
    (i) =>
      i.symbol.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      (i.ean ? i.ean.toLowerCase().includes(q) : false),
  )
}

/**
 * Expand matched products into concrete slot locations, mapping each location's
 * rack code to a placed rack. Locations whose code has no matching rack are skipped.
 */
export function locateHits(
  matches: StockItem[],
  layout: WarehouseLayout,
  limit = 50,
): StockHit[] {
  const codeToRack = new Map<string, string>()
  for (const rack of Object.values(layout.racks)) {
    if (rack.code && !codeToRack.has(rack.code)) codeToRack.set(rack.code, rack.id)
  }

  const hits: StockHit[] = []
  for (const item of matches) {
    for (const loc of item.locations) {
      const rackId = codeToRack.get(loc.rackCode)
      if (!rackId) continue
      const rack = layout.racks[rackId]
      const template = layout.templates[rack.templateId]
      const inRange = template && loc.bay < template.bays && loc.level < template.levels
      const label = inRange
        ? resolveSlot(template, rack, loc.bay, loc.level).label
        : `B${loc.bay + 1}-L${loc.level + 1}`
      hits.push({
        item,
        rackId,
        rackCode: loc.rackCode,
        slotKey: slotKey(loc.bay, loc.level),
        label,
      })
      if (hits.length >= limit) return hits
    }
  }
  return hits
}
