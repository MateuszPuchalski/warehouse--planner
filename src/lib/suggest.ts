import type { CarrierKind, WarehouseLayout } from '../types'
import type { StockIndex } from '../store/useStockStore'
import { allSlots, effectiveVolume } from './rackGeometry'
import { carrierKind } from './loadProxy'

export interface SuggestRequest {
  neededVolumeM3: number
  /** Optional weight per placement (kg); when set, filters by the slot's weight headroom. */
  neededWeightKg?: number
  /** Optional carrier filter; when set, only racks of this carrier qualify. */
  carrier?: CarrierKind
}

export interface RankedSlot {
  rackId: string
  rackCode: string
  slotKey: string
  label: string
  /** Volume fill after placing the goods (0..1); higher = tighter fit. */
  fillAfter: number
  remainingVolumeM3: number
  remainingWeightKg: number
  empty: boolean
  sameSku: boolean
  reasons: string[]
}

const EPS = 1e-6

/**
 * Rank free slots for a put-away request. Hard filters: not blocked, enough
 * remaining volume (and weight, when given), matching carrier (when given).
 * Ranked by tightest volume fit — the slot the goods fill most fully without
 * overflowing — which minimizes wasted space.
 *
 * Extension point: `fillAfter` is the only ranking term today. A future weighted
 * score could add dock proximity (zoneRectM centroid of `kind==='dock'` zones vs
 * the rack world center `gridX*cellSize`), a low-level bonus, and SKU
 * consolidation (`sameSku`). Kept single-term intentionally for now.
 */
export function suggestSlots(
  layout: WarehouseLayout,
  stockIndex: StockIndex,
  req: SuggestRequest,
  opts?: { sku?: string; limit?: number },
): RankedSlot[] {
  if (!(req.neededVolumeM3 > 0)) return []
  const out: RankedSlot[] = []

  for (const rack of Object.values(layout.racks)) {
    const template = layout.templates[rack.templateId]
    if (!template) continue
    if (req.carrier && carrierKind(template) !== req.carrier) continue
    const rackStock = rack.code ? stockIndex[rack.code] : undefined

    for (const slot of allSlots(template, rack)) {
      if (slot.status === 'blocked') continue
      if (slot.maxVolumeM3 <= 0) continue

      const items = rackStock?.[slot.key]
      const current = effectiveVolume(slot, items).currentM3
      const remainingVolumeM3 = slot.maxVolumeM3 - current
      if (remainingVolumeM3 + EPS < req.neededVolumeM3) continue

      const remainingWeightKg = slot.maxWeightKg - slot.currentWeightKg
      if (req.neededWeightKg !== undefined && remainingWeightKg + EPS < req.neededWeightKg) continue

      const fillAfter = (current + req.neededVolumeM3) / slot.maxVolumeM3
      const empty = current < EPS
      const sameSku = !!opts?.sku && !!items?.some((i) => i.symbol === opts.sku)

      out.push({
        rackId: rack.id,
        rackCode: rack.code ?? rack.id,
        slotKey: slot.key,
        label: slot.label,
        fillAfter,
        remainingVolumeM3,
        remainingWeightKg,
        empty,
        sameSku,
        reasons: [],
      })
    }
  }

  out.sort((a, b) => b.fillAfter - a.fillAfter)
  return out.slice(0, opts?.limit ?? 30)
}
