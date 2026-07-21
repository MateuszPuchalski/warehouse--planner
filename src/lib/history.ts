import type { HistorySnapshot, StockItem, WarehouseLayout } from '../types'
import type { StockIndex } from '../store/useStockStore'
import { computeKpis } from './kpi'
import { appendHistory } from './persistence'
import { updateSkuStats } from './skuStats'

/**
 * Compute the current warehouse KPIs and append them as a timestamped history
 * snapshot, and fold the stock into the rolling per-SKU rotation counters — the
 * groundwork for rotation heat-maps and the Insights panel. Called on every
 * bridge sync and file import.
 */
export function recordHistorySnapshot(
  layout: WarehouseLayout,
  stockIndex: StockIndex,
  items: StockItem[],
): HistorySnapshot {
  const k = computeKpis(layout, stockIndex, items)
  const snapshot: HistorySnapshot = {
    at: new Date().toISOString(),
    fillPct: k.fillPct,
    volumeUtilPct: k.volumeUtilPct,
    occupiedSlots: k.occupiedSlots,
    slotCount: k.slotCount,
    overVolumeSlots: k.overVolumeSlots,
  }
  appendHistory(snapshot)
  updateSkuStats(items, Date.now())
  return snapshot
}
