import type {
  AbcClass,
  CarrierKind,
  ConfusionRisk,
  PickReport,
  PickStat,
  SlotKey,
  StockItem,
  WarehouseLayout,
} from '../types'
import type { StockIndex } from '../store/useStockStore'
import { allSlots, getLevelOffsets, slotKey } from './rackGeometry'
import { carrierKind } from './loadProxy'
import { pickRoute } from './pickPath'
import { distanceAt, walkDistanceField, walkGrid } from './pickWalk'
import { zoneRectM } from './zones'

/**
 * Re-slotting: given measured picking demand (`PickReport`) and where the goods actually
 * are (`StockIndex`), work out which products sit in the wrong place and what to swap.
 *
 * The model is one number per slot — its **cost in walking-equivalent meters** — and one
 * number per product — its **pick lines**. Effort is `lines × cost`, so the plan that
 * minimizes total effort pairs the most-picked goods with the cheapest slots. That pairing
 * (demand rank i → cost rank i) is optimal when every product fits everywhere; the fit
 * filters below make it a greedy approximation, which is why the panel presents it as a
 * proposal rather than applying it.
 *
 * Nothing here mutates the layout or the stock: the ERP owns addresses, so the output is
 * a ranked list of moves for someone to carry out and enter in Subiekt.
 */

// ---------- Slot cost ----------

/**
 * Ergonomic surcharge for reaching a slot, expressed in the same unit as travel so the two
 * add up. The numbers are a deliberately coarse ladder, not measurements: the golden zone
 * (roughly hip to shoulder) is free, bending or stretching costs a few meters of walking,
 * and anything needing a step-ladder or a forklift costs enough to keep fast movers out
 * of it entirely.
 */
export function levelPenaltyM(centreHeightM: number): number {
  if (centreHeightM < 0.4) return 8
  if (centreHeightM < 0.75) return 3
  if (centreHeightM <= 1.5) return 0
  if (centreHeightM <= 1.8) return 4
  return 30
}

export interface SlotCost {
  rackId: string
  rackCode: string
  slotKey: SlotKey
  label: string
  bay: number
  level: number
  /** Height of the slot's middle above the floor, in meters. */
  heightM: number
  /** Walking meters from the origin to the rack's picking face. */
  travelM: number
  levelPenaltyM: number
  /** travelM + levelPenaltyM — one comparable number per slot. */
  costM: number
  carrier: CarrierKind
  maxVolumeM3: number
  blocked: boolean
}

export interface SlottingOrigin {
  x: number
  z: number
  /** Where the origin came from, so the UI can say what distances are measured from. */
  kind: 'dock' | 'staging' | 'packing' | 'route' | 'floor'
  label?: string
}

/**
 * Where a picking trip starts and ends. A dock zone is the honest answer; failing that a
 * staging or packing area, then the first stop of the pick route, then the middle of the
 * floor — every fallback still produces a consistent ranking, only a less meaningful one.
 */
export function slottingOrigin(layout: WarehouseLayout): SlottingOrigin {
  const cell = layout.floor.cellSize
  for (const kind of ['dock', 'staging', 'packing'] as const) {
    const zone = Object.values(layout.zones ?? {}).find((z) => z.kind === kind)
    if (zone) {
      const { cx, cz } = zoneRectM(zone, cell)
      return { x: cx, z: cz, kind, label: zone.label }
    }
  }
  const first = pickRoute(layout)[0]
  if (first) return { x: first.x, z: first.z, kind: 'route', label: first.code }
  return { x: 0, z: 0, kind: 'floor' }
}

/**
 * Cost of every slot in every addressable rack. Racks without an ERP code are skipped:
 * stock is addressed by code, so a slot in an uncoded rack cannot take part in a plan.
 */
export function slotCosts(layout: WarehouseLayout, origin: SlottingOrigin): SlotCost[] {
  const grid = walkGrid(layout)
  const field = walkDistanceField(layout, origin.x, origin.z)
  const out: SlotCost[] = []

  for (const stop of pickRoute(layout)) {
    const rack = layout.racks[stop.rackId]
    const template = rack ? layout.templates[rack.templateId] : undefined
    if (!rack || !template) continue
    // Straight-line distance is the fallback when the hall is too large to rasterize or
    // the rack face is walled off — a worse estimate, never a missing one.
    const walked = field ? distanceAt(grid, field, stop.x, stop.z) : null
    const travelM = walked ?? Math.hypot(stop.x - origin.x, stop.z - origin.z)
    const offsets = getLevelOffsets(template)
    const carrier = carrierKind(template)

    for (const slot of allSlots(template, rack)) {
      const heightM = (offsets[slot.level] + offsets[slot.level + 1]) / 2
      const penalty = levelPenaltyM(heightM)
      out.push({
        rackId: rack.id,
        rackCode: stop.code,
        slotKey: slot.key,
        label: slot.label,
        bay: slot.bay,
        level: slot.level,
        heightM,
        travelM,
        levelPenaltyM: penalty,
        costM: travelM + penalty,
        carrier,
        maxVolumeM3: slot.maxVolumeM3,
        blocked: slot.status === 'blocked',
      })
    }
  }
  return out
}

// ---------- The plan ----------

/** One product sitting at one address, with the share of demand that address carries. */
interface Placement {
  symbol: string
  name: string
  abc: AbcClass
  /** Pick lines attributed to this address (a product's lines split across its addresses). */
  lines: number
  /** Volume this address holds, m³; 0 when the product has no measured volume. */
  volumeM3: number
  carrier: CarrierKind
  at: SlotCost
}

export type MoveKind = 'move' | 'swap'

export interface SlottingMove {
  symbol: string
  name: string
  abc: AbcClass
  lines: number
  kind: MoveKind
  from: { rackId: string; rackCode: string; slotKey: SlotKey; label: string; costM: number }
  to: { rackId: string; rackCode: string; slotKey: SlotKey; label: string; costM: number }
  /** Walking meters saved over the reported period: lines × (cost before − cost after). */
  savedM: number
  /** Products currently at the target address, which this move displaces. */
  displaces: { symbol: string; lines: number }[]
}

export interface ConsolidationFinding {
  name: string
  lines: number
  abc: AbcClass
  symbols: { symbol: string; lines: number; addresses: string[] }[]
  /** Distinct racks the twins are spread over; > 1 means two walks for one product. */
  distinctRacks: number
  confusion: ConfusionRisk
  /** True when at least two twins are located and they are not in the same rack. */
  split: boolean
}

export interface ClassPlacement {
  abc: AbcClass
  /** Pick lines of this class that are located in the layout. */
  lines: number
  /** …of which sit in the cheapest third of the pick-relevant slots. */
  goldenLines: number
  /** Average slot cost weighted by pick lines, in meters. */
  avgCostM: number
}

export interface SlottingAnalysis {
  origin: SlottingOrigin
  /** Cost below which a slot counts as "golden" (the cheapest third). */
  goldenThresholdM: number
  /** Pick lines whose symbol was found at an address in this layout. */
  locatedLines: number
  /** Pick lines whose symbol is in the report but nowhere in the layout. */
  unlocatedLines: number
  /** Products in the report that were matched to an address. */
  locatedSkus: number
  reportSkus: number
  /** Total effort now and under the plan, in walking meters over the reported period. */
  currentEffortM: number
  plannedEffortM: number
  savedM: number
  savedPct: number
  moves: SlottingMove[]
  byClass: ClassPlacement[]
  consolidation: ConsolidationFinding[]
}

/** A slot is "empty" for planning when no stock is indexed at it. */
function occupantsOf(stockIndex: StockIndex, code: string, key: SlotKey): StockItem[] {
  return stockIndex[code]?.[key] ?? []
}

/** Volume one address of a product holds, m³ — quantity split across its addresses. */
function addressVolume(item: StockItem): number {
  if (!item.unitVolumeM3) return 0
  return (item.quantity / Math.max(1, item.locations.length)) * item.unitVolumeM3
}

/** A slot can take a placement when the carrier matches and the volume fits, where known. */
function fits(p: Placement, slot: SlotCost): boolean {
  if (slot.blocked) return false
  // Carrier equality keeps a pallet SKU out of a bin: nothing in the demand report says
  // what a product travels on, so its current carrier is the only evidence available.
  if (slot.carrier !== p.carrier) return false
  if (p.volumeM3 > 0 && slot.maxVolumeM3 > 0 && slot.maxVolumeM3 < p.volumeM3) return false
  return true
}

const MIN_SAVING_M = 1

/**
 * Build the re-slotting plan.
 *
 * Candidate slots are the ones the participating products already occupy plus the empty
 * ones; a slot holding goods that are NOT part of the plan is left alone, because emptying
 * it is not something this analysis can promise. Products are then placed cheapest-slot
 * first in descending demand order, and every product whose assigned address differs from
 * its current one becomes a move.
 */
export function analyzeSlotting(
  layout: WarehouseLayout,
  items: StockItem[],
  stockIndex: StockIndex,
  report: PickReport,
  opts?: { moveLimit?: number; consolidationLimit?: number },
): SlottingAnalysis {
  const origin = slottingOrigin(layout)
  const costs = slotCosts(layout, origin)
  const byAddress = new Map<string, SlotCost>()
  for (const c of costs) byAddress.set(`${c.rackCode}:${c.slotKey}`, c)

  // ---- demand joined to addresses ----
  const stockBySymbol = new Map<string, StockItem>()
  for (const item of items) {
    const prev = stockBySymbol.get(item.symbol)
    // Defensive against a duplicated symbol row: keep the one that is actually located.
    if (!prev || (prev.locations.length === 0 && item.locations.length > 0)) {
      stockBySymbol.set(item.symbol, item)
    }
  }

  const placements: Placement[] = []
  let locatedLines = 0
  let unlocatedLines = 0
  let locatedSkus = 0

  for (const stat of Object.values(report.stats)) {
    const item = stockBySymbol.get(stat.symbol)
    const addresses = (item?.locations ?? [])
      .map((loc) => byAddress.get(`${loc.rackCode}:${slotKey(loc.bay, loc.level)}`))
      .filter((c): c is SlotCost => c !== undefined)
    if (!item || addresses.length === 0) {
      unlocatedLines += stat.lines
      continue
    }
    locatedSkus += 1
    locatedLines += stat.lines
    const perAddress = stat.lines / addresses.length
    const volume = addressVolume(item)
    for (const at of addresses) {
      placements.push({
        symbol: stat.symbol,
        name: stat.name || item.name,
        abc: stat.abc,
        lines: perAddress,
        volumeM3: volume,
        carrier: at.carrier,
        at,
      })
    }
  }

  placements.sort((a, b) => b.lines - a.lines)

  // ---- candidate slots ----
  const participants = new Set(placements.map((p) => p.symbol))
  const held = new Set(placements.map((p) => `${p.at.rackCode}:${p.at.slotKey}`))
  const candidates = costs
    .filter((c) => {
      if (c.blocked) return false
      if (held.has(`${c.rackCode}:${c.slotKey}`)) return true
      // Empty (vacuously true), or holding only goods that are themselves being re-slotted.
      return occupantsOf(stockIndex, c.rackCode, c.slotKey).every((i) => participants.has(i.symbol))
    })
    .sort((a, b) => a.costM - b.costM)

  // ---- greedy assignment ----
  const taken = new Set<string>()
  const moves: SlottingMove[] = []
  let currentEffortM = 0
  let plannedEffortM = 0
  // Everything before the cursor is spoken for, so each product scans only the slots that
  // are still open rather than the whole list from the top.
  let cursor = 0

  for (const p of placements) {
    currentEffortM += p.lines * p.at.costM
    while (cursor < candidates.length && taken.has(`${candidates[cursor].rackCode}:${candidates[cursor].slotKey}`)) {
      cursor++
    }
    let best: SlotCost | null = null
    for (let i = cursor; i < candidates.length; i++) {
      const slot = candidates[i]
      if (taken.has(`${slot.rackCode}:${slot.slotKey}`)) continue
      if (!fits(p, slot)) continue
      best = slot
      break
    }
    // Nothing free that fits: the product stays where it is, and its slot stays taken.
    const target = best ?? p.at
    taken.add(`${target.rackCode}:${target.slotKey}`)
    plannedEffortM += p.lines * target.costM

    const savedM = p.lines * (p.at.costM - target.costM)
    if (target === p.at || savedM < MIN_SAVING_M) continue
    const sitting = occupantsOf(stockIndex, target.rackCode, target.slotKey).filter(
      (i) => i.symbol !== p.symbol,
    )
    moves.push({
      symbol: p.symbol,
      name: p.name,
      abc: p.abc,
      lines: p.lines,
      kind: sitting.length > 0 ? 'swap' : 'move',
      from: {
        rackId: p.at.rackId,
        rackCode: p.at.rackCode,
        slotKey: p.at.slotKey,
        label: p.at.label,
        costM: p.at.costM,
      },
      to: {
        rackId: target.rackId,
        rackCode: target.rackCode,
        slotKey: target.slotKey,
        label: target.label,
        costM: target.costM,
      },
      savedM,
      displaces: sitting.map((i) => ({
        symbol: i.symbol,
        lines: report.stats[i.symbol]?.lines ?? 0,
      })),
    })
  }

  moves.sort((a, b) => b.savedM - a.savedM)

  // ---- how well each class is placed today ----
  const ranked = candidates.map((c) => c.costM).sort((a, b) => a - b)
  const goldenThresholdM = ranked.length > 0 ? ranked[Math.floor((ranked.length - 1) / 3)] : 0
  const byClass: ClassPlacement[] = (['A', 'B', 'C'] as AbcClass[]).map((abc) => {
    let lines = 0
    let goldenLines = 0
    let weighted = 0
    for (const p of placements) {
      if (p.abc !== abc) continue
      lines += p.lines
      weighted += p.lines * p.at.costM
      if (p.at.costM <= goldenThresholdM) goldenLines += p.lines
    }
    return { abc, lines, goldenLines, avgCostM: lines > 0 ? weighted / lines : 0 }
  })

  const savedM = currentEffortM - plannedEffortM
  return {
    origin,
    goldenThresholdM,
    locatedLines,
    unlocatedLines,
    locatedSkus,
    reportSkus: Object.keys(report.stats).length,
    currentEffortM,
    plannedEffortM,
    savedM,
    savedPct: currentEffortM > 0 ? savedM / currentEffortM : 0,
    moves: moves.slice(0, opts?.moveLimit ?? 50),
    byClass,
    consolidation: findConsolidations(
      report,
      stockBySymbol,
      opts?.consolidationLimit ?? 25,
    ),
  }
}

/** Highest confusion risk among a set of symbols. */
function worstConfusion(stats: (PickStat | undefined)[]): ConfusionRisk {
  if (stats.some((s) => s?.confusion === 'high')) return 'high'
  if (stats.some((s) => s?.confusion === 'medium')) return 'medium'
  return 'none'
}

/**
 * Products entered in the catalogue under several symbols, from the by-name export. Two
 * symbols for one product mean two addresses, two pick faces and two chances to grab the
 * wrong one — the report's own confusion flag says how alike they look. Ranked by the
 * lines at stake, worst first, with the split ones first among equals.
 */
export function findConsolidations(
  report: PickReport,
  stockBySymbol: Map<string, StockItem>,
  limit: number,
): ConsolidationFinding[] {
  const out: ConsolidationFinding[] = []

  for (const group of report.groups) {
    const rotating = group.symbols.filter((s) => s.lines > 0)
    if (rotating.length < 2) continue
    const racks = new Set<string>()
    const symbols = rotating.map((s) => {
      const item = stockBySymbol.get(s.symbol)
      const addresses = (item?.locations ?? []).map((l) => `${l.rackCode}-${l.bay + 1}-${l.level + 1}`)
      for (const loc of item?.locations ?? []) racks.add(loc.rackCode)
      return { symbol: s.symbol, lines: s.lines, addresses }
    })
    const located = symbols.filter((s) => s.addresses.length > 0).length
    out.push({
      name: group.name,
      lines: group.lines,
      abc: group.abc,
      symbols,
      distinctRacks: racks.size,
      confusion: worstConfusion(rotating.map((s) => report.stats[s.symbol])),
      split: located >= 2 && racks.size > 1,
    })
  }

  out.sort((a, b) => Number(b.split) - Number(a.split) || b.lines - a.lines)
  return out.slice(0, limit)
}

// ---------- Export ----------

/** `;`-separated so Polish Excel opens it in columns without an import wizard. */
function csvRow(cells: (string | number)[]): string {
  return cells
    .map((c) => {
      const s = String(c)
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(';')
}

/** The move list as a CSV the warehouse can work from (and paste back into the ERP). */
export function movesToCsv(moves: SlottingMove[]): string {
  const head = [
    'Symbol',
    'Nazwa',
    'Klasa',
    'Linie',
    'Z_lokalizacji',
    'Do_lokalizacji',
    'Typ',
    'Zysk_m',
    'Wypiera',
  ]
  const rows = moves.map((m) =>
    csvRow([
      m.symbol,
      m.name,
      m.abc,
      Math.round(m.lines),
      `${m.from.rackCode} ${m.from.label}`,
      `${m.to.rackCode} ${m.to.label}`,
      m.kind === 'swap' ? 'zamiana' : 'przeniesienie',
      Math.round(m.savedM),
      m.displaces.map((d) => d.symbol).join(' '),
    ]),
  )
  return [csvRow(head), ...rows].join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // A BOM so Excel reads the Polish characters as UTF-8 rather than as its ANSI codepage.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
