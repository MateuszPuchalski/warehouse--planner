import type {
  AABB,
  RackInstance,
  RackRotation,
  RackTemplate,
  ResolvedSlot,
  SlotKey,
  SlotStatus,
  StockItem,
} from '../types'

export function slotKey(bay: number, level: number): SlotKey {
  return `${bay}:${level}`
}

export function parseSlotKey(key: SlotKey): { bay: number; level: number } {
  const [bay, level] = key.split(':').map(Number)
  return { bay, level }
}

/** Per-level heights bottom → top; falls back to the uniform levelHeight. */
export function getLevelHeights(t: RackTemplate): number[] {
  if (t.levelHeights && t.levelHeights.length === t.levels) return t.levelHeights
  return Array.from({ length: t.levels }, () => t.levelHeight)
}

/** Cumulative level bottoms; length levels + 1, last entry = total shelf height. */
export function getLevelOffsets(t: RackTemplate): number[] {
  const heights = getLevelHeights(t)
  const offsets = [0]
  for (const h of heights) offsets.push(offsets[offsets.length - 1] + h)
  return offsets
}

/** Level index containing local height y (clamped to valid levels). */
export function levelAtHeight(t: RackTemplate, y: number): number {
  const offsets = getLevelOffsets(t)
  for (let l = 0; l < t.levels; l++) {
    if (y < offsets[l + 1]) return l
  }
  return t.levels - 1
}

/** Unrotated local size of a rack built from a template. */
export function getLocalSize(t: RackTemplate): { w: number; h: number; d: number } {
  const offsets = getLevelOffsets(t)
  return {
    w: t.bays * t.bayWidth + t.uprightSize,
    h: offsets[t.levels] + t.beamHeight,
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
  const offsets = getLevelOffsets(t)
  const H = offsets[t.levels]
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
    const y = offsets[l]
    for (const z of [-halfD, halfD]) {
      beams.push({ pos: [0, y, z], scale: [W, t.beamHeight, t.uprightSize * 0.9] })
    }
  }

  const decks: Member[] = []
  for (let l = 1; l < t.levels; l++) {
    decks.push({
      pos: [0, offsets[l] + t.beamHeight / 2 + 0.015, 0],
      scale: [W - t.uprightSize, 0.03, Math.max(0.1, t.depth - 0.05)],
    })
  }

  return { uprights, beams, decks }
}

/** Local-space center + size of the interior of one slot cell. */
export function getSlotCell(t: RackTemplate, bay: number, level: number): Member {
  const W = t.bays * t.bayWidth
  const offsets = getLevelOffsets(t)
  const levelH = offsets[level + 1] - offsets[level]
  return {
    pos: [-W / 2 + (bay + 0.5) * t.bayWidth, offsets[level] + levelH / 2, 0],
    scale: [
      Math.max(0.05, t.bayWidth - t.uprightSize - 0.08),
      Math.max(0.05, levelH - t.beamHeight - 0.1),
      Math.max(0.05, t.depth - 0.12),
    ],
  }
}

/** Usable interior volume of a slot in m³, from the slot cell's geometry. */
export function slotVolumeM3(t: RackTemplate, level: number): number {
  const [w, h, d] = getSlotCell(t, 0, level).scale
  return w * h * d
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
  const maxVolumeM3 = o?.maxVolumeM3 ?? t.defaultSlot.maxVolumeM3 ?? slotVolumeM3(t, level)
  const currentVolumeM3 = o?.currentVolumeM3 ?? 0
  const volumeUtilization = maxVolumeM3 > 0 ? currentVolumeM3 / maxVolumeM3 : 0
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
    maxVolumeM3,
    currentVolumeM3,
    volumeUtilization,
    status,
    hasOverride: o !== undefined,
  }
}

/**
 * Occupied volume (m³) implied by stock at one slot: each item's total quantity
 * is split evenly across its locations (quantity is not per-location), times its
 * per-unit volume. Items without a unit volume contribute nothing.
 */
export function stockVolumeM3(items: StockItem[]): number {
  let total = 0
  for (const item of items) {
    if (!item.unitVolumeM3) continue
    const perLocation = item.quantity / Math.max(1, item.locations.length)
    total += perLocation * item.unitVolumeM3
  }
  return total
}

/**
 * Effective volume fill of a slot: a manual override wins, otherwise it is
 * derived from the stock parked at that slot.
 */
export function effectiveVolume(
  slot: ResolvedSlot,
  stockItems: StockItem[] | undefined,
): { currentM3: number; util: number; over: boolean } {
  const currentM3 = slot.currentVolumeM3 > 0 ? slot.currentVolumeM3 : stockVolumeM3(stockItems ?? [])
  const util = slot.maxVolumeM3 > 0 ? currentM3 / slot.maxVolumeM3 : 0
  return { currentM3, util, over: util > 1 }
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

/** Count slots whose effective volume (manual or stock-derived) exceeds capacity. */
export function countOverVolume(
  t: RackTemplate,
  rack: RackInstance,
  stock: Record<SlotKey, StockItem[]> | null | undefined,
): number {
  let over = 0
  for (const s of allSlots(t, rack)) {
    if (effectiveVolume(s, stock?.[s.key]).over) over++
  }
  return over
}
