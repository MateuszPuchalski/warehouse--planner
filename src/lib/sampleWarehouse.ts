import type { FloorConfig, RackInstance, RackTemplate, WarehouseLayout } from '../types'
import { getLocalSize } from './rackGeometry'
import { makePerimeterWalls } from './walls'

/**
 * Built-in layout recreated from the "Regały" worksheet (real warehouse survey):
 *
 * - Mecalux pallet racks, 5.5 m frames, 3 bays × 2.7 m — 9 + 2 + 1 racks, mixed
 *   pallet levels (170 / 163 / 117.5 / 112 / 223 cm) with shelf sub-levels
 *   (37 / 47 cm) for 110×40 cm boxes.
 * - SSI Schaefer pallet racks, 3.5 m frames — 5 + 1 + 4 + 3 racks with pallet
 *   levels (250 / 223 / 210 / 124 / 122 / 88 / 78 cm) and shelf sub-levels
 *   (28 / 33 / 38 / 48 cm) for 105×40 cm boxes.
 * - Mecalux M7 shelf racks — 7× 270 cm wide (6 shelf places/level, 45×60 cm)
 *   and 8× 182 cm wide (5 places/level, 36×60 cm), 300 cm tall.
 * - Bin ("kuweta") racks, 238 cm tall, with KTR30/KTR23/KTR20 containers —
 *   3× 106 cm, 1× 126 cm, 5+2× 93 cm, 2× 96 cm.
 *
 * Level heights are listed in the worksheet top → bottom; templates store them
 * bottom → top.
 */

const PALLET = { bays: 3, bayWidth: 2.7, depth: 1.1, uprightSize: 0.09, beamHeight: 0.12 }
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
    // Mecalux pallet racks, 5.5 m frame (worksheet rows: 170/117.5/37/47/37/112 …)
    tpl('tpl-mec-a', 'Mecalux 5.5m A (2 palety + półki)', PALLET, [1.12, 0.37, 0.47, 0.37, 1.175, 1.7], 1000),
    tpl('tpl-mec-b', 'Mecalux 5.5m B (163 dół)', PALLET, [1.63, 0.47, 0.37, 1.175, 1.7], 1000),
    tpl('tpl-mec-c', 'Mecalux 5.5m C (223 dół)', PALLET, [2.23, 0.37, 1.175, 1.7], 1000),
    // SSI Schaefer pallet racks, 3.5 m frame
    tpl('tpl-sch-a', 'SSI Schaefer A (88/48/38/124/250)', PALLET, [0.88, 0.48, 0.38, 1.24, 2.5], 1000),
    tpl('tpl-sch-b', 'SSI Schaefer B (223/124/250)', PALLET, [2.23, 1.24, 2.5], 1000),
    tpl('tpl-sch-c', 'SSI Schaefer C (78/33/28×2/122/210)', PALLET, [0.78, 0.33, 0.28, 0.28, 1.22, 2.1], 1000),
    tpl('tpl-sch-d', 'SSI Schaefer D (223/38/250)', PALLET, [2.23, 0.38, 2.5], 1000),
    // Mecalux M7 shelf racks, 3 m tall (places 45×60 / 36×60 cm)
    tpl('tpl-m7-270', 'Mecalux M7 270cm (6 miejsc/poziom)', { bays: 6, bayWidth: 0.45, ...SHELF }, [0.57, 0.42, 0.32, 0.32, 0.57, 1.0], 150),
    tpl('tpl-m7-182', 'Mecalux M7 182cm (5 miejsc/poziom)', { bays: 5, bayWidth: 0.36, ...SHELF }, [0.57, 0.42, 0.32, 0.32, 0.57, 1.0], 150),
    // Bin (kuweta) racks, 238 cm tall
    uniformTpl('tpl-kuw-106', 'Kuwetowy 106cm (KTR30)', { bays: 5, bayWidth: 0.212, depth: 0.32, ...BIN }, 11, 0.216, 30),
    uniformTpl('tpl-kuw-126', 'Kuwetowy 126cm (KTR30)', { bays: 6, bayWidth: 0.21, depth: 0.32, ...BIN }, 11, 0.216, 30),
    uniformTpl('tpl-kuw-93', 'Kuwetowy 93cm (KTR23)', { bays: 5, bayWidth: 0.186, depth: 0.23, ...BIN }, 14, 0.17, 20),
    uniformTpl('tpl-kuw-96', 'Kuwetowy 96cm (KTR23)', { bays: 6, bayWidth: 0.16, depth: 0.23, ...BIN }, 14, 0.17, 20),
    uniformTpl('tpl-kuw-93s', 'Kuwetowy 93cm (KTR20)', { bays: 7, bayWidth: 0.133, depth: 0.23, ...BIN }, 14, 0.17, 20),
  ]
  return Object.fromEntries(templates.map((t) => [t.id, t]))
}

/** Expand [templateId, count] pairs into a flat list of template ids. */
function repeat(defs: [string, number][]): string[] {
  return defs.flatMap(([id, n]) => Array.from({ length: n }, () => id))
}

export function buildSampleWarehouse(): WarehouseLayout {
  const templates = buildSampleTemplates()
  const floor: FloorConfig = {
    widthM: 62,
    depthM: 30,
    cellSize: 0.5,
    minAisleWidthM: 3,
    showAisleGuides: true,
    wallHeightM: 6.5,
    wallThicknessM: 0.25,
  }

  const racks: Record<string, RackInstance> = {}

  /** Lay racks in a touching line centered on x = 0 at the given z (meters). */
  const layRow = (line: string, templateIds: string[], zM: number) => {
    const widths = templateIds.map((id) => getLocalSize(templates[id]).w)
    const total = widths.reduce((a, b) => a + b, 0)
    let cursor = -total / 2
    templateIds.forEach((id, i) => {
      const w = widths[i]
      const code = `${line}${String(i + 1).padStart(2, '0')}`
      racks[`rack-${code.toLowerCase()}`] = {
        id: `rack-${code.toLowerCase()}`,
        templateId: id,
        name: `${code} · ${templates[id].name}`,
        code,
        gridX: (cursor + w / 2) / floor.cellSize,
        gridZ: zM / floor.cellSize,
        rotation: 0,
        slotOverrides: {},
      }
      cursor += w
    })
  }

  // Pallet zone (north): two Mecalux lines, two SSI Schaefer lines, 3.4 m aisles.
  layRow('A', repeat([['tpl-mec-a', 6]]), -13.5)
  layRow('B', repeat([['tpl-mec-a', 3], ['tpl-mec-b', 2], ['tpl-mec-c', 1]]), -9)
  layRow('C', repeat([['tpl-sch-a', 5], ['tpl-sch-b', 1]]), -4.5)
  layRow('D', repeat([['tpl-sch-c', 4], ['tpl-sch-d', 3]]), 0)
  // Picking zone (south): M7 shelf racks, then bin racks; open staging area behind.
  layRow('E', repeat([['tpl-m7-270', 7], ['tpl-m7-182', 8]]), 4.5)
  layRow('F', repeat([['tpl-kuw-106', 3], ['tpl-kuw-126', 1], ['tpl-kuw-93', 5], ['tpl-kuw-96', 2], ['tpl-kuw-93s', 2]]), 8)

  return {
    schemaVersion: 1,
    name: 'Regały — Mecalux & SSI Schaefer',
    floor,
    templates,
    racks,
    walls: Object.fromEntries(makePerimeterWalls(floor).map((w) => [w.id, w])),
    updatedAt: new Date().toISOString(),
  }
}
