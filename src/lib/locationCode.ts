import type { ParsedLocation } from '../types'

/**
 * Subiekt location code: `<Line><RackNo>-<Level>-<Bay>`, e.g. "A01-02-03" =
 * line A, rack 01, shelf (półka) 02, column (kolumna) 03. All parts 1-based.
 * The middle part is the LEVEL and the last part is the BAY — the app's slot
 * keys are `bay:level`, so the order swap is confined to this module.
 */
const LOC_RE = /^([A-Z])(\d{1,3})-(\d{1,3})-(\d{1,3})$/

export function normalizeRackCode(line: string, rackNo: number): string {
  return `${line.toUpperCase()}${String(rackNo).padStart(2, '0')}`
}

/** Normalize a hand-typed rack code ("a1" → "A01"); returns '' when not code-shaped. */
export function normalizeUserRackCode(raw: string): string {
  const m = /^([A-Z])(\d{1,3})$/.exec(raw.trim().toUpperCase())
  if (!m) return raw.trim().toUpperCase()
  return normalizeRackCode(m[1], Number(m[2]))
}

export function parseLocationCode(token: string): ParsedLocation | null {
  const m = LOC_RE.exec(token.trim().toUpperCase())
  if (!m) return null
  const [, line, rackNo, levelStr, bayStr] = m
  const level = Number(levelStr) - 1
  const bay = Number(bayStr) - 1
  if (level < 0 || bay < 0) return null
  return { rackCode: normalizeRackCode(line, Number(rackNo)), bay, level }
}

/**
 * A real Subiekt location field can hold several codes plus pallet/box tokens:
 * "A05-01-01 paleta64 PALETA65 D02-04-06". Extract every rack-code address and
 * keep the leftover tokens so nothing is silently dropped.
 */
export function parseLocationField(raw: string): {
  locations: ParsedLocation[]
  other: string[]
} {
  const locations: ParsedLocation[] = []
  const other: string[] = []
  for (const token of raw.toUpperCase().split(/[\s,;]+/)) {
    if (!token) continue
    const loc = parseLocationCode(token)
    if (loc) locations.push(loc)
    else other.push(token)
  }
  return { locations, other }
}

/** Line letter of a rack code ("A01" → "A"). */
export function lineOf(rackCode: string): string {
  return rackCode.charAt(0)
}
