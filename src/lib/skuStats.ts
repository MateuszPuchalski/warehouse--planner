import type { SkuStat, StockItem } from '../types'
import { loadSkuStats, saveSkuStats } from './persistence'

const DAY_MS = 86_400_000
/** Min age used for throughput so a SKU seen twice within minutes can't blow up the rate. */
const MIN_AGE_DAYS = 1 / 24
/** A SKU counts as stale once its quantity hasn't changed for this many days. */
export const STALE_DAYS = 14
/** Hard cap on tracked SKUs so the store can't grow without bound. */
const SKU_LIMIT = 5000

export type SkuStatsMap = Record<string, SkuStat>

/** Derived, per-SKU rotation view computed from a `SkuStat` at a point in time. */
export interface SkuVelocity {
  symbol: string
  name: string
  lastQty: number
  /** Units moved (in + out) per day since the SKU was first seen. */
  throughput: number
  /** Days since the quantity last changed. */
  idleDays: number
  /** lastQty − firstQty. */
  net: number
  syncs: number
}

/** Sum current quantity per symbol from the stock list (defensive against dupes). */
function currentQuantities(items: StockItem[]): Map<string, { name: string; qty: number }> {
  const current = new Map<string, { name: string; qty: number }>()
  for (const it of items) {
    const prev = current.get(it.symbol)
    if (prev) prev.qty += it.quantity
    else current.set(it.symbol, { name: it.name, qty: it.quantity })
  }
  return current
}

/** Keep only the most-recently-seen SKUs when over the cap (logs what was dropped). */
function pruneSkuStats(stats: SkuStatsMap): SkuStatsMap {
  const values = Object.values(stats)
  if (values.length <= SKU_LIMIT) return stats
  const kept = values.sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, SKU_LIMIT)
  console.warn(`[skuStats] pruned ${values.length - SKU_LIMIT} least-recent SKU records (cap ${SKU_LIMIT})`)
  const out: SkuStatsMap = {}
  for (const s of kept) out[s.symbol] = s
  return out
}

/**
 * Fold the current stock into the rolling per-SKU counters and persist. Called
 * once per sync (from `recordHistorySnapshot`), so it covers both bridge syncs
 * and file imports. Movement is derived from the quantity delta versus the last
 * sync; a SKU that drops out of the feed while holding stock is booked as a
 * single outflow.
 */
export function updateSkuStats(items: StockItem[], now: number): void {
  const nowIso = new Date(now).toISOString()
  const stats = loadSkuStats()
  const current = currentQuantities(items)

  for (const [symbol, { name, qty }] of current) {
    const s = stats[symbol]
    if (!s) {
      stats[symbol] = {
        symbol,
        name,
        firstAt: nowIso,
        firstQty: qty,
        lastAt: nowIso,
        lastQty: qty,
        lastChangeAt: nowIso,
        totalInflow: 0,
        totalOutflow: 0,
        syncs: 1,
      }
      continue
    }
    const delta = qty - s.lastQty
    if (delta > 0) s.totalInflow += delta
    else if (delta < 0) s.totalOutflow += -delta
    if (delta !== 0) s.lastChangeAt = nowIso
    s.lastQty = qty
    s.lastAt = nowIso
    s.name = name
    s.syncs += 1
  }

  // SKUs that vanished from the feed while still holding stock → one-off outflow.
  // Once lastQty hits 0 the delta stays 0, so this never double-counts.
  for (const s of Object.values(stats)) {
    if (!current.has(s.symbol) && s.lastQty > 0) {
      s.totalOutflow += s.lastQty
      s.lastQty = 0
      s.lastChangeAt = nowIso
      s.lastAt = nowIso
    }
  }

  saveSkuStats(pruneSkuStats(stats))
}

/**
 * Split tracked SKUs into fast movers (highest throughput) and stale stock
 * (still on hand but unmoved for `staleDays`). Pure function of `stats`/`now`.
 */
export function computeSkuVelocity(
  stats: SkuStatsMap,
  now: number,
  opts?: { limit?: number; staleDays?: number },
): { fast: SkuVelocity[]; stale: SkuVelocity[] } {
  const limit = opts?.limit ?? 8
  const staleDays = opts?.staleDays ?? STALE_DAYS
  const all: SkuVelocity[] = Object.values(stats).map((s) => {
    const ageDays = Math.max(MIN_AGE_DAYS, (now - Date.parse(s.firstAt)) / DAY_MS)
    return {
      symbol: s.symbol,
      name: s.name,
      lastQty: s.lastQty,
      throughput: (s.totalInflow + s.totalOutflow) / ageDays,
      idleDays: (now - Date.parse(s.lastChangeAt)) / DAY_MS,
      net: s.lastQty - s.firstQty,
      syncs: s.syncs,
    }
  })
  const fast = all
    .filter((v) => v.throughput > 0)
    .sort((a, b) => b.throughput - a.throughput)
    .slice(0, limit)
  const stale = all
    .filter((v) => v.lastQty > 0 && v.syncs >= 2 && v.idleDays >= staleDays)
    .sort((a, b) => b.lastQty * b.idleDays - a.lastQty * a.idleDays)
    .slice(0, limit)
  return { fast, stale }
}
