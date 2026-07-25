import type { CarrierKind, RackInstance, RackTemplate, SlotKey, SlotRole, StockItem, WarehouseLayout } from '../types'
import type { StockIndex } from '../store/useStockStore'
import { allSlots, countOverVolume, effectiveVolume, rackStats } from './rackGeometry'
import { carrierKind } from './loadProxy'
import { countMisfit } from './fit'
import { validateAisles } from './collision'

export interface CarrierStat {
  total: number
  occupied: number
  free: number
}

export interface WarehouseKpis {
  rackCount: number
  slotCount: number
  occupiedSlots: number
  freeSlots: number
  fillPct: number
  volumeCapacityM3: number
  volumeUsedM3: number
  volumeUtilPct: number
  overweightSlots: number
  overVolumeSlots: number
  /** Slots holding a measured product that does not physically fit their opening. */
  misfitSlots: number
  aisleViolations: number
  byCarrier: Record<CarrierKind, CarrierStat>
  /** Slot counts split by operational function (pallet positions vs picking faces). */
  byRole: Record<SlotRole, CarrierStat>
  stock: {
    skuCount: number
    totalQuantity: number
    located: number
    palletOnly: number
    noLocation: number
  }
}

const CARRIERS: CarrierKind[] = ['pallet', 'carton', 'bin']
const ROLES: SlotRole[] = ['pallet', 'pick']

function emptyCarrierStats(): Record<CarrierKind, CarrierStat> {
  return {
    pallet: { total: 0, occupied: 0, free: 0 },
    carton: { total: 0, occupied: 0, free: 0 },
    bin: { total: 0, occupied: 0, free: 0 },
  }
}

function emptyRoleStats(): Record<SlotRole, CarrierStat> {
  return {
    pallet: { total: 0, occupied: 0, free: 0 },
    pick: { total: 0, occupied: 0, free: 0 },
  }
}

/** Occupancy/volume stats for a single rack — the per-rack building block of the KPIs. */
export interface RackKpi {
  id: string
  code: string | undefined
  name: string
  carrier: CarrierKind
  slotCount: number
  occupiedSlots: number
  fillPct: number
  volumeCapacityM3: number
  volumeUsedM3: number
  volumeUtilPct: number
  overVolumeSlots: number
  overweightSlots: number
  /** Slots holding a measured product that does not physically fit their opening. */
  misfitSlots: number
  /** Slot counts split by operational function (pallet positions vs picking faces). */
  byRole: Record<SlotRole, { total: number; occupied: number }>
}

/**
 * Compute one rack's occupancy/volume stats. Single source of truth shared by
 * `computeKpis` (which sums these) and `computeRackKpis` (which returns them),
 * so warehouse totals and per-rack views never drift apart.
 */
function rackKpi(
  tpl: RackTemplate,
  rack: RackInstance,
  stock: Record<SlotKey, StockItem[]> | undefined,
): RackKpi {
  let slotCount = 0
  let occupiedSlots = 0
  let volumeCapacityM3 = 0
  let volumeUsedM3 = 0
  const byRole = { pallet: { total: 0, occupied: 0 }, pick: { total: 0, occupied: 0 } }
  for (const s of allSlots(tpl, rack)) {
    slotCount++
    const vol = effectiveVolume(s, stock?.[s.key])
    const occupied = s.currentWeightKg > 0 || vol.currentM3 > 0
    if (occupied) occupiedSlots++
    byRole[s.role].total++
    if (occupied) byRole[s.role].occupied++
    volumeCapacityM3 += s.maxVolumeM3
    volumeUsedM3 += vol.currentM3
  }
  return {
    id: rack.id,
    code: rack.code,
    name: rack.name ?? rack.code ?? rack.id,
    carrier: carrierKind(tpl),
    slotCount,
    occupiedSlots,
    fillPct: slotCount > 0 ? occupiedSlots / slotCount : 0,
    volumeCapacityM3,
    volumeUsedM3,
    volumeUtilPct: volumeCapacityM3 > 0 ? volumeUsedM3 / volumeCapacityM3 : 0,
    overVolumeSlots: countOverVolume(tpl, rack, stock),
    overweightSlots: rackStats(tpl, rack).overweight,
    misfitSlots: countMisfit(tpl, rack, stock),
    byRole,
  }
}

/** Per-rack occupancy/volume stats, one entry per rack with a known template. */
export function computeRackKpis(layout: WarehouseLayout, stockIndex: StockIndex): RackKpi[] {
  const out: RackKpi[] = []
  for (const rack of Object.values(layout.racks)) {
    const tpl = layout.templates[rack.templateId]
    if (!tpl) continue
    const stock = rack.code ? stockIndex[rack.code] : undefined
    out.push(rackKpi(tpl, rack, stock))
  }
  return out
}

/** Aggregate warehouse-wide KPIs from the layout, stock index, and stock list. */
export function computeKpis(
  layout: WarehouseLayout,
  stockIndex: StockIndex,
  items: StockItem[],
): WarehouseKpis {
  let slotCount = 0
  let occupiedSlots = 0
  let volumeCapacityM3 = 0
  let volumeUsedM3 = 0
  let overweightSlots = 0
  let overVolumeSlots = 0
  let misfitSlots = 0
  const byCarrier = emptyCarrierStats()
  const byRole = emptyRoleStats()

  for (const rack of Object.values(layout.racks)) {
    const tpl = layout.templates[rack.templateId]
    if (!tpl) continue
    const stock = rack.code ? stockIndex[rack.code] : undefined
    const r = rackKpi(tpl, rack, stock)
    slotCount += r.slotCount
    occupiedSlots += r.occupiedSlots
    volumeCapacityM3 += r.volumeCapacityM3
    volumeUsedM3 += r.volumeUsedM3
    overweightSlots += r.overweightSlots
    overVolumeSlots += r.overVolumeSlots
    misfitSlots += r.misfitSlots
    byCarrier[r.carrier].total += r.slotCount
    byCarrier[r.carrier].occupied += r.occupiedSlots
    for (const role of ROLES) {
      byRole[role].total += r.byRole[role].total
      byRole[role].occupied += r.byRole[role].occupied
    }
  }

  for (const c of CARRIERS) byCarrier[c].free = byCarrier[c].total - byCarrier[c].occupied
  for (const role of ROLES) byRole[role].free = byRole[role].total - byRole[role].occupied

  const skuSet = new Set<string>()
  let totalQuantity = 0
  let located = 0
  let palletOnly = 0
  let noLocation = 0
  for (const i of items) {
    skuSet.add(i.symbol)
    totalQuantity += i.quantity
    if (i.locations.length > 0) located++
    else if (i.otherLocations.length > 0) palletOnly++
    else noLocation++
  }

  return {
    rackCount: Object.keys(layout.racks).length,
    slotCount,
    occupiedSlots,
    freeSlots: slotCount - occupiedSlots,
    fillPct: slotCount > 0 ? occupiedSlots / slotCount : 0,
    volumeCapacityM3,
    volumeUsedM3,
    volumeUtilPct: volumeCapacityM3 > 0 ? volumeUsedM3 / volumeCapacityM3 : 0,
    overweightSlots,
    overVolumeSlots,
    misfitSlots,
    aisleViolations: validateAisles(layout).length,
    byCarrier,
    byRole,
    stock: {
      skuCount: skuSet.size,
      totalQuantity,
      located,
      palletOnly,
      noLocation,
    },
  }
}
