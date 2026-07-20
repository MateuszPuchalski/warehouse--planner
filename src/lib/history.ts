import type { HistorySnapshot, StockItem, WarehouseLayout } from '../types'
import type { StockIndex } from '../store/useStockStore'
import { computeKpis } from './kpi'
import { appendHistory } from './persistence'

/**
 * Compute the current warehouse KPIs and append them as a timestamped history
 * snapshot — the groundwork for rotation heat-maps and capacity forecasting.
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
  return snapshot
}
