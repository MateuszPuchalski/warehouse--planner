import type { FloorConfig, RackInstance, RackRotation, RackTemplate, Wall, WarehouseLayout } from '../types'
import { makePerimeterWalls } from './walls'

/**
 * Built-in layout recreated from the "Regały" worksheet + the real floor plan
 * (SketchUp survey): a ~18.2 × 19.1 m hall split by a dividing wall, with a
 * packing room (pakowalnia) in the south-west corner.
 *
 * One "regał" = a single 2.7 m bay (3 pallets per beam level). Aisle letters
 * follow the on-site location system `A01-02-03` = aisle+rack, column, level:
 *
 * - A, B, G — shallower shelf racks (Mecalux M7): A south-west along the
 *   divider + in the packing room, B mid-hall north, G north along the divider.
 * - C, D, E — pallet racks (SSI Schaefer): south hall rows + east wall.
 * - F — bin (kuweta) racks: north-east wall + packing room.
 * - H — Mecalux pallet racks with narrow levels (mostly knives): north hall,
 *   along the north/west walls and a central back-to-back block.
 */

const PALLET = { bays: 3, bayWidth: 0.9, depth: 1.1, uprightSize: 0.09, beamHeight: 0.12 }
const SHELF = { depth: 0.6, uprightSize: 0.05, beamHeight: 0.04 }
const BIN = { uprightSize: 0.04, beamHeight: 0.025 }

function tpl(
  id: string,
  name: string,
  base: { bays: number; bayWidth: number; depth: number; uprightSize: number; beamHeight: number },
  levelHeights: number[],
  maxWeightKg: number,
): RackTemplate {
  const avg = levelHeights.reduce((a, b) => a + b, 0) / levelHeights.length
  return {
    id,
    name,
    ...base,
    levels: levelHeights.length,
    levelHeight: Number(avg.toFixed(3)),
    levelHeights,
    defaultSlot: { maxWeightKg },
  }
}

function uniformTpl(
  id: string,
  name: string,
  base: { bays: number; bayWidth: number; depth: number; uprightSize: number; beamHeight: number },
  levels: number,
  levelHeight: number,
  maxWeightKg: number,
): RackTemplate {
  return { id, name, ...base, levels, levelHeight, defaultSlot: { maxWeightKg } }
}

export function buildSampleTemplates(): Record<string, RackTemplate> {
  const templates: RackTemplate[] = [
    // Mecalux pallet racks, 5.5 m frame, single 2.7 m bay = 3 pallet columns.
    tpl('tpl-mec-a', 'Mecalux 5.5m A (wąskie poziomy)', PALLET, [1.12, 0.37, 0.47, 0.37, 1.175, 1.7], 800),
    tpl('tpl-mec-b', 'Mecalux 5.5m B (163 dół)', PALLET, [1.63, 0.47, 0.37, 1.175, 1.7], 800),
    tpl('tpl-mec-c', 'Mecalux 5.5m C (223 dół)', PALLET, [2.23, 0.37, 1.175, 1.7], 800),
    // SSI Schaefer pallet racks, 3.5 m frame.
    tpl('tpl-sch-a', 'SSI Schaefer A (88/48/38/124/250)', PALLET, [0.88, 0.48, 0.38, 1.24, 2.5], 800),
    tpl('tpl-sch-b', 'SSI Schaefer B (223/124/250)', PALLET, [2.23, 1.24, 2.5], 800),
    tpl('tpl-sch-c', 'SSI Schaefer C (78/33/28×2/122/210)', PALLET, [0.78, 0.33, 0.28, 0.28, 1.22, 2.1], 800),
    tpl('tpl-sch-d', 'SSI Schaefer D (223/38/250)', PALLET, [2.23, 0.38, 2.5], 800),
    // Mecalux M7 shelf racks, 3 m tall (places 45×60 / 36×60 cm).
    tpl('tpl-m7-270', 'Mecalux M7 270cm (6 miejsc/poziom)', { bays: 6, bayWidth: 0.45, ...SHELF }, [0.57, 0.42, 0.32, 0.32, 0.57, 1.0], 150),
    tpl('tpl-m7-182', 'Mecalux M7 182cm (5 miejsc/poziom)', { bays: 5, bayWidth: 0.36, ...SHELF }, [0.57, 0.42, 0.32, 0.32, 0.57, 1.0], 150),
    // Bin (kuweta) racks, 238 cm tall.
    uniformTpl('tpl-kuw-106', 'Kuwetowy 106cm (KTR30)', { bays: 5, bayWidth: 0.212, depth: 0.32, ...BIN }, 11, 0.216, 30),
    uniformTpl('tpl-kuw-126', 'Kuwetowy 126cm (KTR30)', { bays: 6, bayWidth: 0.21, depth: 0.32, ...BIN }, 11, 0.216, 30),
    uniformTpl('tpl-kuw-93', 'Kuwetowy 93cm (KTR23)', { bays: 5, bayWidth: 0.186, depth: 0.23, ...BIN }, 14, 0.17, 20),
    uniformTpl('tpl-kuw-96', 'Kuwetowy 96cm (KTR23)', { bays: 6, bayWidth: 0.16, depth: 0.23, ...BIN }, 14, 0.17, 20),
    uniformTpl('tpl-kuw-93s', 'Kuwetowy 93cm (KTR20)', { bays: 7, bayWidth: 0.133, depth: 0.23, ...BIN }, 14, 0.17, 20),
  ]
  return Object.fromEntries(templates.map((t) => [t.id, t]))
}

/** One placed rack: template, position in meters, rotation. */
interface Placement {
  tpl: string
  x: number
  z: number
  rot: RackRotation
}

/**
 * Rack placements per aisle, in meters from the hall center (+x east, +z south).
 * North hall (z < 0): H (Mecalux), G + B (M7 shelf), F part 1 (bins, east wall).
 * South hall (z > 0): A (M7 shelf), C/D/E (Schaefer), packing room with F part 2.
 */
const LINES: Record<string, Placement[]> = {
  // H — Mecalux: north wall row, west wall pair, central back-to-back block.
  H: [
    { tpl: 'tpl-mec-a', x: -6.45, z: -8.9, rot: 0 },
    { tpl: 'tpl-mec-a', x: -3.65, z: -8.9, rot: 0 },
    { tpl: 'tpl-mec-a', x: -0.85, z: -8.9, rot: 0 },
    { tpl: 'tpl-mec-a', x: 1.95, z: -8.9, rot: 0 },
    { tpl: 'tpl-mec-a', x: 4.75, z: -8.9, rot: 0 },
    { tpl: 'tpl-mec-a', x: -8.4, z: -7.4, rot: 90 },
    { tpl: 'tpl-mec-a', x: -8.4, z: -4.6, rot: 90 },
    { tpl: 'tpl-mec-a', x: -3.9, z: -5.3, rot: 0 },
    { tpl: 'tpl-mec-a', x: -1.1, z: -5.3, rot: 0 },
    { tpl: 'tpl-mec-b', x: 1.7, z: -5.3, rot: 0 },
    { tpl: 'tpl-mec-b', x: -3.9, z: -4.15, rot: 0 },
    { tpl: 'tpl-mec-c', x: -1.1, z: -4.15, rot: 0 },
  ],
  // G — M7 shelf row backing the divider, north side.
  G: [
    { tpl: 'tpl-m7-270', x: -6.45, z: -0.7, rot: 0 },
    { tpl: 'tpl-m7-270', x: -3.7, z: -0.7, rot: 0 },
    { tpl: 'tpl-m7-270', x: -0.95, z: -0.7, rot: 0 },
  ],
  // B — M7 shelf, back-to-back double column mid north hall.
  B: [
    { tpl: 'tpl-m7-270', x: 3.6, z: -4.3, rot: 90 },
    { tpl: 'tpl-m7-270', x: 3.6, z: -1.55, rot: 90 },
    { tpl: 'tpl-m7-270', x: 4.25, z: -4.3, rot: 90 },
    { tpl: 'tpl-m7-270', x: 4.25, z: -1.55, rot: 90 },
  ],
  // A — M7 shelf: along the divider (south side) + in the packing room.
  A: [
    { tpl: 'tpl-m7-182', x: -7.5, z: 0.75, rot: 0 },
    { tpl: 'tpl-m7-182', x: -5.65, z: 0.75, rot: 0 },
    { tpl: 'tpl-m7-182', x: -3.8, z: 0.75, rot: 0 },
    { tpl: 'tpl-m7-182', x: -1.95, z: 0.75, rot: 0 },
    { tpl: 'tpl-m7-182', x: -8.6, z: 6.6, rot: 90 },
    { tpl: 'tpl-m7-182', x: -8.6, z: 8.45, rot: 90 },
    { tpl: 'tpl-m7-182', x: -6.9, z: 9.05, rot: 0 },
    { tpl: 'tpl-m7-182', x: -5.05, z: 9.05, rot: 0 },
  ],
  // C — Schaefer, west part of the mid south row.
  C: [
    { tpl: 'tpl-sch-d', x: -7.55, z: 4.5, rot: 0 },
    { tpl: 'tpl-sch-d', x: -4.75, z: 4.5, rot: 0 },
    { tpl: 'tpl-sch-d', x: -1.95, z: 4.5, rot: 0 },
  ],
  // D — Schaefer, east part of the mid south row + east wall column + south wall.
  D: [
    { tpl: 'tpl-sch-a', x: 0.85, z: 4.5, rot: 0 },
    { tpl: 'tpl-sch-a', x: 3.65, z: 4.5, rot: 0 },
    { tpl: 'tpl-sch-b', x: 6.45, z: 4.5, rot: 0 },
    { tpl: 'tpl-sch-a', x: 8.4, z: 3.4, rot: 90 },
    { tpl: 'tpl-sch-a', x: 8.4, z: 6.4, rot: 90 },
    { tpl: 'tpl-sch-a', x: 7.4, z: 8.8, rot: 0 },
  ],
  // E — Schaefer along the divider (south side, east part) + south wall row.
  E: [
    { tpl: 'tpl-sch-c', x: 0.85, z: 0.85, rot: 0 },
    { tpl: 'tpl-sch-c', x: 3.65, z: 0.85, rot: 0 },
    { tpl: 'tpl-sch-c', x: 1.8, z: 8.8, rot: 0 },
    { tpl: 'tpl-sch-c', x: 4.6, z: 8.8, rot: 0 },
  ],
  // F — bins: north-east wall column + row inside the packing room.
  F: [
    { tpl: 'tpl-kuw-106', x: 8.85, z: -8.8, rot: 90 },
    { tpl: 'tpl-kuw-106', x: 8.85, z: -7.7, rot: 90 },
    { tpl: 'tpl-kuw-106', x: 8.85, z: -6.6, rot: 90 },
    { tpl: 'tpl-kuw-126', x: 8.85, z: -5.4, rot: 90 },
    { tpl: 'tpl-kuw-96', x: 8.85, z: -4.25, rot: 90 },
    { tpl: 'tpl-kuw-96', x: 8.85, z: -3.25, rot: 90 },
    { tpl: 'tpl-kuw-93', x: -7.6, z: 6.1, rot: 0 },
    { tpl: 'tpl-kuw-93', x: -6.63, z: 6.1, rot: 0 },
    { tpl: 'tpl-kuw-93', x: -5.66, z: 6.1, rot: 0 },
    { tpl: 'tpl-kuw-93', x: -4.69, z: 6.1, rot: 0 },
    { tpl: 'tpl-kuw-93', x: -3.72, z: 6.1, rot: 0 },
    { tpl: 'tpl-kuw-93s', x: -2.74, z: 6.1, rot: 0 },
    { tpl: 'tpl-kuw-93s', x: -1.76, z: 6.1, rot: 0 },
  ],
}

export function buildSampleWarehouse(): WarehouseLayout {
  const templates = buildSampleTemplates()
  const floor: FloorConfig = {
    widthM: 18.2,
    depthM: 19.1,
    cellSize: 0.5,
    minAisleWidthM: 2.5,
    showAisleGuides: true,
    wallHeightM: 5.8,
    wallThicknessM: 0.25,
  }
  const cs = floor.cellSize

  const racks: Record<string, RackInstance> = {}
  for (const [line, placements] of Object.entries(LINES)) {
    placements.forEach((p, i) => {
      const code = `${line}${String(i + 1).padStart(2, '0')}`
      const id = `rack-${code.toLowerCase()}`
      racks[id] = {
        id,
        templateId: p.tpl,
        name: `${code} · ${templates[p.tpl].name}`,
        code,
        gridX: p.x / cs,
        gridZ: p.z / cs,
        rotation: p.rot,
        slotOverrides: {},
      }
    })
  }

  // Interior walls: divider between halls (passage at the east end) and the
  // packing room in the south-west corner (door gap in its east wall).
  const interior: Wall[] = [
    { id: 'wall-divider', x1: -18.2, z1: 0, x2: 13.2, z2: 0, heightM: floor.wallHeightM, thicknessM: floor.wallThicknessM },
    { id: 'wall-pack-n', x1: -18.2, z1: 11, x2: 0, z2: 11, heightM: 3, thicknessM: 0.15 },
    { id: 'wall-pack-e', x1: 0, z1: 11, x2: 0, z2: 16, heightM: 3, thicknessM: 0.15 },
  ]

  return {
    schemaVersion: 1,
    name: 'Regały — Mecalux & SSI Schaefer',
    floor,
    templates,
    racks,
    walls: Object.fromEntries([...makePerimeterWalls(floor), ...interior].map((w) => [w.id, w])),
    updatedAt: new Date().toISOString(),
  }
}
