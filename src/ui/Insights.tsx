import { useMemo } from 'react'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { useStockStore } from '../store/useStockStore'
import { computeRackKpis, type RackKpi } from '../lib/kpi'
import { computeSkuVelocity, type SkuVelocity } from '../lib/skuStats'
import { loadSkuStats } from '../lib/persistence'
import { useT } from '../lib/i18n'

const HOTSPOT_LIMIT = 8

/** Color for a fill meter: green under 80%, amber to 100%, red over capacity. */
function meterColor(util: number): string {
  return util > 1 ? '#ff5c5c' : util > 0.8 ? '#ffb020' : '#3ddc84'
}

function Meter({ label, util, right, danger }: { label: string; util: number; right: string; danger?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className={danger ? 'text-danger' : 'text-muted'}>{label}</span>
        <span className="text-muted">{right}</span>
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

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-border bg-panel2 p-3 text-center text-[11px] text-muted">{msg}</div>
  )
}

export function Insights() {
  const layout = useWarehouseStore((s) => s.layout)
  const stockIndex = useStockStore((s) => s.index)
  const items = useStockStore((s) => s.items)
  const setShow = useEditorStore((s) => s.setShowInsights)
  const t = useT()

  const hotspots = useMemo<RackKpi[]>(() => {
    return computeRackKpis(layout, stockIndex)
      .filter((r) => r.slotCount > 0)
      .sort((a, b) => b.volumeUtilPct - a.volumeUtilPct || b.overVolumeSlots - a.overVolumeSlots)
      .slice(0, HOTSPOT_LIMIT)
    // `items` is a proxy for "stock changed"; the index/layout drive the math.
  }, [layout, stockIndex, items])

  const { fast, stale } = useMemo<{ fast: SkuVelocity[]; stale: SkuVelocity[] }>(
    () => computeSkuVelocity(loadSkuStats(), Date.now()),
    [items],
  )

  const pct = (v: number) => `${Math.round(v * 100)}%`
  const round = (v: number) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={() => setShow(false)}>
      <div
        className="flex max-h-[85vh] w-[720px] flex-col rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('insights.title')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={() => setShow(false)}>
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {/* Overload-risk hotspots */}
          <div className="panel-title mb-1.5">{t('insights.hotspots')}</div>
          {hotspots.length === 0 ? (
            <EmptyState msg={t('insights.noRacks')} />
          ) : (
            <div className="flex flex-col gap-2.5">
              {hotspots.map((r) => (
                <Meter
                  key={r.id}
                  label={r.name}
                  util={r.volumeUtilPct}
                  danger={r.volumeUtilPct > 1 || r.overVolumeSlots > 0}
                  right={t('insights.hotspots.sub', {
                    occ: r.occupiedSlots,
                    total: r.slotCount,
                    over: r.overVolumeSlots,
                    pct: pct(r.volumeUtilPct),
                  })}
                />
              ))}
            </div>
          )}

          {/* SKU rotation */}
          <div className="panel-title mt-4 mb-1.5">{t('insights.rotation')}</div>
          {fast.length === 0 && stale.length === 0 ? (
            <EmptyState msg={t('insights.noHistory')} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-semibold text-muted">{t('insights.fast')}</div>
                <div className="flex flex-col gap-1">
                  {fast.length === 0 ? (
                    <span className="text-[11px] text-muted">—</span>
                  ) : (
                    fast.map((v) => (
                      <div key={v.symbol} className="grid grid-cols-[1fr_auto] items-baseline gap-2 text-[11px]">
                        <span className="truncate" title={v.name}>
                          <span className="text-text">{v.symbol}</span> <span className="text-muted">{v.name}</span>
                        </span>
                        <span className="text-muted">{t('insights.throughput', { n: round(v.throughput) })}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold text-muted">{t('insights.stale')}</div>
                <div className="flex flex-col gap-1">
                  {stale.length === 0 ? (
                    <span className="text-[11px] text-muted">—</span>
                  ) : (
                    stale.map((v) => (
                      <div key={v.symbol} className="grid grid-cols-[1fr_auto] items-baseline gap-2 text-[11px]">
                        <span className="truncate" title={v.name}>
                          <span className="text-text">{v.symbol}</span> <span className="text-muted">{v.name}</span>
                        </span>
                        <span className="text-warn">
                          {t('insights.qty', { n: v.lastQty })} · {t('insights.idle', { days: Math.round(v.idleDays) })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
