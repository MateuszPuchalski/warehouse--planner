import { useState } from 'react'
import type { EditorMode } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { loadTemplateLibrary } from '../lib/persistence'
import { useT, type TranslationKey } from '../lib/i18n'

const MODES: { mode: EditorMode; tkey: TranslationKey; key: string; icon: string }[] = [
  { mode: 'select', tkey: 'tool.select', key: 'V', icon: '◇' },
  { mode: 'place', tkey: 'tool.place', key: 'P', icon: '⊞' },
  { mode: 'delete', tkey: 'tool.delete', key: 'X', icon: '✕' },
]

export function Toolbar() {
  const templates = useWarehouseStore((s) => s.layout.templates)
  const upsertTemplate = useWarehouseStore((s) => s.upsertTemplate)
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)
  const armPlace = useEditorStore((s) => s.armPlace)
  const placingTemplateId = useEditorStore((s) => s.placingTemplateId)
  const openTemplateEditor = useEditorStore((s) => s.openTemplateEditor)
  const showToast = useEditorStore((s) => s.showToast)
  const t = useT()

  const [libOpen, setLibOpen] = useState(false)
  const library = libOpen ? loadTemplateLibrary() : {}

  return (
    <aside className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-panel p-2">
      <div>
        <div className="panel-title mb-1.5 px-1">{t('tool.mode')}</div>
        <div className="grid grid-cols-3 gap-1">
          {MODES.map((m) => (
            <button
              key={m.mode}
              title={`${t(m.tkey)} (${m.key})`}
              onClick={() => (m.mode === 'place' ? armPlace(placingTemplateId ?? Object.keys(templates)[0] ?? '') : setMode(m.mode))}
              className={`btn flex-col !gap-0 py-1.5 ${
                mode === m.mode ? 'border-accent/60 bg-accent/20 text-accent' : ''
              }`}
            >
              <span className="text-base leading-none">{m.icon}</span>
              <span className="text-[10px]">{m.key}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="panel-title mb-1.5 px-1">{t('tool.templates')}</div>
        <div className="flex flex-col gap-1">
          {Object.values(templates).map((tpl) => {
            const armed = mode === 'place' && placingTemplateId === tpl.id
            return (
              <div
                key={tpl.id}
                onClick={() => armPlace(tpl.id)}
                className={`group cursor-pointer rounded-md border p-2 transition-colors ${
                  armed
                    ? 'border-accent/60 bg-accent/15'
                    : 'border-border bg-panel2 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`truncate text-xs font-medium ${armed ? 'text-accent' : ''}`}>
                    {tpl.name}
                  </span>
                  <button
                    className="btn invisible !px-1 !py-0 group-hover:visible"
                    title={t('tool.editTemplate')}
                    onClick={(e) => {
                      e.stopPropagation()
                      openTemplateEditor(tpl.id)
                    }}
                  >
                    ✎
                  </button>
                </div>
                <div className="mt-0.5 text-[10px] text-muted">
                  {t('tool.card', { bays: tpl.bays, levels: tpl.levels })} ·{' '}
                  {(tpl.bays * tpl.bayWidth + tpl.uprightSize).toFixed(1)}×{tpl.depth.toFixed(1)} m
                </div>
              </div>
            )
          })}
        </div>

        <button className="btn mt-2 justify-center" onClick={() => openTemplateEditor('new')}>
          {t('tool.newTemplate')}
        </button>

        <button className="btn mt-1 justify-center" onClick={() => setLibOpen(!libOpen)}>
          {libOpen ? t('tool.hideLibrary') : t('tool.fromLibrary')}
        </button>
        {libOpen && (
          <div className="mt-1 flex flex-col gap-1">
            {Object.values(library).length === 0 && (
              <div className="px-1 text-[11px] text-muted">{t('tool.libraryEmpty')}</div>
            )}
            {Object.values(library).map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between rounded-md border border-border bg-panel2 p-1.5"
              >
                <span className="truncate text-[11px]">{tpl.name}</span>
                <button
                  className="btn !px-1.5 !py-0"
                  onClick={() => {
                    upsertTemplate(tpl)
                    showToast(t('toast.addedFromLibrary', { name: tpl.name }))
                  }}
                >
                  {t('tool.add')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
