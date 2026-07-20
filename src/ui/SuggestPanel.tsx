import { useEffect, useMemo, useState } from 'react'
import type { CarrierKind } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { useStockStore } from '../store/useStockStore'
import { suggestSlots } from '../lib/suggest'
import { carrierKind } from '../lib/loadProxy'
import { useT, type TranslationKey } from '../lib/i18n'

const CARRIERS: CarrierKind[] = ['pallet', 'carton', 'bin']

export function SuggestPanel() {
  const layout = useWarehouseStore((s) => s.layout)
  const items = useStockStore((s) => s.items)
  const stockIndex = useStockStore((s) => s.index)
  const setShow = useEditorStore((s) => s.setShowSuggest)
  const setSuggestedSlots = useEditorStore((s) => s.setSuggestedSlots)
  const selectRack = useEditorStore((s) => s.selectRack)
  const selectSlot = useEditorStore((s) => s.selectSlot)
  const t = useT()

  // Unique products by symbol (first occurrence carries the per-unit data).
  const bySymbol = useMemo(() => {
    const m = new Map<string, (typeof items)[number]>()
    for (const it of items) if (!m.has(it.symbol)) m.set(it.symbol, it)
    return m
  }, [items])
  const symbols = useMemo(() => [...bySymbol.keys()].sort(), [bySymbol])

  const [sku, setSku] = useState(() => symbols[0] ?? '')
  const [qty, setQty] = useState(1)
  const [carrier, setCarrier] = useState<CarrierKind | 'any'>('any')

  const product = bySymbol.get(sku)
  const unitVolumeM3 = product?.unitVolumeM3
  const unitWeightKg = product?.unitWeightKg
  const neededVolumeM3 = unitVolumeM3 ? unitVolumeM3 * qty : 0
  const neededWeightKg = unitWeightKg ? unitWeightKg * qty : undefined

  // Default the carrier filter to where this SKU already lives (dominant carrier).
  useEffect(() => {
    if (!sku) return
    const counts: Record<string, number> = {}
    for (const rack of Object.values(layout.racks)) {
      const tpl = layout.templates[rack.templateId]
      if (!tpl || !rack.code) continue
      const hasSku = Object.values(stockIndex[rack.code] ?? {}).some((list) =>
        list.some((i) => i.symbol === sku),
      )
      if (hasSku) counts[carrierKind(tpl)] = (counts[carrierKind(tpl)] ?? 0) + 1
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    setCarrier(top ? (top[0] as CarrierKind) : 'any')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku])

  const results = useMemo(() => {
    if (!(neededVolumeM3 > 0)) return []
    return suggestSlots(
      layout,
      stockIndex,
      { neededVolumeM3, neededWeightKg, carrier: carrier === 'any' ? undefined : carrier },
      { sku, limit: 30 },
    )
  }, [layout, stockIndex, neededVolumeM3, neededWeightKg, carrier, sku])

  // Push the highlight set to the scene whenever the results change.
  useEffect(() => {
    setSuggestedSlots(new Set(results.map((r) => `${r.rackId}:${r.slotKey}`)))
  }, [results, setSuggestedSlots])

  // Keep the 3D highlights after closing so they stay visible in the scene;
  // they are cleared when the user switches editor mode (see useEditorStore.setMode).
  const close = () => setShow(false)

  const reasonText = (r: (typeof results)[number]): string => {
    const parts = [t('suggest.reason.fit', { pct: Math.round(r.fillAfter * 100) })]
    if (r.empty) parts.push(t('suggest.reason.emptySlot'))
    if (r.sameSku) parts.push(t('suggest.reason.sameSku'))
    return parts.join(' · ')
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="flex max-h-[85vh] w-[560px] flex-col rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('suggest.title')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={close}>
            ✕
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            {t('suggest.sku')}
            <select className="field" value={sku} onChange={(e) => setSku(e.target.value)}>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s} — {bySymbol.get(s)?.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            {t('suggest.qty')}
            <input
              type="number"
              className="field w-20 text-right"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            {t('suggest.carrier')}
            <select
              className="field w-28"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value as CarrierKind | 'any')}
            >
              <option value="any">{t('suggest.carrier.any')}</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {t(`tpl.carrier.${c}` as TranslationKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-2 text-[11px] text-muted">
          {unitVolumeM3 ? (
            <>
              {t('suggest.needVolume', { v: neededVolumeM3.toFixed(3) })}
              {neededWeightKg !== undefined && <> · {t('suggest.needWeight', { w: neededWeightKg.toFixed(1) })}</>}
            </>
          ) : (
            <span className="text-warn">{t('suggest.noVolume')}</span>
          )}
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {unitVolumeM3 && results.length === 0 && (
            <div className="py-6 text-center text-xs text-muted">{t('suggest.resultsNone')}</div>
          )}
          {results.length > 0 && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t('suggest.results', { n: results.length })}
              </div>
              <div className="flex flex-col gap-1">
                {results.map((r) => (
                  <button
                    key={`${r.rackId}:${r.slotKey}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel2 px-2 py-1.5 text-left hover:border-accent/50"
                    onClick={() => {
                      selectRack(r.rackId)
                      selectSlot(r.slotKey)
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">
                        {r.rackCode} · {r.label}
                      </div>
                      <div className="text-[10px] text-muted">{reasonText(r)}</div>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-accent">
                      {Math.round(r.fillAfter * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-muted">{t('suggest.note')}</p>
      </div>
    </div>
  )
}
