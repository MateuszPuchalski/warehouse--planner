import * as XLSX from 'xlsx'
import type { StockItem } from '../types'
import { parseLocationField } from './locationCode'

/** Raw cell grid from a spreadsheet/CSV file. */
export type Cell = string | number
export type Grid = Cell[][]

export interface ColumnMapping {
  symbol: number
  name: number
  quantity: number
  location: number
  unit: number | null
  /** Optional per-unit volume column; null when absent. */
  volume: number | null
  /** Optional per-unit weight column; null when absent. */
  weight: number | null
  /** Optional barcode/EAN column; null when absent. */
  ean: number | null
  /** Optional per-unit outer dimensions; all three must be present to be used. */
  length: number | null
  width: number | null
  height: number | null
}

/** Volume column unit → factor converting a cell value to m³. */
export type VolumeUnit = 'm3' | 'dm3' | 'cm3'
export const VOLUME_UNIT_FACTORS: Record<VolumeUnit, number> = { m3: 1, dm3: 1e-3, cm3: 1e-6 }

/** Weight column unit → factor converting a cell value to kg. */
export type WeightUnit = 'kg' | 'g'
export const WEIGHT_UNIT_FACTORS: Record<WeightUnit, number> = { kg: 1, g: 1e-3 }

/** Dimension column unit → factor converting a cell value to mm. */
export type DimUnit = 'mm' | 'cm' | 'm'
export const DIM_UNIT_FACTORS: Record<DimUnit, number> = { mm: 1, cm: 10, m: 1000 }

/** Units picked from the header text, so `weight_g` is not read as kilograms. */
export interface UnitGuess {
  volume?: VolumeUnit
  weight?: WeightUnit
  dims?: DimUnit
}

export interface ParsedFile {
  rows: Grid
  /** Best-effort mapping guessed from the header row; null when detection failed. */
  headerGuess: ColumnMapping | null
  /** Encoding used for CSV decoding ('utf-8' | 'windows-1250'); undefined for xlsx. */
  encoding?: string
}

// ---------- CSV ----------

function decodeCsv(buffer: ArrayBuffer): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' }
  } catch {
    // Subiekt GT exports are typically Windows-1250.
    return { text: new TextDecoder('windows-1250').decode(buffer), encoding: 'windows-1250' }
  }
}

function detectSeparator(line: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch]++
  }
  // ';' wins ties — the Polish Excel/Subiekt default.
  return ['\t', ',', ';'].reduce((best, sep) => (counts[sep] >= counts[best] ? sep : best), ';')
}

/** Minimal RFC-4180 parser: quoted fields, "" escapes, CRLF/LF rows. */
function parseCsvText(text: string, sep: string): Grid {
  const rows: Grid = []
  let row: Cell[] = []
  let field = ''
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.length > 1 || String(row[0]).trim() !== '') rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === sep) pushField()
    else if (ch === '\n') pushRow()
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

// ---------- Header detection ----------

function normalizeHeader(h: Cell): string {
  return String(h)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

const HEADER_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  symbol: ['symbol', 'indeks', 'kod'],
  name: ['nazwa', 'towar', 'name'],
  quantity: ['stan', 'ilosc', 'quantity', 'qty'],
  location: ['lokalizacja', 'lokacja', 'adres', 'location', 'pole'],
  unit: ['jm', 'jedn', 'unit'],
  volume: ['objetosc', 'kubatura', 'volume', 'cbm', 'm3'],
  weight: ['waga', 'masa', 'weight'],
  ean: ['ean', 'barcode', 'gtin', 'kodkreskowy'],
  length: ['dlugosc', 'length', 'dlug', 'dl'],
  width: ['szerokosc', 'width', 'szer'],
  height: ['wysokosc', 'height', 'wys'],
}

/**
 * Unit hidden in the header text, e.g. `weight_g`, `length_mm`, `objetosc [dm3]`.
 * Without this a `weight_g` column maps cleanly onto the weight field and is then read
 * with the kg default — every value off by a factor of a thousand, silently.
 */
function unitFromHeader(header: Cell | undefined): string | null {
  if (header === undefined) return null
  const m = /(?:_|\s|\[|\()([a-z]{1,3}\d?)\)?\]?\s*$/i.exec(String(header).trim())
  return m ? m[1].toLowerCase() : null
}

export function guessUnits(headerRow: Cell[], mapping: ColumnMapping): UnitGuess {
  const out: UnitGuess = {}
  const vol = mapping.volume !== null ? unitFromHeader(headerRow[mapping.volume]) : null
  if (vol === 'm3' || vol === 'dm3' || vol === 'cm3') out.volume = vol
  const wgt = mapping.weight !== null ? unitFromHeader(headerRow[mapping.weight]) : null
  if (wgt === 'kg' || wgt === 'g') out.weight = wgt
  // One unit for all three dimension columns: the first one that carries a hint wins,
  // since a file mixing mm and cm across length/width/height would be broken anyway.
  for (const col of [mapping.length, mapping.width, mapping.height]) {
    const d = col !== null ? unitFromHeader(headerRow[col]) : null
    if (d === 'mm' || d === 'cm' || d === 'm') {
      out.dims = d
      break
    }
  }
  return out
}

export function guessMapping(headerRow: Cell[]): ColumnMapping | null {
  const normalized = headerRow.map(normalizeHeader)
  const find = (keywords: string[]): number => {
    for (const kw of keywords) {
      const exact = normalized.findIndex((h) => h === kw)
      if (exact !== -1) return exact
      const partial = normalized.findIndex(
        // 'kod kreskowy' (barcode) must not match the symbol keyword 'kod'.
        (h) => h.startsWith(kw) && !h.includes('kresk'),
      )
      if (partial !== -1) return partial
    }
    return -1
  }
  const symbol = find(HEADER_KEYWORDS.symbol)
  const name = find(HEADER_KEYWORDS.name)
  const quantity = find(HEADER_KEYWORDS.quantity)
  const location = find(HEADER_KEYWORDS.location)
  const unit = find(HEADER_KEYWORDS.unit)
  const volume = find(HEADER_KEYWORDS.volume)
  const weight = find(HEADER_KEYWORDS.weight)
  const ean = find(HEADER_KEYWORDS.ean)
  const length = find(HEADER_KEYWORDS.length)
  const width = find(HEADER_KEYWORDS.width)
  const height = find(HEADER_KEYWORDS.height)
  if (symbol === -1 || quantity === -1 || location === -1) return null
  return {
    symbol,
    name: name === -1 ? symbol : name,
    quantity,
    location,
    unit: unit === -1 ? null : unit,
    volume: volume === -1 ? null : volume,
    weight: weight === -1 ? null : weight,
    ean: ean === -1 ? null : ean,
    length: length === -1 ? null : length,
    width: width === -1 ? null : width,
    height: height === -1 ? null : height,
  }
}

// ---------- File entry point ----------

export async function parseStockFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer()
  const isCsv = /\.(csv|txt)$/i.test(file.name)
  let rows: Grid
  let encoding: string | undefined
  if (isCsv) {
    const decoded = decodeCsv(buffer)
    encoding = decoded.encoding
    const firstLine = decoded.text.slice(0, decoded.text.indexOf('\n') + 1 || undefined)
    rows = parseCsvText(decoded.text.replace(/^﻿/, ''), detectSeparator(firstLine))
  } else {
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) throw new Error('Empty workbook')
    rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: '' })
  }
  rows = rows.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (rows.length === 0) throw new Error('No data rows')
  return { rows, headerGuess: guessMapping(rows[0]), encoding }
}

// ---------- Rows → stock items ----------

function toQuantity(cell: Cell): number {
  if (typeof cell === 'number') return cell
  const v = parseFloat(cell.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

export interface StockConversion {
  items: StockItem[]
  /** Rows with an empty location field (imported nowhere, reported in the summary). */
  noLocation: number
  /** Rows that produced a full set of measured dimensions. */
  withDims: number
  /** Rows that produced a per-unit weight. */
  withWeight: number
}

export function rowsToStockItems(
  rows: Grid,
  mapping: ColumnMapping,
  skipHeader: boolean,
  volumeUnit: VolumeUnit = 'm3',
  weightUnit: WeightUnit = 'kg',
  dimUnit: DimUnit = 'mm',
): StockConversion {
  const items: StockItem[] = []
  let noLocation = 0
  let withDims = 0
  let withWeight = 0
  const volumeFactor = VOLUME_UNIT_FACTORS[volumeUnit]
  const weightFactor = WEIGHT_UNIT_FACTORS[weightUnit]
  const dimFactor = DIM_UNIT_FACTORS[dimUnit]
  for (const row of skipHeader ? rows.slice(1) : rows) {
    const symbol = String(row[mapping.symbol] ?? '').trim()
    if (!symbol) continue
    const locationRaw = String(row[mapping.location] ?? '').trim()
    const { locations, other } = locationRaw
      ? parseLocationField(locationRaw)
      : { locations: [], other: [] }
    if (!locationRaw) noLocation++
    let unitVolumeM3: number | undefined
    if (mapping.volume !== null) {
      const v = toQuantity(row[mapping.volume] ?? 0) * volumeFactor
      if (v > 0) unitVolumeM3 = v
    }
    let unitWeightKg: number | undefined
    if (mapping.weight !== null) {
      const w = toQuantity(row[mapping.weight] ?? 0) * weightFactor
      if (w > 0) {
        unitWeightKg = w
        withWeight++
      }
    }
    // Dimensions only count as measured when all three are present — two out of three
    // describes nothing, and a partial row would produce a nonsense volume.
    let unitDimsMm: { l: number; w: number; h: number } | undefined
    if (mapping.length !== null && mapping.width !== null && mapping.height !== null) {
      const l = toQuantity(row[mapping.length] ?? 0) * dimFactor
      const w = toQuantity(row[mapping.width] ?? 0) * dimFactor
      const h = toQuantity(row[mapping.height] ?? 0) * dimFactor
      if (l > 0 && w > 0 && h > 0) {
        unitDimsMm = { l, w, h }
        withDims++
        // An explicit volume column stays authoritative; dimensions only fill the gap,
        // so a file carrying both never has its stated volume quietly overwritten.
        if (unitVolumeM3 === undefined) unitVolumeM3 = (l * w * h) / 1e9
      }
    }
    const ean = mapping.ean !== null ? String(row[mapping.ean] ?? '').trim() || undefined : undefined
    items.push({
      symbol,
      name: String(row[mapping.name] ?? '').trim(),
      quantity: toQuantity(row[mapping.quantity] ?? 0),
      unit: mapping.unit !== null ? String(row[mapping.unit] ?? '').trim() || undefined : undefined,
      unitVolumeM3,
      unitWeightKg,
      unitDimsMm,
      ean,
      locationRaw,
      locations,
      otherLocations: other,
    })
  }
  return { items, noLocation, withDims, withWeight }
}

/** One record as returned by the LAN bridge (`GET /api/stock`). */
export interface BridgeRecord {
  symbol: string
  name?: string
  quantity?: number | string
  unit?: string
  /** Raw location field, e.g. "A05-01-01 PALETA65" — parsed client-side. */
  locationRaw?: string
  ean?: string
  /** Per-unit volume in m³ (already normalized by the bridge). */
  unitVolumeM3?: number
  /** Per-unit weight in kg (already normalized by the bridge). */
  unitWeightKg?: number
  /** Per-unit outer dimensions in mm (already normalized by the bridge). */
  unitDimsMm?: { l: number; w: number; h: number }
}

/**
 * Map bridge JSON records to StockItem[], reusing the same location parser as the
 * file import so `A01-02-03` addressing has a single source of truth. Records
 * without a symbol are skipped.
 */
function validDims(d: BridgeRecord['unitDimsMm']): StockItem['unitDimsMm'] {
  if (!d || typeof d !== 'object') return undefined
  const { l, w, h } = d
  const ok = [l, w, h].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
  return ok ? { l, w, h } : undefined
}

export function objectsToStockItems(records: BridgeRecord[]): StockItem[] {
  const items: StockItem[] = []
  for (const r of records) {
    const symbol = String(r.symbol ?? '').trim()
    if (!symbol) continue
    const locationRaw = String(r.locationRaw ?? '').trim()
    const { locations, other } = locationRaw ? parseLocationField(locationRaw) : { locations: [], other: [] }
    items.push({
      symbol,
      name: String(r.name ?? '').trim(),
      quantity: toQuantity(r.quantity ?? 0),
      unit: r.unit ? String(r.unit).trim() || undefined : undefined,
      unitVolumeM3: typeof r.unitVolumeM3 === 'number' && r.unitVolumeM3 > 0 ? r.unitVolumeM3 : undefined,
      unitWeightKg: typeof r.unitWeightKg === 'number' && r.unitWeightKg > 0 ? r.unitWeightKg : undefined,
      unitDimsMm: validDims(r.unitDimsMm),
      ean: r.ean ? String(r.ean).trim() || undefined : undefined,
      locationRaw,
      locations,
      otherLocations: other,
    })
  }
  return items
}
