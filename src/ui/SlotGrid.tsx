import { useMemo } from 'react'
import type { RackInstance, RackTemplate } from '../types'
import { allSlots } from '../lib/rackGeometry'
import { slotColor } from '../lib/colorModes'
import { statusLabel, useT } from '../lib/i18n'
import { useEditorStore } from '../store/useEditorStore'
import { useRackStock } from '../store/useStockStore'

/** 2D bay × level grid mirroring the 3D slot colors — the primary slot-editing surface. */
export function SlotGrid({ rack, template }: { rack: RackInstance; template: RackTemplate }) {
  const colorMode = useEditorStore((s) => s.colorMode)
  const selectedSlotKey = useEditorStore((s) => s.selectedSlotKey)
  const selectSlot = useEditorStore((s) => s.selectSlot)
  const t = useT()

  const slots = useMemo(() => allSlots(template, rack), [template, rack])
  const byKey = useMemo(() => new Map(slots.map((s) => [s.key, s])), [slots])
  const stock = useRackStock(rack.code)

  // Levels rendered top-down (highest level first).
  const rows: number[] = []
  for (let l = template.levels - 1; l >= 0; l--) rows.push(l)

  return (
    <div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${template.bays}, minmax(0, 1fr))` }}
      >
        {rows.map((level) =>
          Array.from({ length: template.bays }, (_, bay) => {
            const key = `${bay}:${level}`
            const slot = byKey.get(key)
            if (!slot) return null
            const selected = selectedSlotKey === key
            const mode = colorMode === 'none' ? 'status' : colorMode
            const stockItems = stock?.[key]
            const stockTip = stockItems?.length
              ? ` · ${stockItems.map((i) => i.symbol).join(', ')}`
              : ''
            const occupied = slot.status !== 'empty' || (stockItems?.length ?? 0) > 0
            return (
              <button
                key={key}
                onClick={() => selectSlot(selected ? null : key)}
                title={`${slot.label} · ${statusLabel(t, slot.status)} · ${slot.currentWeightKg}/${slot.maxWeightKg} kg${stockTip}`}
                className={`h-6 cursor-pointer rounded-sm transition-transform hover:scale-105 ${
                  selected ? 'ring-2 ring-white' : ''
                }`}
                style={{
                  background: slotColor(slot, mode, stockItems?.length ?? 0),
                  opacity: occupied ? 0.95 : 0.45,
                }}
              />
            )
          }),
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{t('slotgrid.bays', { n: template.bays })}</span>
        <span>{t('slotgrid.top', { n: template.levels })}</span>
      </div>
    </div>
  )
}
