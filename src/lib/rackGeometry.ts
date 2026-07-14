import type {
  AABB,
  RackInstance,
  RackRotation,
  RackTemplate,
  ResolvedSlot,
  SlotKey,
  SlotStatus,
} from '../types'

export function slotKey(bay: number, level: number): SlotKey {
  return `${bay}:${level}`
}

export function parseSlotKey(key: SlotKey): { bay: number; level: number } {
  const [bay, level] = key.split(':').map(Number)
  return { bay, level }
}

/** Unrotated local size of a rack built from a template. */
export function getLocalSize(t: RackTemplate): { w: number; h: number; d: number } {
  return {
    w: t.bays * t.bayWidth + t.uprightSize,
    h: t.levels * t.levelHeight + t.beamHeight,
    d: t.depth,
  }
}

/** Floor footprint in meters, swapped for 90°/270° rotations. */
export function getFootprint(t: RackTemplate, rotation: RackRotation): { w: number; d: number } {
  const { w, d } = getLocalSize(t)
  return rotation === 90 || rotation === 270 ? { w: d, d: w } : { w, d }
}

export function aabbFor(
  gridX: number,
  gridZ: number,
  rotation: RackRotation,
  t: RackTemplate,
  cellSize: number,
): AABB {
  const { w, d } = getFootprint(t, rotation)
  const cx = gridX * cellSize
  const cz = gridZ * cellSize
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }
}

export interface Member {
  pos: [number, number, number]
  scale: [number, number, number]
}

export interface MemberSets {
  uprights: Member[]
  beams: Member[]
  decks: Member[]
}

/** Local-space transforms of every structural member of a rack. Computed once per template. */
export function buildMembers(t: RackTemplate): MemberSets {
  const W = t.bays * t.bayWidth
  const H = t.levels * t.levelHeight
  const halfD = t.depth / 2 - t.uprightSize / 2

  const uprights: Member[] = []
  for (let i = 0; i <= t.bays; i++) {
    const x = -W / 2 + i * t.bayWidth
    for (const z of [-halfD, halfD]) {
      uprights.push({ pos: [x, H / 2, z], scale: [t.uprightSize, H, t.uprightSize] })
    }
  }

  const beams: Member[] = []
  for (let l = 1; l <= t.levels; l++) {
    const y = l * t.levelHeight
    for (const z of [-halfD, halfD]) {
      beams.push({ pos: [0, y, z], scale: [W, t.beamHeight, t.uprightSize * 0.9] })
    }
  }

  const decks: Member[] = []
  for (let l = 1; l < t.levels; l++) {
    decks.push({
      pos: [0, l * t.levelHeight + t.beamHeight / 2 + 0.015, 0],
      scale: [W - t.uprightSize, 0.03, Math.max(0.1, t.depth - 0.05)],
    })
  }

  return { uprights, beams, decks }
}

/** Local-space center + size of the interior of one slot cell. */
export function getSlotCell(t: RackTemplate, bay: number, level: number): Member {
  const W = t.bays * t.bayWidth
  return {
    pos: [-W / 2 + (bay + 0.5) * t.bayWidth, level * t.levelHeight + t.levelHeight / 2, 0],
    scale: [
      Math.max(0.05, t.bayWidth - t.uprightSize - 0.08),
      Math.max(0.05, t.levelHeight - t.beamHeight - 0.1),
      Math.max(0.05, t.depth - 0.12),
    ],
  }
}

export function resolveSlot(
  t: RackTemplate,
  rack: RackInstance,
  bay: number,
  level: number,
): ResolvedSlot {
  const key = slotKey(bay, level)
  const o = rack.slotOverrides[key]
  const maxWeightKg = o?.maxWeightKg ?? t.defaultSlot.maxWeightKg
  const currentWeightKg = o?.currentWeightKg ?? 0
  const utilization = maxWeightKg > 0 ? currentWeightKg / maxWeightKg : 0
  let status: SlotStatus
  if (o?.statusOverride) status = o.statusOverride
  else if (currentWeightKg <= 0) status = 'empty'
  else if (utilization > 1) status = 'overweight'
  else if (utilization > 0.8) status = 'warning'
  else status = 'ok'
  return {
    key,
    bay,
    level,
    label: o?.label ?? `B${bay + 1}-L${level + 1}`,
    maxWeightKg,
    currentWeightKg,
    utilization,
    status,
    hasOverride: o !== undefined,
  }
}

export function allSlots(t: RackTemplate, rack: RackInstance): ResolvedSlot[] {
  const out: ResolvedSlot[] = []
  for (let level = 0; level < t.levels; level++) {
    for (let bay = 0; bay < t.bays; bay++) out.push(resolveSlot(t, rack, bay, level))
  }
  return out
}

export function rackStats(
  t: RackTemplate,
  rack: RackInstance,
): { total: number; occupied: number; warnings: number; overweight: number } {
  let occupied = 0
  let warnings = 0
  let overweight = 0
  for (const s of allSlots(t, rack)) {
    if (s.currentWeightKg > 0) occupied++
    if (s.status === 'warning') warnings++
    if (s.status === 'overweight') overweight++
  }
  return { total: t.bays * t.levels, occupied, warnings, overweight }
}
