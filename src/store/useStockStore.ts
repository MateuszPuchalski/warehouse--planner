import { create } from 'zustand'
import type { SlotKey, StockItem, StockSource, StockState } from '../types'
import { slotKey } from '../lib/rackGeometry'
import { loadStock, saveStock } from '../lib/persistence'
import { fetchBridgeStock } from '../lib/bridge'
import { recordHistorySnapshot } from '../lib/history'
import { useWarehouseStore } from './useWarehouseStore'

/** rackCode → slotKey ("bay:level") → products at that address. */
export type StockIndex = Record<string, Record<SlotKey, StockItem[]>>

export interface StockStoreState extends StockState {
  index: StockIndex
  /** True while a bridge refresh is in flight. */
  syncing: boolean
  /** Last bridge error message, or null. */
  syncError: string | null
  setItems: (items: StockItem[], source: StockSource) => void
  clearStock: () => void
  setBridgeUrl: (url: string) => void
  setAutoRefresh: (sec: number) => void
  refreshFromBridge: () => Promise<void>
}

function buildIndex(items: StockItem[]): StockIndex {
  const index: StockIndex = {}
  for (const item of items) {
    for (const loc of item.locations) {
      const rack = (index[loc.rackCode] ??= {})
      ;(rack[slotKey(loc.bay, loc.level)] ??= []).push(item)
    }
  }
  return index
}

const DEFAULT_BRIDGE_URL = 'http://localhost:8710/api/stock'

function initialState(): StockState & { index: StockIndex; syncing: boolean; syncError: string | null } {
  const base = { syncing: false, syncError: null }
  const stored = loadStock()
  if (!stored) {
    return { items: [], importedAt: null, source: null, bridgeUrl: DEFAULT_BRIDGE_URL, autoRefreshSec: 0, index: {}, ...base }
  }
  return {
    items: stored.items,
    importedAt: stored.importedAt ?? null,
    source: stored.source ?? null,
    bridgeUrl: stored.bridgeUrl || DEFAULT_BRIDGE_URL,
    autoRefreshSec: stored.autoRefreshSec ?? 0,
    index: buildIndex(stored.items),
    ...base,
  }
}

export const useStockStore = create<StockStoreState>()((set, get) => ({
  ...initialState(),

  setItems: (items, source) => {
    const next: StockState = {
      items,
      importedAt: new Date().toISOString(),
      source,
      bridgeUrl: get().bridgeUrl,
      autoRefreshSec: get().autoRefreshSec,
    }
    saveStock(next)
    set({ ...next, index: buildIndex(items) })
  },

  clearStock: () => {
    const next: StockState = {
      items: [],
      importedAt: null,
      source: null,
      bridgeUrl: get().bridgeUrl,
      autoRefreshSec: get().autoRefreshSec,
    }
    saveStock(next)
    set({ ...next, index: {} })
  },

  setBridgeUrl: (bridgeUrl) => {
    const { items, importedAt, source, autoRefreshSec } = get()
    set({ bridgeUrl })
    saveStock({ items, importedAt, source, bridgeUrl, autoRefreshSec })
  },

  setAutoRefresh: (autoRefreshSec) => {
    const { items, importedAt, source, bridgeUrl } = get()
    set({ autoRefreshSec })
    saveStock({ items, importedAt, source, bridgeUrl, autoRefreshSec })
  },

  refreshFromBridge: async () => {
    const url = get().bridgeUrl
    if (!url.trim()) return
    set({ syncing: true, syncError: null })
    try {
      const items = await fetchBridgeStock(url)
      get().setItems(items, 'bridge')
      recordHistorySnapshot(useWarehouseStore.getState().layout, get().index, items)
      set({ syncing: false })
    } catch (err) {
      set({ syncing: false, syncError: err instanceof Error ? err.message : String(err) })
    }
  },
}))

/** Reactive per-rack stock lookup for scene/UI components. */
export function useRackStock(code: string | undefined): Record<SlotKey, StockItem[]> | null {
  return useStockStore((s) => (code ? (s.index[code] ?? null) : null))
}
