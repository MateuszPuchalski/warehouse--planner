import { useMemo } from 'react'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { useStockStore } from '../store/useStockStore'
import { validateAisles } from '../lib/collision'
import { countOverVolume } from '../lib/rackGeometry'
import { useT, type TranslationKey } from '../lib/i18n'

export function StatusBar() {
  const layout = useWarehouseStore((s) => s.layout)
  const stockIndex = useStockStore((s) => s.index)
  const stockSource = useStockStore((s) => s.source)
  const importedAt = useStockStore((s) => s.importedAt)
  const stockCount = useStockStore((s) => s.items.length)
  const syncError = useStockStore((s) => s.syncError)
  const pointer = useEditorStore((s) => s.pointer)
  const mode = useEditorStore((s) => s.mode)
  const selectRack = useEditorStore((s) => s.selectRack)
  const t = useT()

  const violations = useMemo(() => validateAisles(layout), [layout])
  const overVolume = useMemo(
    () =>
      Object.values(layout.racks).reduce((sum, r) => {
        const tpl = layout.templates[r.templateId]
        return sum + (tpl ? countOverVolume(tpl, r, r.code ? stockIndex[r.code] : undefined) : 0)
      }, 0),
    [layout, stockIndex],
  )
  const rackCount = Object.keys(layout.racks).length
  const wallCount = Object.keys(layout.walls).length
  const slotCount = useMemo(
    () =>
      Object.values(layout.racks).reduce((sum, r) => {
        const tpl = layout.templates[r.templateId]
        return sum + (tpl ? tpl.bays * tpl.levels : 0)
      }, 0),
    [layout],
  )

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-panel px-3 text-[11px] text-muted">
      <span className="w-32">
        {pointer ? `x ${pointer.x.toFixed(1)} m · z ${pointer.z.toFixed(1)} m` : '—'}
      </span>
      <span>
        {t('sb.counts', { racks: rackCount, slots: slotCount })}
        {wallCount > 0 && ` ${t('sb.walls', { n: wallCount })}`}
      </span>
      {violations.length > 0 ? (
        <button
          className="cursor-pointer font-medium text-danger hover:underline"
          onClick={() => selectRack(violations[0].rackA)}
          title={t('sb.warningsTip')}
        >
          {t('sb.warnings', { n: violations.length })}
        </button>
      ) : (
        <span className="text-ok">{t('sb.aislesOk')}</span>
      )}
      {overVolume > 0 && <span className="font-medium text-danger">{t('sb.overVolume', { n: overVolume })}</span>}
      <span>
        {t('sb.mode')}: {t(`mode.${mode}` as TranslationKey)}
      </span>
      {syncError ? (
        <span className="font-medium text-danger" title={syncError}>
          {t('sb.stockErr')}
        </span>
      ) : (
        stockSource &&
        importedAt && (
          <span className={stockSource === 'bridge' ? 'text-ok' : undefined}>
            {t('sb.stock', {
              src: t(stockSource === 'bridge' ? 'sb.srcBridge' : 'sb.srcFile'),
              at: new Date(importedAt).toLocaleTimeString(),
              n: stockCount,
            })}
          </span>
        )
      )}
      <span className="ml-auto hidden lg:inline">{t('sb.hints')}</span>
    </footer>
  )
}
