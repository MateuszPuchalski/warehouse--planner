import { useState } from 'react'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { deletePreset, listPresets, savePreset, validateLayout } from '../lib/persistence'
import { buildSampleWarehouse } from '../lib/sampleWarehouse'
import { useT } from '../lib/i18n'

export function PresetManager() {
  const layout = useWarehouseStore((s) => s.layout)
  const replaceLayout = useWarehouseStore((s) => s.replaceLayout)
  const setShowPresetManager = useEditorStore((s) => s.setShowPresetManager)
  const showToast = useEditorStore((s) => s.showToast)
  const t = useT()

  const [presets, setPresets] = useState(() => listPresets())
  const [name, setName] = useState(layout.name)

  const close = () => setShowPresetManager(false)

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast(t('toast.presetNeedsName'), 'error')
      return
    }
    savePreset(trimmed, layout)
    setPresets(listPresets())
    showToast(t('toast.presetSaved', { name: trimmed }))
  }

  const entries = Object.entries(presets).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="w-96 rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('preset.title')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={close}>
            ✕
          </button>
        </div>

        <div className="flex gap-1.5">
          <input
            className="field flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('preset.name')}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button className="btn btn-accent" onClick={save}>
            {t('preset.saveCurrent')}
          </button>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {t('preset.builtin')}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel2 px-2 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{t('preset.sampleName')}</div>
              <div className="text-[10px] leading-snug text-muted">{t('preset.sampleDesc')}</div>
            </div>
            <button
              className="btn btn-accent shrink-0 !px-1.5 !py-0.5"
              onClick={() => {
                const sample = buildSampleWarehouse()
                replaceLayout(sample)
                close()
                showToast(t('toast.presetLoaded', { name: sample.name }))
              }}
            >
              {t('preset.load')}
            </button>
          </div>
        </div>

        <div className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {entries.length === 0 && (
            <div className="py-6 text-center text-xs text-muted">{t('preset.empty')}</div>
          )}
          {entries.map(([presetName, preset]) => (
            <div
              key={presetName}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel2 px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{presetName}</div>
                <div className="text-[10px] text-muted">
                  {t('preset.meta', {
                    racks: Object.keys(preset.racks).length,
                    templates: Object.keys(preset.templates).length,
                  })}{' '}
                  · {new Date(preset.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  className="btn btn-accent !px-1.5 !py-0.5"
                  onClick={() => {
                    // Re-validate so presets saved by older versions get new
                    // optional collections (zones, wall openings) defaulted.
                    replaceLayout(validateLayout(structuredClone(preset)))
                    close()
                    showToast(t('toast.presetLoaded', { name: presetName }))
                  }}
                >
                  {t('preset.load')}
                </button>
                <button
                  className="btn btn-danger !px-1.5 !py-0.5"
                  onClick={() => {
                    deletePreset(presetName)
                    setPresets(listPresets())
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-muted">{t('preset.note')}</p>
      </div>
    </div>
  )
}
