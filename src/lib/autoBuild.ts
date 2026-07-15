import type { RackInstance, RackTemplate, StockItem, WarehouseLayout } from '../types'
import { lineOf } from './locationCode'
import { getFootprint, aabbFor } from './rackGeometry'
import { isPlacementValid } from './collision'

/**
 * Infers the physical warehouse structure from Subiekt location codes:
 * distinct line letters = rows of racks, distinct rack numbers per line =
 * racks in that row, and each rack's bays/levels = the highest column/shelf
 * referenced in its codes.
 */

export interface AutoBuildPlan {
  templates: RackTemplate[]
  racks: Omit<RackInstance, 'id'>[]
  rackUpgrades: { rackId: string; templateId: string }[]
  floorPatch?: { widthM: number; depthM: number }
  stats: {
    rackCodes: number
    created: number
    upgraded: number
    existingMatched: number
    unplaced: string[]
    outOfRange: number
    duplicateCodes: string[]
  }
}

interface RackNeed {
  code: string
  bays: number
  levels: number
}

/** Physical member dimensions copied from the standard seed template. */
const AUTO_DIMS = {
  bayWidth: 2.7,
  levelHeight: 1.5,
  depth: 1.1,
  uprightSize: 0.09,
  beamHeight: 0.12,
  maxWeightKg: 1000,
}

export function autoTemplateId(bays: number, levels: number): string {
  return `tpl-auto-${bays}x${levels}`
}

function makeAutoTemplate(bays: number, levels: number): RackTemplate {
  return {
    id: autoTemplateId(bays, levels),
    name: `Auto ${bays}×${levels}`,
    bays,
    levels,
    bayWidth: AUTO_DIMS.bayWidth,
    levelHeight: AUTO_DIMS.levelHeight,
    depth: AUTO_DIMS.depth,
    uprightSize: AUTO_DIMS.uprightSize,
    beamHeight: AUTO_DIMS.beamHeight,
    defaultSlot: { maxWeightKg: AUTO_DIMS.maxWeightKg },
  }
}

/** Required bays/levels per rack code, from the highest address seen in the data. */
export function inferRackNeeds(items: StockItem[]): Map<string, RackNeed> {
  const needs = new Map<string, RackNeed>()
  for (const item of items) {
    for (const loc of item.locations) {
      const need = needs.get(loc.rackCode) ?? { code: loc.rackCode, bays: 0, levels: 0 }
      need.bays = Math.max(need.bays, loc.bay + 1)
      need.levels = Math.max(need.levels, loc.level + 1)
      needs.set(loc.rackCode, need)
    }
  }
  return needs
}

export function buildPlan(items: StockItem[], layout: WarehouseLayout): AutoBuildPlan {
  const needs = inferRackNeeds(items)

  // Existing racks by code; duplicated codes are allowed but reported.
  const existingByCode = new Map<string, RackInstance>()
  const duplicateCodes: string[] = []
  for (const rack of Object.values(layout.racks)) {
    if (!rack.code) continue
    if (existingByCode.has(rack.code)) duplicateCodes.push(rack.code)
    else existingByCode.set(rack.code, rack)
  }

  const templates = new Map<string, RackTemplate>()
  const ensureTemplate = (bays: number, levels: number): string => {
    const id = autoTemplateId(bays, levels)
    if (!layout.templates[id] && !templates.has(id)) templates.set(id, makeAutoTemplate(bays, levels))
    return id
  }

  const rackUpgrades: { rackId: string; templateId: string }[] = []
  const missing: RackNeed[] = []
  let existingMatched = 0
  let outOfRange = 0

  for (const need of needs.values()) {
    const existing = existingByCode.get(need.code)
    if (!existing) {
      missing.push(need)
      continue
    }
    existingMatched++
    const tpl = layout.templates[existing.templateId]
    if (!tpl) continue
    if (tpl.bays >= need.bays && tpl.levels >= need.levels) continue
    if (existing.templateId.startsWith('tpl-auto-')) {
      // Grow auto-built racks in place; never shrink, so overrides survive.
      const bays = Math.max(tpl.bays, need.bays)
      const levels = Math.max(tpl.levels, need.levels)
      rackUpgrades.push({ rackId: existing.id, templateId: ensureTemplate(bays, levels) })
    } else {
      // Never resize manually built racks; count their out-of-range addresses.
      outOfRange++
    }
  }

  // ---- Placement: each line is a row along X; a new letter starts a new row. ----
  // All cursor math is done in grid cells so within-row gaps come out at exactly
  // one cell (≤ flue tolerance) and row-to-row gaps at ≥ the minimum aisle width —
  // arbitrary meter-space rounding would produce false aisle warnings.
  const cell = layout.floor.cellSize
  const minAisleCells = Math.ceil(layout.floor.minAisleWidthM / cell)
  /** Long lines wrap onto extra rows so the floor stays a workable size. */
  const MAX_ROW_WIDTH_M = 100

  const byLine = new Map<string, RackNeed[]>()
  for (const need of missing) {
    const line = lineOf(need.code)
    ;(byLine.get(line) ?? byLine.set(line, []).get(line)!).push(need)
  }
  const lines = [...byLine.keys()].sort()
  for (const line of lines) {
    byLine.get(line)!.sort((a, b) => a.code.localeCompare(b.code))
  }

  const footprintOf = (need: RackNeed) => {
    const id = autoTemplateId(need.bays, need.levels)
    const tpl = layout.templates[id] ?? templates.get(id) ?? makeAutoTemplate(need.bays, need.levels)
    return { tpl, ...getFootprint(tpl, 0) }
  }

  // Split each line into row chunks no wider than MAX_ROW_WIDTH_M.
  const rows: RackNeed[][] = []
  for (const line of lines) {
    let current: RackNeed[] = []
    let width = 0
    for (const need of byLine.get(line)!) {
      const { w } = footprintOf(need)
      if (current.length > 0 && width + w > MAX_ROW_WIDTH_M) {
        rows.push(current)
        current = []
        width = 0
      }
      current.push(need)
      width += w + cell
    }
    if (current.length > 0) rows.push(current)
  }

  // Start below everything already placed (edge position in cells).
  let edgeZCells = -layout.floor.depthM / 2 / cell + 2
  for (const rack of Object.values(layout.racks)) {
    const tpl = layout.templates[rack.templateId]
    if (!tpl) continue
    edgeZCells = Math.max(
      edgeZCells,
      aabbFor(rack.gridX, rack.gridZ, rack.rotation, tpl, cell).maxZ / cell,
    )
  }

  const newRacks: Omit<RackInstance, 'id'>[] = []
  const unplaced: string[] = []
  let maxRight = 0
  let maxZ = edgeZCells * cell

  for (const row of rows) {
    const rowDepthCells = Math.max(...row.map((n) => footprintOf(n).d)) / cell
    const gridZ = Math.ceil(edgeZCells + minAisleCells + rowDepthCells / 2)
    const rowWidthCells = row.reduce((sum, n) => sum + footprintOf(n).w / cell, 0)
    let edgeXCells = -rowWidthCells / 2
    for (const need of row) {
      const wCells = footprintOf(need).w / cell
      // ceil snaps the center to the grid with a sub-cell gap (< flue tolerance)
      // to the previous rack, so racks in a line sit shelf-to-shelf.
      const gridX = Math.ceil(edgeXCells + wCells / 2)
      newRacks.push({
        templateId: ensureTemplate(need.bays, need.levels),
        code: need.code,
        name: need.code,
        gridX,
        gridZ,
        rotation: 0,
        slotOverrides: {},
      })
      edgeXCells = gridX + wCells / 2
      maxRight = Math.max(maxRight, edgeXCells * cell)
    }
    edgeZCells = gridZ + rowDepthCells / 2
    maxZ = Math.max(maxZ, edgeZCells * cell)
  }

  // ---- Floor growth: fit all new racks with a 2 m margin. ----
  let floorPatch: { widthM: number; depthM: number } | undefined
  if (newRacks.length > 0) {
    const widthM = Math.max(layout.floor.widthM, Math.ceil((maxRight + 2) * 2))
    const depthM = Math.max(layout.floor.depthM, Math.ceil((maxZ + 2) * 2))
    if (widthM !== layout.floor.widthM || depthM !== layout.floor.depthM) {
      floorPatch = { widthM, depthM }
    }
  }

  // ---- Validate placements against the (possibly grown) candidate layout. ----
  if (newRacks.length > 0) {
    const candidate: WarehouseLayout = {
      ...layout,
      floor: { ...layout.floor, ...floorPatch },
      templates: { ...layout.templates, ...Object.fromEntries([...templates.values()].map((t) => [t.id, t])) },
      racks: { ...layout.racks },
    }
    const placed: Omit<RackInstance, 'id'>[] = []
    for (const r of newRacks) {
      if (isPlacementValid(candidate, r.templateId, r.gridX, r.gridZ, r.rotation)) {
        const id = `plan-${placed.length}`
        candidate.racks[id] = { ...r, id }
        placed.push(r)
      } else {
        unplaced.push(r.code ?? '?')
      }
    }
    newRacks.length = 0
    newRacks.push(...placed)
  }

  return {
    templates: [...templates.values()],
    racks: newRacks,
    rackUpgrades,
    floorPatch,
    stats: {
      rackCodes: needs.size,
      created: newRacks.length,
      upgraded: rackUpgrades.length,
      existingMatched,
      unplaced,
      outOfRange,
      duplicateCodes,
    },
  }
}
