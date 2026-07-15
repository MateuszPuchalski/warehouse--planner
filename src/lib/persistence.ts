import type { FloorConfig, RackInstance, RackRotation, RackTemplate, Wall, WarehouseLayout } from '../types'
import { makePerimeterWalls } from './walls'

const AUTOSAVE_KEY = 'wp:autosave:v1'
const PRESETS_KEY = 'wp:presets:v1'
const TEMPLATE_LIB_KEY = 'wp:templateLib:v1'

interface Stored<T> {
  schemaVersion: number
  data: T
}

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const blob = JSON.parse(raw) as Stored<T>
    if (blob.schemaVersion !== 1) {
      console.warn(`[persistence] unsupported schema version in ${key}:`, blob.schemaVersion)
      return null
    }
    return blob.data
  } catch (err) {
    console.warn(`[persistence] failed to read ${key}, starting fresh`, err)
    return null
  }
}

function writeStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, data } satisfies Stored<T>))
  } catch (err) {
    console.warn(`[persistence] failed to write ${key}`, err)
  }
}

// ---------- Layout validation ----------

const VALID_ROTATIONS: RackRotation[] = [0, 90, 180, 270]

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

const FLOOR_DEFAULTS: FloorConfig = {
  widthM: 40,
  depthM: 30,
  cellSize: 0.5,
  minAisleWidthM: 3,
  showAisleGuides: true,
  wallHeightM: 3,
  wallThicknessM: 0.2,
}

/** Validate an untrusted layout object; throws Error with a readable message. */
export function validateLayout(raw: unknown): WarehouseLayout {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a JSON object')
  const l = raw as Partial<WarehouseLayout>
  if (l.schemaVersion !== 1) throw new Error(`Unsupported schema version: ${String(l.schemaVersion)}`)
  if (typeof l.templates !== 'object' || l.templates === null) throw new Error('Missing "templates"')
  if (typeof l.racks !== 'object' || l.racks === null) throw new Error('Missing "racks"')

  const floor: FloorConfig = { ...FLOOR_DEFAULTS, ...(typeof l.floor === 'object' ? l.floor : {}) }
  for (const k of ['widthM', 'depthM', 'cellSize', 'minAisleWidthM', 'wallHeightM', 'wallThicknessM'] as const) {
    if (!isFiniteNumber(floor[k]) || floor[k] <= 0) throw new Error(`Invalid floor.${k}`)
  }

  const templates: Record<string, RackTemplate> = {}
  for (const [id, t] of Object.entries(l.templates as Record<string, RackTemplate>)) {
    if (typeof t !== 'object' || t === null) throw new Error(`Invalid template "${id}"`)
    for (const k of ['bays', 'levels', 'bayWidth', 'levelHeight', 'depth', 'uprightSize', 'beamHeight'] as const) {
      if (!isFiniteNumber(t[k]) || t[k] <= 0) throw new Error(`Template "${id}": invalid ${k}`)
    }
    if (!t.defaultSlot || !isFiniteNumber(t.defaultSlot.maxWeightKg)) {
      throw new Error(`Template "${id}": invalid defaultSlot`)
    }
    templates[id] = { ...t, id, name: typeof t.name === 'string' ? t.name : id }
  }

  const racks: Record<string, RackInstance> = {}
  for (const [id, r] of Object.entries(l.racks as Record<string, RackInstance>)) {
    if (typeof r !== 'object' || r === null) throw new Error(`Invalid rack "${id}"`)
    if (!templates[r.templateId]) throw new Error(`Rack "${id}" references unknown template "${r.templateId}"`)
    if (!isFiniteNumber(r.gridX) || !isFiniteNumber(r.gridZ)) throw new Error(`Rack "${id}": invalid position`)
    if (!VALID_ROTATIONS.includes(r.rotation)) throw new Error(`Rack "${id}": invalid rotation`)
    racks[id] = {
      ...r,
      id,
      slotOverrides: typeof r.slotOverrides === 'object' && r.slotOverrides !== null ? r.slotOverrides : {},
    }
  }

  const walls: Record<string, Wall> = {}
  if (typeof l.walls === 'object' && l.walls !== null) {
    for (const [id, w] of Object.entries(l.walls as Record<string, Wall>)) {
      if (typeof w !== 'object' || w === null) throw new Error(`Invalid wall "${id}"`)
      for (const k of ['x1', 'z1', 'x2', 'z2'] as const) {
        if (!isFiniteNumber(w[k])) throw new Error(`Wall "${id}": invalid ${k}`)
      }
      for (const k of ['heightM', 'thicknessM'] as const) {
        if (!isFiniteNumber(w[k]) || w[k] <= 0) throw new Error(`Wall "${id}": invalid ${k}`)
      }
      walls[id] = {
        id,
        x1: w.x1,
        z1: w.z1,
        x2: w.x2,
        z2: w.z2,
        heightM: w.heightM,
        thicknessM: w.thicknessM,
        ...(w.perimeter ? { perimeter: true } : {}),
      }
    }
  }

  return {
    schemaVersion: 1,
    name: typeof l.name === 'string' && l.name.trim() ? l.name : 'Imported layout',
    floor,
    templates,
    racks,
    walls,
    updatedAt: typeof l.updatedAt === 'string' ? l.updatedAt : new Date().toISOString(),
  }
}

// ---------- Autosave ----------

export function loadAutosave(): WarehouseLayout | null {
  const data = readStored<WarehouseLayout>(AUTOSAVE_KEY)
  if (!data) return null
  try {
    return validateLayout(data)
  } catch (err) {
    console.warn('[persistence] autosave failed validation, starting fresh', err)
    return null
  }
}

export function saveAutosave(layout: WarehouseLayout): void {
  writeStored(AUTOSAVE_KEY, layout)
}

// ---------- Layout presets ----------

export function listPresets(): Record<string, WarehouseLayout> {
  return readStored<Record<string, WarehouseLayout>>(PRESETS_KEY) ?? {}
}

export function savePreset(name: string, layout: WarehouseLayout): void {
  const presets = listPresets()
  presets[name] = { ...layout, name }
  writeStored(PRESETS_KEY, presets)
}

export function deletePreset(name: string): void {
  const presets = listPresets()
  delete presets[name]
  writeStored(PRESETS_KEY, presets)
}

// ---------- Template library (reusable across layouts) ----------

export function loadTemplateLibrary(): Record<string, RackTemplate> {
  return readStored<Record<string, RackTemplate>>(TEMPLATE_LIB_KEY) ?? {}
}

export function saveTemplateToLibrary(t: RackTemplate): void {
  const lib = loadTemplateLibrary()
  lib[t.id] = t
  writeStored(TEMPLATE_LIB_KEY, lib)
}

export function removeTemplateFromLibrary(id: string): void {
  const lib = loadTemplateLibrary()
  delete lib[id]
  writeStored(TEMPLATE_LIB_KEY, lib)
}

// ---------- Export / import ----------

export function exportLayoutFile(layout: WarehouseLayout): void {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${layout.name.replace(/[^\w\- ]+/g, '').trim() || 'warehouse'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importLayoutFile(file: File): Promise<WarehouseLayout> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('File is not valid JSON')
  }
  return validateLayout(parsed)
}

// ---------- Seed data ----------

export function seedTemplates(): Record<string, RackTemplate> {
  const templates: RackTemplate[] = [
    {
      id: 'tpl-standard',
      name: 'Standard pallet 3×4',
      bays: 3,
      levels: 4,
      bayWidth: 2.7,
      levelHeight: 1.5,
      depth: 1.1,
      uprightSize: 0.09,
      beamHeight: 0.12,
      defaultSlot: { maxWeightKg: 1000 },
    },
    {
      id: 'tpl-widespan',
      name: 'Wide-span 4×3',
      bays: 4,
      levels: 3,
      bayWidth: 3.3,
      levelHeight: 2,
      depth: 1.2,
      uprightSize: 0.1,
      beamHeight: 0.14,
      defaultSlot: { maxWeightKg: 1500 },
    },
    {
      id: 'tpl-highbay',
      name: 'High-bay 2×6',
      bays: 2,
      levels: 6,
      bayWidth: 2.7,
      levelHeight: 1.4,
      depth: 1.1,
      uprightSize: 0.09,
      beamHeight: 0.11,
      defaultSlot: { maxWeightKg: 800 },
    },
  ]
  return Object.fromEntries(templates.map((t) => [t.id, t]))
}

export function seedLayout(): WarehouseLayout {
  const racks: RackInstance[] = [
    {
      id: 'rack-a1',
      templateId: 'tpl-standard',
      name: 'Row A-01',
      gridX: -10,
      gridZ: -8,
      rotation: 0,
      slotOverrides: {
        '0:0': { currentWeightKg: 780 },
        '0:1': { currentWeightKg: 400 },
        '1:0': { currentWeightKg: 950 },
        '1:1': { currentWeightKg: 1150 },
        '2:0': { label: 'Fragile', currentWeightKg: 300, maxWeightKg: 500 },
        '2:2': { statusOverride: 'blocked' },
      },
    },
    { id: 'rack-a2', templateId: 'tpl-standard', name: 'Row A-02', gridX: -10, gridZ: 1, rotation: 0, slotOverrides: {} },
    { id: 'rack-a3', templateId: 'tpl-standard', name: 'Row A-03', gridX: -10, gridZ: 4, rotation: 0, slotOverrides: {} },
    {
      id: 'rack-b1',
      templateId: 'tpl-widespan',
      name: 'Row B-01',
      gridX: 19,
      gridZ: -8,
      rotation: 0,
      slotOverrides: { '0:0': { currentWeightKg: 1200 }, '3:1': { currentWeightKg: 1600 } },
    },
    { id: 'rack-c1', templateId: 'tpl-highbay', name: 'Col C-01', gridX: 24, gridZ: 8, rotation: 90, slotOverrides: {} },
  ]
  const floor: FloorConfig = { ...FLOOR_DEFAULTS }
  return {
    schemaVersion: 1,
    name: 'Demo warehouse',
    floor,
    templates: seedTemplates(),
    racks: Object.fromEntries(racks.map((r) => [r.id, r])),
    walls: Object.fromEntries(makePerimeterWalls(floor).map((w) => [w.id, w])),
    updatedAt: new Date().toISOString(),
  }
}
