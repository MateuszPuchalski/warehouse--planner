import type { FloorConfig, RackInstance, RackRotation, RackTemplate, SlotRole, Wall, WarehouseLayout, Zone } from '../types'
import { makePerimeterWalls } from './walls'

/**
 * Built-in layout recreated from the "Regały" worksheet + the real floor plan
 * (SketchUp survey): a ~18.2 × 19.1 m hall split by a dividing wall, with a
 * packing room (pakowalnia) in the south-west corner.
 *
 * One "regał" = one 2.7 m frame-to-frame span. Every 270 cm rack — pallet or
 * shelf — is divided into **6 columns of 45 cm**: that is the granularity of the
 * on-site location codes. A euro pallet occupies two of those columns, so a
 * pallet level physically holds 3 pallets while still being addressed per column.
 *
 * Aisle letters follow the on-site location system `A01-02-03` = aisle+rack,
 * column, level:
 *
 * - A, B, G — shallower shelf racks (Mecalux M7): A south-west along the
 *   divider + in the packing room, B mid-hall north, G north along the divider.
 * - C, D, E — pallet racks (SSI Schaefer): south hall rows + east wall.
 * - F — bin (kuweta) racks: north-east wall + packing room.
 * - H — Mecalux pallet racks with narrow levels (mostly knives): north hall,
 *   along the north/west walls and a central back-to-back block.
 */

/**
 * Pallet-rack frames, 270 cm wide = 6 columns × 45 cm (a pallet spans two of
 * them). Mecalux carries 110 cm deep picking places, SSI Schaefer 105 cm.
 */
const PALLET_COLUMNS = { bays: 6, bayWidth: 0.45, uprightSize: 0.09, beamHeight: 0.12, carrier: 'pallet' as const }
// `frameSystem` is what lets the variants of one range stand in a single run and share
// their end frames even though their level layouts differ (see `joinKeyOf`).
const MECALUX = { ...PALLET_COLUMNS, depth: 1.1, frameSystem: 'mecalux-pallet-550' }
const SCHAEFER = { ...PALLET_COLUMNS, depth: 1.05, frameSystem: 'ssi-pallet-350' }
const SHELF = { depth: 0.6, uprightSize: 0.05, beamHeight: 0.04, carrier: 'carton' as const, frameSystem: 'mecalux-m7-300' }
const BIN = { uprightSize: 0.04, beamHeight: 0.025, carrier: 'bin' as const, frameSystem: 'ktr-238' }

type TplBase = {
  bays: number
  bayWidth: number
  depth: number
  uprightSize: number
  beamHeight: number
  carrier: RackTemplate['carrier']
  frameSystem?: string
}

/**
 * Build a template from its per-level clear heights (bottom → top). Roles are
 * normally inferred from those heights (≥ 80 cm = pallet position), so pass
 * `levelRoles` only where that inference would be wrong — e.g. the 100 cm top
 * level of a shelf rack, which is a tall shelf, not a pallet position.
 */
function tpl(
  id: string,
  name: string,
  base: TplBase,
  levelHeights: number[],
  maxWeightKg: number,
  levelRoles?: SlotRole[],
): RackTemplate {
  const avg = levelHeights.reduce((a, b) => a + b, 0) / levelHeights.length
  return {
    id,
    name,
    ...base,
    levels: levelHeights.length,
    levelHeight: Number(avg.toFixed(3)),
    levelHeights,
    ...(levelRoles ? { levelRoles } : {}),
    defaultSlot: { maxWeightKg },
  }
}

function uniformTpl(
  id: string,
  name: string,
  base: TplBase,
  levels: number,
  levelHeight: number,
  maxWeightKg: number,
): RackTemplate {
  return { id, name, ...base, levels, levelHeight, defaultSlot: { maxWeightKg } }
}

/** All levels of a shelf rack are picking faces, however tall the level is. */
const ALL_PICK = (n: number): SlotRole[] => Array.from({ length: n }, () => 'pick' as const)

export function buildSampleTemplates(): Record<string, RackTemplate> {
  const templates: RackTemplate[] = [
    // Mecalux pallet racks, 5.5 m frame, 270 cm wide = 6 columns; picking levels
    // hold 110 × 40 cm places. The three variants differ only in level count and
    // level heights (9 / 2 / 1 racks on site).
    tpl('tpl-mec-a', 'Mecalux 5,5m A (6 kol · 6 poz)', MECALUX, [1.12, 0.37, 0.47, 0.37, 1.175, 1.7], 800),
    tpl('tpl-mec-b', 'Mecalux 5,5m B (6 kol · 5 poz)', MECALUX, [1.63, 0.47, 0.37, 1.175, 1.7], 800),
    tpl('tpl-mec-c', 'Mecalux 5,5m C (6 kol · 4 poz)', MECALUX, [2.23, 0.37, 1.175, 1.7], 800),
    // SSI Schaefer pallet racks, also 270 cm wide = 6 columns; picking levels
    // hold 105 × 40 cm places (4 / 5 / 1 / 3 racks on site).
    tpl('tpl-sch-a', 'SSI Schaefer A (6 kol · 5 poz)', SCHAEFER, [0.88, 0.48, 0.38, 1.24, 2.5], 800),
    tpl('tpl-sch-b', 'SSI Schaefer B (6 kol · 3 poz)', SCHAEFER, [2.23, 1.24, 2.5], 800),
    tpl('tpl-sch-c', 'SSI Schaefer C (6 kol · 6 poz)', SCHAEFER, [0.78, 0.33, 0.28, 0.28, 1.22, 2.1], 800),
    tpl('tpl-sch-d', 'SSI Schaefer D (6 kol · 3 poz)', SCHAEFER, [2.23, 0.38, 2.5], 800),
    // Mecalux M7 shelf racks, 3 m tall (places 45×60 / 36×60 cm). The 100 cm top
    // level is a tall shelf, not a pallet position — hence the explicit roles.
    tpl('tpl-m7-270', 'Mecalux M7 270cm (6 kol · 6 poz)', { bays: 6, bayWidth: 0.45, ...SHELF }, [0.57, 0.42, 0.32, 0.32, 0.57, 1.0], 150, ALL_PICK(6)),
    tpl('tpl-m7-182', 'Mecalux M7 182cm (5 kol · 6 poz)', { bays: 5, bayWidth: 0.364, ...SHELF }, [0.57, 0.42, 0.32, 0.32, 0.57, 1.0], 150, ALL_PICK(6)),
    // Bin (kuweta) racks, 238 cm tall.
    uniformTpl('tpl-kuw-106', 'Kuwetowy 106cm (5 kol · 11 poz, KTR30)', { bays: 5, bayWidth: 0.212, depth: 0.32, ...BIN }, 11, 0.216, 30),
    uniformTpl('tpl-kuw-126', 'Kuwetowy 126cm (6 kol · 11 poz, KTR30)', { bays: 6, bayWidth: 0.21, depth: 0.32, ...BIN }, 11, 0.216, 30),
    uniformTpl('tpl-kuw-93', 'Kuwetowy 93cm (5 kol · 14 poz, KTR23)', { bays: 5, bayWidth: 0.186, depth: 0.23, ...BIN }, 14, 0.17, 20),
    uniformTpl('tpl-kuw-96', 'Kuwetowy 96cm (6 kol · 14 poz, KTR23)', { bays: 6, bayWidth: 0.16, depth: 0.23, ...BIN }, 14, 0.17, 20),
    uniformTpl('tpl-kuw-93s', 'Kuwetowy 93cm (7 kol · 14 poz, KTR20)', { bays: 7, bayWidth: 0.133, depth: 0.23, ...BIN }, 14, 0.17, 20),
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
    { tpl: 'tpl-mec-a', x: -8.4, z: -7.8, rot: 90 },
    { tpl: 'tpl-mec-a', x: -8.4, z: -5.0, rot: 90 },
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
    showLoadProxies: true,
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
  // packing room in the south-west corner (door gap in its east wall, plus a
  // door to the C/D aisle cut into its north wall).
  const interior: Wall[] = [
    { id: 'wall-divider', x1: -18.2, z1: 0, x2: 13.2, z2: 0, heightM: floor.wallHeightM, thicknessM: floor.wallThicknessM },
    {
      id: 'wall-pack-n',
      x1: -18.2,
      z1: 11,
      x2: 0,
      z2: 11,
      heightM: 3,
      thicknessM: 0.15,
      openings: [{ offsetM: 7.8, widthM: 1.0, heightM: 2.1 }],
    },
    { id: 'wall-pack-e', x1: 0, z1: 11, x2: 0, z2: 16, heightM: 3, thicknessM: 0.15 },
  ]

  const walls = Object.fromEntries([...makePerimeterWalls(floor), ...interior].map((w) => [w.id, w]))
  // Delivery gate, 3.53 m wide, next to aisle H: west perimeter wall, which
  // runs from the south-west corner northwards — the opening spans z −3.6…−0.07.
  walls['wall-perimeter-w'] = {
    ...walls['wall-perimeter-w'],
    openings: [{ offsetM: 9.62, widthM: 3.53, heightM: 4.0 }],
  }

  const zones: Zone[] = [
    { id: 'zone-pack', x1: -18.2, z1: 11, x2: 0, z2: 19.1, label: 'Pakowalnia', kind: 'packing' },
    { id: 'zone-delivery', x1: -17.8, z1: -6.8, x2: -12.6, z2: -0.6, label: 'Strefa dostaw', kind: 'dock' },
    { id: 'zone-pass', x1: 13.4, z1: -3, x2: 18.2, z2: 3, label: 'Przejście', kind: 'custom' },
  ]

  return {
    schemaVersion: 1,
    name: 'Regały — Mecalux & SSI Schaefer',
    floor,
    templates,
    racks,
    walls,
    zones: Object.fromEntries(zones.map((z) => [z.id, z])),
    updatedAt: new Date().toISOString(),
  }
}
