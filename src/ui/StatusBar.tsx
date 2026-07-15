import { useMemo } from 'react'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { validateAisles } from '../lib/collision'
import { useT, type TranslationKey } from '../lib/i18n'

export function StatusBar() {
  const layout = useWarehouseStore((s) => s.layout)
  const pointer = useEditorStore((s) => s.pointer)
  const mode = useEditorStore((s) => s.mode)
  const selectRack = useEditorStore((s) => s.selectRack)
  const t = useT()

  const violations = useMemo(() => validateAisles(layout), [layout])
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
      <span>
        {t('sb.mode')}: {t(`mode.${mode}` as TranslationKey)}
      </span>
      <span className="ml-auto hidden lg:inline">{t('sb.hints')}</span>
    </footer>
  )
}
