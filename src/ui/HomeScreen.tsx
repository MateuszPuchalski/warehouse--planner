import { useRef, useState } from 'react'
import type { WarehouseLayout } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import {
  deletePreset,
  importLayoutFile,
  listPresets,
  newBlankLayout,
  validateLayout,
} from '../lib/persistence'
import { buildSampleWarehouse } from '../lib/sampleWarehouse'
import { useT, t as tNow } from '../lib/i18n'

function layoutMeta(layout: WarehouseLayout, t: ReturnType<typeof useT>): string {
  return `${t('home.meta', {
    racks: Object.keys(layout.racks).length,
    templates: Object.keys(layout.templates).length,
  })} · ${new Date(layout.updatedAt).toLocaleString()}`
}

export function HomeScreen() {
  const current = useWarehouseStore((s) => s.layout)
  const replaceLayout = useWarehouseStore((s) => s.replaceLayout)
  const setView = useEditorStore((s) => s.setView)
  const showToast = useEditorStore((s) => s.showToast)
  const t = useT()

  const [presets, setPresets] = useState(() => listPresets())
  const fileRef = useRef<HTMLInputElement>(null)

  /** Load a fresh layout and enter the editor with a clean undo history. */
  const open = (layout: WarehouseLayout) => {
    replaceLayout(layout)
    useWarehouseStore.temporal.getState().clear()
    setView('editor')
  }

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      open(await importLayoutFile(file))
    } catch (err) {
      showToast(t('toast.importFailed', { msg: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }

  const entries = Object.entries(presets).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-bg text-text">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('home.title')}</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            className="flex flex-col items-start rounded-lg border border-accent/50 bg-accent/10 p-4 text-left transition-colors hover:border-accent"
            onClick={() => open(newBlankLayout(tNow('home.newName')))}
          >
            <span className="text-base font-semibold text-accent">{t('home.new')}</span>
            <span className="mt-1 text-[11px] text-muted">{t('home.newDesc')}</span>
          </button>

          <button
            className="flex flex-col items-start rounded-lg border border-border bg-panel2 p-4 text-left transition-colors hover:border-accent/50"
            onClick={() => setView('editor')}
          >
            <span className="text-base font-semibold">{t('home.continue')}</span>
            <span className="mt-1 truncate text-[11px] text-muted">{current.name}</span>
            <span className="text-[10px] text-muted">{layoutMeta(current, t)}</span>
          </button>

          <button
            className="flex flex-col items-start rounded-lg border border-border bg-panel2 p-4 text-left transition-colors hover:border-accent/50"
            onClick={() => fileRef.current?.click()}
          >
            <span className="text-base font-semibold">{t('home.import')}</span>
            <span className="mt-1 text-[11px] text-muted">{t('home.importDesc')}</span>
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImport} />
        </div>

        <div className="mt-8">
          <div className="panel-title mb-2">{t('home.builtin')}</div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel2 p-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{t('preset.sampleName')}</div>
              <div className="text-[11px] leading-snug text-muted">{t('preset.sampleDesc')}</div>
            </div>
            <button className="btn btn-accent shrink-0" onClick={() => open(validateLayout(buildSampleWarehouse()))}>
              {t('home.open')}
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="panel-title mb-2">{t('home.saved')}</div>
          {entries.length === 0 ? (
            <div className="rounded-lg border border-border bg-panel2 p-4 text-center text-xs text-muted">
              {t('home.savedEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {entries.map(([name, preset]) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel2 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className="text-[10px] text-muted">{layoutMeta(preset, t)}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="btn btn-accent !px-2 !py-1"
                      onClick={() => open(validateLayout(structuredClone(preset)))}
                    >
                      {t('home.open')}
                    </button>
                    <button
                      className="btn btn-danger !px-1.5 !py-1"
                      onClick={() => {
                        deletePreset(name)
                        setPresets(listPresets())
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
