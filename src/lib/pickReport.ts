import type { AbcClass, ConfusionRisk, PickGroup, PickReport, PickStat } from '../types'
import type { Cell, Grid } from './stockFile'

/**
 * Reader for the Subiekt GT picking-frequency exports that drive re-slotting:
 *
 * - **by symbol** (`top_produkty_symbol_<from>_<to>.csv`) — one row per catalogue symbol
 *   with its pick lines, orders, units, ABC class, monthly split and twin/confusion flags.
 * - **by name** (`top_produkty_nazwa_<from>_<to>.csv`) — the same demand summed per product
 *   NAME, carrying the list of symbols it was entered under.
 *
 * Both are read into one `PickReport`: the symbol rows are the demand the slotting math
 * runs on, the name rows are what turns "this product has twins" into "these two symbols
 * are the same goods, and they sit in different racks".
 *
 * The exports are not the stock export — they carry no location and no quantity on hand —
 * so this file never produces `StockItem`s. Demand is joined to addresses by symbol at
 * analysis time (`slotting.ts`).
 */

export type PickReportKind = 'symbol' | 'name'

/** Normalized header → column index, for headers written any which way. */
function normalizeHeader(h: Cell): string {
  return String(h)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

function headerIndex(headerRow: Cell[]): Map<string, number> {
  const out = new Map<string, number>()
  headerRow.forEach((h, i) => {
    const key = normalizeHeader(h)
    // First column wins: a duplicated header name is a broken export, not a choice.
    if (key && !out.has(key)) out.set(key, i)
  })
  return out
}

/** Polish exports write decimals with a comma and thousands with a space. */
function toNumber(cell: Cell | undefined): number {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : 0
  if (cell === undefined) return 0
  const v = parseFloat(String(cell).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

function toText(cell: Cell | undefined): string {
  return cell === undefined ? '' : String(cell).trim()
}

function toAbc(cell: Cell | undefined): AbcClass {
  const v = toText(cell).toUpperCase()
  return v === 'A' || v === 'B' ? v : 'C'
}

/** "WYSOKIE" / "sredni" / "-" as exported; anything else reads as no risk. */
function toConfusion(cell: Cell | undefined): ConfusionRisk {
  const v = normalizeHeader(toText(cell))
  if (v.startsWith('wysok')) return 'high'
  if (v.startsWith('sredni')) return 'medium'
  return 'none'
}

/** ISO date if the cell holds one, else undefined — the exports write `2026-03-02`. */
function toIsoDate(cell: Cell | undefined): string | undefined {
  const v = toText(cell)
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined
}

/**
 * Monthly columns are named by the Roman month number of the period (`Linie_III` …
 * `Linie_VII`), so they are collected by scanning the header rather than by a fixed list —
 * a report over a different range carries different month names.
 */
const ROMAN_MONTHS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']

function monthlyColumns(index: Map<string, number>): number[] {
  const cols: number[] = []
  for (const roman of ROMAN_MONTHS) {
    const col = index.get(`linie${roman}`)
    if (col !== undefined) cols.push(col)
  }
  return cols
}

/** Which of the two exports this grid is, or null when it is neither. */
export function detectReportKind(headerRow: Cell[]): PickReportKind | null {
  const index = headerIndex(headerRow)
  if (!index.has('liniepobrania')) return null
  if (index.has('nazwaproduktu') && index.has('symbolezliczbalinii')) return 'name'
  if (index.has('symbol')) return 'symbol'
  return null
}

/** `"W09-0414(3818), M90650(2)"` → the symbols with their pick lines. */
export function parseSymbolList(raw: string): { symbol: string; lines: number }[] {
  const out: { symbol: string; lines: number }[] = []
  for (const token of raw.split(',')) {
    const m = /^\s*(.+?)\s*\((\d+)\)\s*$/.exec(token)
    if (m) out.push({ symbol: m[1].trim(), lines: Number(m[2]) })
    else if (token.trim()) out.push({ symbol: token.trim(), lines: 0 })
  }
  return out
}

export interface ParsedPickReport {
  kind: PickReportKind
  stats: PickStat[]
  groups: PickGroup[]
  from: string | null
  to: string | null
  totalLines: number
}

/** Rows of the by-symbol export → per-symbol demand. */
function parseSymbolRows(rows: Grid, index: Map<string, number>): PickStat[] {
  const col = (name: string): number | undefined => index.get(name)
  const symbolCol = col('symbol')
  const linesCol = col('liniepobrania')
  if (symbolCol === undefined || linesCol === undefined) return []
  const months = monthlyColumns(index)
  const out: PickStat[] = []

  for (const row of rows) {
    const symbol = toText(row[symbolCol])
    if (!symbol) continue
    const at = (name: string): Cell | undefined => {
      const c = col(name)
      return c === undefined ? undefined : row[c]
    }
    out.push({
      symbol,
      name: toText(at('nazwa')),
      ean: toText(at('ean')) || undefined,
      supplier: toText(at('dostawca')) || undefined,
      unit: toText(at('jm')) || undefined,
      lines: toNumber(row[linesCol]),
      orders: toNumber(at('zamowienia')),
      units: toNumber(at('sztuki')),
      sharePct: toNumber(at('udzial')),
      cumulativePct: toNumber(at('skumulowany')),
      abc: toAbc(at('klasaabc')),
      daysWithMovement: toNumber(at('dnizruchem')),
      activeMonths: toNumber(at('miesiecyaktywnych')),
      firstPick: toIsoDate(at('pierwszepobranie')),
      lastPick: toIsoDate(at('ostatniepobranie')),
      monthlyLines: months.map((m) => toNumber(row[m])),
      twins: toNumber(at('blizniakowwkartotece')),
      twinsRotating: toNumber(at('blizniakowrotujacych')),
      confusion: toConfusion(at('ryzykopomylki')),
    })
  }
  return out
}

/** Rows of the by-name export → per-product-name demand with its symbol split. */
function parseNameRows(rows: Grid, index: Map<string, number>): PickGroup[] {
  const nameCol = index.get('nazwaproduktu')
  const linesCol = index.get('liniepobrania')
  const symbolsCol = index.get('symbolezliczbalinii')
  if (nameCol === undefined || linesCol === undefined || symbolsCol === undefined) return []
  const out: PickGroup[] = []

  for (const row of rows) {
    const name = toText(row[nameCol])
    if (!name) continue
    const at = (key: string): Cell | undefined => {
      const c = index.get(key)
      return c === undefined ? undefined : row[c]
    }
    out.push({
      name,
      lines: toNumber(row[linesCol]),
      units: toNumber(at('sztuki')),
      abc: toAbc(at('klasaabc')),
      symbols: parseSymbolList(toText(row[symbolsCol])),
      rotatingSymbols: toNumber(at('symbolirotujacych')),
      catalogSymbols: toNumber(at('symboliwkartotece')),
    })
  }
  return out
}

/**
 * Parse either export from its raw grid. The header row is required — these files are
 * machine-written and always carry one, and guessing columns positionally would silently
 * mis-read a report the day the export gains a column.
 */
export function parsePickReport(rows: Grid): ParsedPickReport {
  if (rows.length < 2) throw new Error('Report has no data rows')
  const index = headerIndex(rows[0])
  const kind = detectReportKind(rows[0])
  if (!kind) throw new Error('Not a picking-frequency export (no "Linie_pobrania" column)')

  const body = rows.slice(1)
  const stats = kind === 'symbol' ? parseSymbolRows(body, index) : []
  const groups = kind === 'name' ? parseNameRows(body, index) : []

  // The period comes from the rows themselves, so a renamed file still dates correctly.
  let from: string | null = null
  let to: string | null = null
  for (const s of stats) {
    if (s.firstPick && (from === null || s.firstPick < from)) from = s.firstPick
    if (s.lastPick && (to === null || s.lastPick > to)) to = s.lastPick
  }

  const totalLines =
    kind === 'symbol'
      ? stats.reduce((sum, s) => sum + s.lines, 0)
      : groups.reduce((sum, g) => sum + g.lines, 0)

  return { kind, stats, groups, from, to, totalLines }
}

/** Hard cap so one oversized export cannot fill the localStorage budget. */
const STAT_LIMIT = 6000
const GROUP_LIMIT = 6000

/**
 * Fold a freshly parsed export into the stored report. The two exports describe the same
 * period from different angles, so loading one keeps the other: dropping the symbol rows
 * when the name file arrives would silently disable the whole slotting analysis.
 */
export function mergeReport(
  previous: PickReport | null,
  parsed: ParsedPickReport,
  fileName: string,
  now: number,
): PickReport {
  const stats: Record<string, PickStat> =
    parsed.kind === 'symbol'
      ? Object.fromEntries(
          [...parsed.stats]
            .sort((a, b) => b.lines - a.lines)
            .slice(0, STAT_LIMIT)
            .map((s) => [s.symbol, s]),
        )
      : (previous?.stats ?? {})
  const groups =
    parsed.kind === 'name'
      ? [...parsed.groups].sort((a, b) => b.lines - a.lines).slice(0, GROUP_LIMIT)
      : (previous?.groups ?? [])

  // Total lines always come from the symbol export when there is one: the name export
  // counts the same lines grouped differently, and mixing the two would double-count.
  const statTotal = Object.values(stats).reduce((sum, s) => sum + s.lines, 0)
  const groupTotal = groups.reduce((sum, g) => sum + g.lines, 0)

  const fileNames = [...(previous?.fileNames ?? []).filter((f) => f !== fileName), fileName]

  return {
    importedAt: new Date(now).toISOString(),
    fileNames,
    from: parsed.from ?? previous?.from ?? null,
    to: parsed.to ?? previous?.to ?? null,
    totalLines: statTotal || groupTotal,
    stats,
    groups,
  }
}

/** Sum of pick lines by ABC class across the report. */
export function linesByClass(report: PickReport): Record<AbcClass, number> {
  const out: Record<AbcClass, number> = { A: 0, B: 0, C: 0 }
  for (const s of Object.values(report.stats)) out[s.abc] += s.lines
  return out
}

/** Number of products per ABC class. */
export function countByClass(report: PickReport): Record<AbcClass, number> {
  const out: Record<AbcClass, number> = { A: 0, B: 0, C: 0 }
  for (const s of Object.values(report.stats)) out[s.abc] += 1
  return out
}

/** Length of the reported period in days, floored at one (used for per-day rates). */
export function reportDays(report: PickReport): number {
  if (!report.from || !report.to) return 1
  const days = (Date.parse(report.to) - Date.parse(report.from)) / 86_400_000
  return Number.isFinite(days) && days >= 1 ? days : 1
}
