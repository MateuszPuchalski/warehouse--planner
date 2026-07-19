import { useRef } from 'react'
import { useStore } from 'zustand'
import type { ColorMode } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { undo, redo } from '../lib/editorActions'
import { exportLayoutFile, importLayoutFile } from '../lib/persistence'
import { useI18nStore, useT, type Lang } from '../lib/i18n'

export function TopBar() {
  const layoutName = useWarehouseStore((s) => s.layout.name)
  const setLayoutName = useWarehouseStore((s) => s.setLayoutName)
  const replaceLayout = useWarehouseStore((s) => s.replaceLayout)
  const colorMode = useEditorStore((s) => s.colorMode)
  const setColorMode = useEditorStore((s) => s.setColorMode)
  const setShowPresetManager = useEditorStore((s) => s.setShowPresetManager)
  const setShowSubiektImport = useEditorStore((s) => s.setShowSubiektImport)
  const showToast = useEditorStore((s) => s.showToast)
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  const t = useT()

  const canUndo = useStore(useWarehouseStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useWarehouseStore.temporal, (s) => s.futureStates.length > 0)

  const fileRef = useRef<HTMLInputElement>(null)

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const layout = await importLayoutFile(file)
      replaceLayout(layout)
      showToast(t('toast.imported', { name: layout.name }))
    } catch (err) {
      showToast(
        t('toast.importFailed', { msg: err instanceof Error ? err.message : String(err) }),
        'error',
      )
    }
  }

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
      <span className="text-sm font-semibold tracking-wide whitespace-nowrap text-accent">
        📦 {t('app.title')}
      </span>
      <input
        value={layoutName}
        onChange={(e) => setLayoutName(e.target.value)}
        className="field max-w-52"
        aria-label={t('top.layoutName')}
      />

      <div className="ml-auto flex items-center gap-1.5">
        <button className="btn" onClick={undo} disabled={!canUndo} title={t('top.undoTip')}>
          ↩ {t('top.undo')}
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} title={t('top.redoTip')}>
          ↪ {t('top.redo')}
        </button>

        <span className="mx-1 h-5 w-px bg-border" />

        <label className="flex items-center gap-1 text-xs text-muted">
          {t('top.color')}
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="field w-32"
          >
            <option value="status">{t('top.color.status')}</option>
            <option value="utilization">{t('top.color.utilization')}</option>
            <option value="volume">{t('top.color.volume')}</option>
            <option value="stock">{t('top.color.stock')}</option>
            <option value="none">{t('top.color.none')}</option>
          </select>
        </label>

        <span className="mx-1 h-5 w-px bg-border" />

        <button className="btn btn-accent" onClick={() => setShowSubiektImport(true)}>
          {t('top.subiekt')}
        </button>
        <button className="btn" onClick={() => setShowPresetManager(true)}>
          {t('top.presets')}
        </button>
        <button className="btn" onClick={() => exportLayoutFile(useWarehouseStore.getState().layout)}>
          {t('top.export')}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          {t('top.import')}
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImportFile} />

        <span className="mx-1 h-5 w-px bg-border" />

        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="field w-16"
          aria-label={t('top.language')}
          title={t('top.language')}
        >
          <option value="en">EN</option>
          <option value="pl">PL</option>
        </select>
      </div>
    </header>
  )
}
