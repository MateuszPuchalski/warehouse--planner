import { create } from 'zustand'
import type { SlotKey, StockItem, StockSource, StockState } from '../types'
import { slotKey } from '../lib/rackGeometry'
import { loadStock, saveStock } from '../lib/persistence'

/** rackCode → slotKey ("bay:level") → products at that address. */
export type StockIndex = Record<string, Record<SlotKey, StockItem[]>>

export interface StockStoreState extends StockState {
  index: StockIndex
  setItems: (items: StockItem[], source: StockSource) => void
  clearStock: () => void
  setBridgeUrl: (url: string) => void
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

function initialState(): StockState & { index: StockIndex } {
  const stored = loadStock()
  if (!stored) {
    return { items: [], importedAt: null, source: null, bridgeUrl: DEFAULT_BRIDGE_URL, index: {} }
  }
  return {
    items: stored.items,
    importedAt: stored.importedAt ?? null,
    source: stored.source ?? null,
    bridgeUrl: stored.bridgeUrl || DEFAULT_BRIDGE_URL,
    index: buildIndex(stored.items),
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
    }
    saveStock(next)
    set({ ...next, index: {} })
  },

  setBridgeUrl: (bridgeUrl) => {
    set({ bridgeUrl })
    const { items, importedAt, source } = get()
    saveStock({ items, importedAt, source, bridgeUrl })
  },
}))

/** Reactive per-rack stock lookup for scene/UI components. */
export function useRackStock(code: string | undefined): Record<SlotKey, StockItem[]> | null {
  return useStockStore((s) => (code ? (s.index[code] ?? null) : null))
}
