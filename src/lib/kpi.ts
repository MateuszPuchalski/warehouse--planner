import type { CarrierKind, StockItem, WarehouseLayout } from '../types'
import type { StockIndex } from '../store/useStockStore'
import { allSlots, countOverVolume, effectiveVolume, rackStats } from './rackGeometry'
import { carrierKind } from './loadProxy'
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
  aisleViolations: number
  byCarrier: Record<CarrierKind, CarrierStat>
  stock: {
    skuCount: number
    totalQuantity: number
    located: number
    palletOnly: number
    noLocation: number
  }
}

const CARRIERS: CarrierKind[] = ['pallet', 'carton', 'bin']

function emptyCarrierStats(): Record<CarrierKind, CarrierStat> {
  return {
    pallet: { total: 0, occupied: 0, free: 0 },
    carton: { total: 0, occupied: 0, free: 0 },
    bin: { total: 0, occupied: 0, free: 0 },
  }
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
  const byCarrier = emptyCarrierStats()

  for (const rack of Object.values(layout.racks)) {
    const tpl = layout.templates[rack.templateId]
    if (!tpl) continue
    const stock = rack.code ? stockIndex[rack.code] : undefined
    const carrier = carrierKind(tpl)
    overweightSlots += rackStats(tpl, rack).overweight
    overVolumeSlots += countOverVolume(tpl, rack, stock)

    for (const s of allSlots(tpl, rack)) {
      slotCount++
      byCarrier[carrier].total++
      const vol = effectiveVolume(s, stock?.[s.key])
      const occupied = s.currentWeightKg > 0 || vol.currentM3 > 0
      if (occupied) {
        occupiedSlots++
        byCarrier[carrier].occupied++
      }
      volumeCapacityM3 += s.maxVolumeM3
      volumeUsedM3 += vol.currentM3
    }
  }

  for (const c of CARRIERS) byCarrier[c].free = byCarrier[c].total - byCarrier[c].occupied

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
    aisleViolations: validateAisles(layout).length,
    byCarrier,
    stock: {
      skuCount: skuSet.size,
      totalQuantity,
      located,
      palletOnly,
      noLocation,
    },
  }
}
