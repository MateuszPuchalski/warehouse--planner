import { useEffect, useMemo, useRef, useState } from 'react'
import type { AbcClass } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { useStockStore } from '../store/useStockStore'
import { usePickReportStore } from '../store/usePickReportStore'
import { parseStockFile } from '../lib/stockFile'
import { countByClass, linesByClass, parsePickReport } from '../lib/pickReport'
import { analyzeSlotting, downloadCsv, movesToCsv, type SlottingAnalysis } from '../lib/slotting'
import { ABC_COLORS } from '../lib/colorModes'
import { useT, type TranslationKey } from '../lib/i18n'

const MOVE_LIMIT = 50
const CONSOLIDATION_LIMIT = 25

/** Meters, switched to kilometres once the number stops being readable in meters. */
function fmtM(m: number): string {
  return m >= 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function Tile({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-panel2 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-base font-semibold ${danger ? 'text-danger' : ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  )
}

function ClassBar({ abc, pct, right }: { abc: AbcClass; pct: number; right: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold" style={{ color: ABC_COLORS[abc] }}>
          {abc}
        </span>
        <span className="text-muted">{right}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-bg">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, pct * 100)}%`, background: ABC_COLORS[abc] }}
        />
      </div>
    </div>
  )
}

export function Slotting() {
  const layout = useWarehouseStore((s) => s.layout)
  const items = useStockStore((s) => s.items)
  const stockIndex = useStockStore((s) => s.index)
  const report = usePickReportStore((s) => s.report)
  const addParsed = usePickReportStore((s) => s.addParsed)
  const clearReport = usePickReportStore((s) => s.clearReport)
  const setShow = useEditorStore((s) => s.setShowSlotting)
  const setSuggestedSlots = useEditorStore((s) => s.setSuggestedSlots)
  const selectRack = useEditorStore((s) => s.selectRack)
  const selectSlot = useEditorStore((s) => s.selectSlot)
  const setColorMode = useEditorStore((s) => s.setColorMode)
  const showToast = useEditorStore((s) => s.showToast)
  const t = useT()

  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const { rows } = await parseStockFile(file)
      const parsed = parsePickReport(rows)
      addParsed(parsed, file.name)
      showToast(
        t('slotting.toast.loaded', {
          kind: t(`slotting.kind.${parsed.kind}` as TranslationKey),
          n: parsed.kind === 'symbol' ? parsed.stats.length : parsed.groups.length,
        }),
      )
    } catch (err) {
      showToast(
        t('slotting.toast.failed', { msg: err instanceof Error ? err.message : String(err) }),
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const analysis = useMemo<SlottingAnalysis | null>(() => {
    if (!report || items.length === 0) return null
    return analyzeSlotting(layout, items, stockIndex, report, {
      moveLimit: MOVE_LIMIT,
      consolidationLimit: CONSOLIDATION_LIMIT,
    })
  }, [layout, items, stockIndex, report])

  // Highlight the proposed target slots in 3D, green like the put-away suggestions.
  useEffect(() => {
    if (!analysis) return
    setSuggestedSlots(new Set(analysis.moves.map((m) => `${m.to.rackId}:${m.to.slotKey}`)))
  }, [analysis, setSuggestedSlots])

  const classCounts = useMemo(() => (report ? countByClass(report) : null), [report])
  const classLines = useMemo(() => (report ? linesByClass(report) : null), [report])

  const close = () => setShow(false)
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="flex max-h-[88vh] w-[820px] flex-col rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('slotting.title')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={close}>
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-accent" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? t('slotting.loading') : t('slotting.pickFile')}
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" hidden onChange={onFile} />
          {report && (
            <>
              <span className="truncate text-[11px] text-muted">{report.fileNames.join(' · ')}</span>
              <button className="btn ml-auto" onClick={clearReport}>
                {t('slotting.clear')}
              </button>
            </>
          )}
        </div>

        {!report && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted">{t('slotting.help')}</p>
        )}

        {report && classCounts && classLines && (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            {/* What the report itself says, with or without a warehouse to match it to. */}
            <div className="grid grid-cols-4 gap-2">
              <Tile
                label={t('slotting.reportSkus')}
                value={String(Object.keys(report.stats).length)}
                sub={report.groups.length > 0 ? t('slotting.groups', { n: report.groups.length }) : undefined}
              />
              <Tile
                label={t('slotting.lines')}
                value={report.totalLines.toLocaleString()}
                sub={
                  report.from && report.to
                    ? t('slotting.period', { from: report.from, to: report.to })
                    : undefined
                }
              />
              <Tile
                label={t('slotting.classA')}
                value={`${classCounts.A} · ${pct(report.totalLines > 0 ? classLines.A / report.totalLines : 0)}`}
                sub={t('slotting.classSub')}
              />
              <Tile
                label={t('slotting.classC')}
                value={`${classCounts.C} · ${pct(report.totalLines > 0 ? classLines.C / report.totalLines : 0)}`}
                sub={t('slotting.classSub')}
              />
            </div>

            {items.length === 0 && (
              <div className="mt-3 rounded-md border border-border bg-panel2 p-3 text-center text-[11px] text-warn">
                {t('slotting.needStock')}
              </div>
            )}

            {analysis && (
              <>
                {/* Effort and the headline saving. */}
                <div className="panel-title mt-4 mb-1.5">{t('slotting.effort')}</div>
                <div className="grid grid-cols-4 gap-2">
                  <Tile
                    label={t('slotting.coverage')}
                    value={pct(
                      analysis.locatedLines + analysis.unlocatedLines > 0
                        ? analysis.locatedLines / (analysis.locatedLines + analysis.unlocatedLines)
                        : 0,
                    )}
                    sub={t('slotting.coverageSub', {
                      skus: analysis.locatedSkus,
                      total: analysis.reportSkus,
                    })}
                    danger={analysis.locatedLines === 0}
                  />
                  <Tile
                    label={t('slotting.current')}
                    value={fmtM(analysis.currentEffortM)}
                    sub={t('slotting.origin', {
                      kind: t(`slotting.origin.${analysis.origin.kind}` as TranslationKey),
                      label: analysis.origin.label ?? '—',
                    })}
                  />
                  <Tile label={t('slotting.planned')} value={fmtM(analysis.plannedEffortM)} />
                  <Tile
                    label={t('slotting.saving')}
                    value={fmtM(analysis.savedM)}
                    sub={pct(analysis.savedPct)}
                  />
                </div>

                {/* Where each class sits today. */}
                <div className="panel-title mt-4 mb-1.5">
                  {t('slotting.placement', { m: Math.round(analysis.goldenThresholdM) })}
                </div>
                <div className="flex flex-col gap-2.5">
                  {analysis.byClass.map((c) => (
                    <ClassBar
                      key={c.abc}
                      abc={c.abc}
                      pct={c.lines > 0 ? c.goldenLines / c.lines : 0}
                      right={t('slotting.placementSub', {
                        pct: pct(c.lines > 0 ? c.goldenLines / c.lines : 0),
                        avg: Math.round(c.avgCostM),
                        lines: Math.round(c.lines).toLocaleString(),
                      })}
                    />
                  ))}
                </div>

                {/* The plan. */}
                <div className="panel-title mt-4 mb-1.5 flex items-center justify-between">
                  <span>{t('slotting.moves', { n: analysis.moves.length })}</span>
                  {analysis.moves.length > 0 && (
                    <button
                      className="btn !py-0.5 !text-[10px]"
                      onClick={() => downloadCsv('reslotting.csv', movesToCsv(analysis.moves))}
                    >
                      {t('slotting.exportCsv')}
                    </button>
                  )}
                </div>
                {analysis.moves.length === 0 ? (
                  <div className="rounded-md border border-border bg-panel2 p-3 text-center text-[11px] text-muted">
                    {t('slotting.movesNone')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {analysis.moves.map((m) => (
                      <button
                        key={`${m.symbol}:${m.from.rackCode}:${m.from.slotKey}`}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-border bg-panel2 px-2 py-1.5 text-left hover:border-accent/50"
                        onClick={() => {
                          setColorMode('demand')
                          selectRack(m.to.rackId)
                          selectSlot(m.to.slotKey)
                        }}
                      >
                        <span
                          className="rounded px-1 text-[10px] font-bold text-bg"
                          style={{ background: ABC_COLORS[m.abc] }}
                        >
                          {m.abc}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">
                            {m.symbol} <span className="text-muted">{m.name}</span>
                          </span>
                          <span className="block truncate text-[10px] text-muted">
                            {m.from.rackCode} {m.from.label} → {m.to.rackCode} {m.to.label} ·{' '}
                            {t(`slotting.kind.${m.kind}` as TranslationKey)}
                            {m.displaces.length > 0 &&
                              ` (${m.displaces.map((d) => d.symbol).join(', ')})`}{' '}
                            · {t('slotting.movePicks', { n: Math.round(m.lines).toLocaleString() })}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-ok">
                          −{fmtM(m.savedM)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Twins: one product, several symbols, several addresses. */}
                {analysis.consolidation.length > 0 && (
                  <>
                    <div className="panel-title mt-4 mb-1.5">{t('slotting.twins')}</div>
                    <div className="flex flex-col gap-1">
                      {analysis.consolidation.map((c) => (
                        <div
                          key={c.name}
                          className="rounded-md border border-border bg-panel2 px-2 py-1.5 text-[11px]"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-medium">{c.name}</span>
                            <span className={c.split ? 'shrink-0 text-warn' : 'shrink-0 text-muted'}>
                              {c.split
                                ? t('slotting.twinSplit', { n: c.distinctRacks })
                                : t('slotting.twinSame')}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted">
                            {c.symbols
                              .map(
                                (s) =>
                                  `${s.symbol} (${s.lines}${s.addresses.length ? ` · ${s.addresses.join(' ')}` : ''})`,
                              )
                              .join('  ·  ')}
                            {c.confusion !== 'none' && (
                              <span className={c.confusion === 'high' ? 'text-danger' : 'text-warn'}>
                                {' '}
                                · {t(`slotting.confusion.${c.confusion}` as TranslationKey)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <p className="mt-3 text-[10px] leading-relaxed text-muted">{t('slotting.note')}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
