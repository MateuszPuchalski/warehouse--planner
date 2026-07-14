import { useState } from 'react'
import type { RackTemplate } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { newId } from '../lib/ids'
import { saveTemplateToLibrary } from '../lib/persistence'
import { t as tNow, useT } from '../lib/i18n'

function clampInt(v: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, v)))
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  )
}

export function TemplateEditor() {
  const editingId = useEditorStore((s) => s.editingTemplateId)
  const openTemplateEditor = useEditorStore((s) => s.openTemplateEditor)
  const showToast = useEditorStore((s) => s.showToast)
  const templates = useWarehouseStore((s) => s.layout.templates)
  const racks = useWarehouseStore((s) => s.layout.racks)
  const upsertTemplate = useWarehouseStore((s) => s.upsertTemplate)
  const deleteTemplate = useWarehouseStore((s) => s.deleteTemplate)
  const t = useT()

  const existing = editingId && editingId !== 'new' ? templates[editingId] : null
  const [draft, setDraft] = useState<RackTemplate>(() =>
    existing
      ? { ...existing, defaultSlot: { ...existing.defaultSlot } }
      : {
          id: newId(),
          name: tNow('tpl.defaultName'),
          bays: 3,
          levels: 4,
          bayWidth: 2.7,
          levelHeight: 1.5,
          depth: 1.1,
          uprightSize: 0.09,
          beamHeight: 0.12,
          defaultSlot: { maxWeightKg: 1000 },
        },
  )

  if (editingId === null) return null

  const usedBy = Object.values(racks).filter((r) => r.templateId === draft.id).length
  const patch = (p: Partial<RackTemplate>) => setDraft((d) => ({ ...d, ...p }))

  const save = () => {
    if (!draft.name.trim()) {
      showToast(t('toast.templateNeedsName'), 'error')
      return
    }
    upsertTemplate({ ...draft, name: draft.name.trim() })
    openTemplateEditor(null)
    showToast(existing ? t('toast.templateUpdated') : t('toast.templateCreated'))
  }

  const remove = () => {
    if (!existing) return
    if (!deleteTemplate(existing.id)) {
      showToast(t('toast.templateInUse', { n: usedBy }), 'error')
      return
    }
    openTemplateEditor(null)
    showToast(t('toast.templateDeleted'))
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={() => openTemplateEditor(null)}>
      <div
        className="w-80 rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{existing ? t('tpl.edit') : t('tpl.new')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={() => openTemplateEditor(null)}>
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <Row label={t('tpl.name')}>
            <input className="field w-44" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </Row>
          <Row label={t('tpl.bays')}>
            <input type="number" className="field w-20 text-right" value={draft.bays} min={1} max={12} step={1}
              onChange={(e) => patch({ bays: clampInt(Number(e.target.value) || 1, 1, 12) })} />
          </Row>
          <Row label={t('tpl.levels')}>
            <input type="number" className="field w-20 text-right" value={draft.levels} min={1} max={12} step={1}
              onChange={(e) => patch({ levels: clampInt(Number(e.target.value) || 1, 1, 12) })} />
          </Row>
          <Row label={t('tpl.bayWidth')}>
            <input type="number" className="field w-20 text-right" value={draft.bayWidth} min={0.5} max={6} step={0.1}
              onChange={(e) => patch({ bayWidth: clampNum(Number(e.target.value) || 0.5, 0.5, 6) })} />
          </Row>
          <Row label={t('tpl.levelHeight')}>
            <input type="number" className="field w-20 text-right" value={draft.levelHeight} min={0.3} max={4} step={0.1}
              onChange={(e) => patch({ levelHeight: clampNum(Number(e.target.value) || 0.3, 0.3, 4) })} />
          </Row>
          <Row label={t('tpl.depth')}>
            <input type="number" className="field w-20 text-right" value={draft.depth} min={0.4} max={3} step={0.1}
              onChange={(e) => patch({ depth: clampNum(Number(e.target.value) || 0.4, 0.4, 3) })} />
          </Row>
          <Row label={t('tpl.defaultWeight')}>
            <input type="number" className="field w-20 text-right" value={draft.defaultSlot.maxWeightKg} min={0} step={50}
              onChange={(e) => patch({ defaultSlot: { maxWeightKg: Math.max(0, Number(e.target.value) || 0) } })} />
          </Row>

          <div className="text-[11px] text-muted">
            {t('tpl.slots', { n: draft.bays * draft.levels })} ·{' '}
            {(draft.bays * draft.bayWidth + draft.uprightSize).toFixed(2)} ×{' '}
            {(draft.levels * draft.levelHeight).toFixed(2)} × {draft.depth.toFixed(2)} m
            {existing && usedBy > 0 && (
              <span className="text-warn"> · {t('tpl.affects', { n: usedBy })}</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          {existing && (
            <button className="btn btn-danger" onClick={remove} disabled={usedBy > 0} title={usedBy > 0 ? t('tpl.inUse') : undefined}>
              {t('tpl.delete')}
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              saveTemplateToLibrary(draft)
              showToast(t('toast.savedToLibrary', { name: draft.name }))
            }}
          >
            {t('tpl.saveLib')}
          </button>
          <button className="btn btn-accent ml-auto" onClick={save}>
            {existing ? t('tpl.save') : t('tpl.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
