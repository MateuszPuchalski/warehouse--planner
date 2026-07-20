import { useMemo } from 'react'
import type { CarrierKind } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { useStockStore } from '../store/useStockStore'
import { computeKpis } from '../lib/kpi'
import { useT, type TranslationKey } from '../lib/i18n'

const CARRIERS: CarrierKind[] = ['pallet', 'carton', 'bin']

/** Color for a fill meter: green under 80%, amber to 100%, red over capacity. */
function meterColor(util: number): string {
  return util > 1 ? '#ff5c5c' : util > 0.8 ? '#ffb020' : '#3ddc84'
}

function Tile({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-panel2 p-2.5">
      <div className="panel-title">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${danger ? 'text-danger' : ''}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

function Meter({ label, util, right }: { label: string; util: number; right: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span>{right}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-bg">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, util * 100)}%`, background: meterColor(util) }}
        />
      </div>
    </div>
  )
}

export function Dashboard() {
  const layout = useWarehouseStore((s) => s.layout)
  const stockIndex = useStockStore((s) => s.index)
  const items = useStockStore((s) => s.items)
  const setShow = useEditorStore((s) => s.setShowDashboard)
  const t = useT()

  const k = useMemo(() => computeKpis(layout, stockIndex, items), [layout, stockIndex, items])
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={() => setShow(false)}>
      <div
        className="flex max-h-[85vh] w-[720px] flex-col rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('kpi.title')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={() => setShow(false)}>
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label={t('kpi.fill')} value={pct(k.fillPct)} sub={t('kpi.slotsSub', { occ: k.occupiedSlots, total: k.slotCount })} />
            <Tile label={t('kpi.volume')} value={pct(k.volumeUtilPct)} sub={`${k.volumeUsedM3.toFixed(1)} / ${k.volumeCapacityM3.toFixed(1)} m³`} />
            <Tile label={t('kpi.freeSlots')} value={String(k.freeSlots)} sub={t('kpi.racks', { n: k.rackCount })} />
            <Tile label={t('kpi.overweight')} value={String(k.overweightSlots)} danger={k.overweightSlots > 0} />
            <Tile label={t('kpi.overVolume')} value={String(k.overVolumeSlots)} danger={k.overVolumeSlots > 0} />
            <Tile label={t('kpi.aisles')} value={String(k.aisleViolations)} danger={k.aisleViolations > 0} />
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <Meter label={t('kpi.fill')} util={k.fillPct} right={t('kpi.slotsSub', { occ: k.occupiedSlots, total: k.slotCount })} />
            <Meter label={t('kpi.volume')} util={k.volumeUtilPct} right={`${k.volumeUsedM3.toFixed(1)} / ${k.volumeCapacityM3.toFixed(1)} m³`} />
          </div>

          <div className="mt-4">
            <div className="panel-title mb-1.5">{t('kpi.byCarrier')}</div>
            <div className="flex flex-col gap-2">
              {CARRIERS.map((c) => {
                const s = k.byCarrier[c]
                const util = s.total > 0 ? s.occupied / s.total : 0
                return (
                  <div key={c} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-[11px]">
                    <span className="text-muted">{t(`tpl.carrier.${c}` as TranslationKey)}</span>
                    <div className="h-2 overflow-hidden rounded bg-bg">
                      <div className="h-full" style={{ width: `${Math.min(100, util * 100)}%`, background: '#4c9aff' }} />
                    </div>
                    <span className="text-muted">
                      {t('kpi.freeOfTotal', { free: s.free, total: s.total })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="panel-title mb-1.5">{t('kpi.stock')}</div>
            {items.length === 0 ? (
              <div className="rounded-md border border-border bg-panel2 p-3 text-center text-[11px] text-muted">
                {t('kpi.noStock')}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1 text-[11px] text-muted sm:grid-cols-3">
                <span>{t('kpi.sku', { n: k.stock.skuCount })}</span>
                <span>{t('kpi.qty', { n: k.stock.totalQuantity })}</span>
                <span>{t('kpi.located', { n: k.stock.located })}</span>
                {k.stock.palletOnly > 0 && <span className="text-warn">{t('kpi.palletOnly', { n: k.stock.palletOnly })}</span>}
                {k.stock.noLocation > 0 && <span className="text-warn">{t('kpi.noLocation', { n: k.stock.noLocation })}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
