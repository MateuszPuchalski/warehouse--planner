import { useState } from 'react'
import type { RackTemplate } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { newId } from '../lib/ids'
import { saveTemplateToLibrary } from '../lib/persistence'
import { t as tNow, useT } from '../lib/i18n'

/** Quick-fill heights (m) for the two common shelf archetypes. */
const PALLET_H = 1.5
const NARROW_H = 0.4
/** A level at least this tall reads as a pallet bay in the preview. */
const PALLET_THRESHOLD = 1.2

function clampInt(v: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, v)))
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Grow/shrink a heights array to length n, padding new entries with `fill`. */
function resizeHeights(heights: number[], n: number, fill: number): number[] {
  if (n === heights.length) return heights
  if (n < heights.length) return heights.slice(0, n)
  return [...heights, ...Array.from({ length: n - heights.length }, () => fill)]
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  )
}

/**
 * Scale-to-fit SVG front elevation of the rack being built. Bays run left→right,
 * levels bottom→top with their real proportional heights, so variable-height
 * layouts (e.g. tall pallet bays over narrow shelves) are visible at a glance.
 */
function RackPreview({
  bays,
  bayWidth,
  heights,
  uprightSize,
}: {
  bays: number
  bayWidth: number
  heights: number[]
  uprightSize: number
}) {
  const t = useT()
  const structW = bays * bayWidth
  const totalH = heights.reduce((a, b) => a + b, 0)
  if (structW <= 0 || totalH <= 0) return null

  const GUTTER = 34 // left label column (px)
  const PAD = 12
  const MAXW = 210
  const MAXH = 380
  const scale = Math.min((MAXW - GUTTER - PAD) / structW, (MAXH - 2 * PAD) / totalH)

  const bodyW = structW * scale
  const bodyH = totalH * scale
  const svgW = GUTTER + bodyW + PAD
  const svgH = bodyH + 2 * PAD
  const x0 = GUTTER
  const y0 = PAD

  // Cumulative bottoms, bottom → top.
  const offsets = [0]
  for (const h of heights) offsets.push(offsets[offsets.length - 1] + h)

  const upright = Math.max(2, uprightSize * scale)
  const steel = '#5a6474'

  return (
    <svg width={svgW} height={svgH} className="select-none" role="img">
      {heights.map((h, l) => {
        const levelH = h * scale
        const yTop = y0 + (totalH - offsets[l + 1]) * scale
        const pallet = h >= PALLET_THRESHOLD
        return (
          <g key={l}>
            {/* height / level label in the gutter */}
            <text x={GUTTER - 6} y={yTop + levelH / 2 + 3} textAnchor="end" fontSize={9} fill="#8b93a3">
              {t('tpl.levelTag', { n: heights.length - l })} · {h.toFixed(2)}
            </text>
            {Array.from({ length: bays }, (_, b) => (
              <rect
                key={b}
                x={x0 + b * bayWidth * scale + 1}
                y={yTop + 1}
                width={Math.max(1, bayWidth * scale - 2)}
                height={Math.max(1, levelH - 2)}
                rx={1.5}
                fill={pallet ? 'rgba(76,154,255,0.16)' : '#1e222a'}
                stroke={pallet ? 'rgba(76,154,255,0.45)' : '#2a2f3a'}
                strokeWidth={1}
              />
            ))}
          </g>
        )
      })}
      {/* uprights over the bay boundaries */}
      {Array.from({ length: bays + 1 }, (_, i) => (
        <rect key={i} x={x0 + i * bayWidth * scale - upright / 2} y={y0} width={upright} height={bodyH} fill={steel} rx={1} />
      ))}
      {/* floor line */}
      <rect x={x0 - 2} y={y0 + bodyH} width={bodyW + 4} height={2.5} fill={steel} rx={1} />
    </svg>
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

  // Per-level heights are held separately and only committed when the toggle is on.
  const [variable, setVariable] = useState(() => !!existing?.levelHeights)
  const [heights, setHeights] = useState<number[]>(
    () => existing?.levelHeights ?? Array.from({ length: draft.levels }, () => draft.levelHeight),
  )

  if (editingId === null) return null

  const usedBy = Object.values(racks).filter((r) => r.templateId === draft.id).length
  const patch = (p: Partial<RackTemplate>) => setDraft((d) => ({ ...d, ...p }))

  const effectiveLevels = variable ? heights.length : draft.levels
  const previewHeights = variable ? heights : Array.from({ length: draft.levels }, () => draft.levelHeight)
  const totalHeight = previewHeights.reduce((a, b) => a + b, 0)

  const setLevelCount = (n: number) => {
    const count = clampInt(n, 1, 20)
    patch({ levels: count })
    if (variable) setHeights((h) => resizeHeights(h, count, h[h.length - 1] ?? draft.levelHeight))
  }

  const toggleVariable = (on: boolean) => {
    if (on) setHeights(resizeHeights(heights, draft.levels, draft.levelHeight))
    setVariable(on)
  }

  const setHeightAt = (i: number, v: number) =>
    setHeights((h) => h.map((prev, idx) => (idx === i ? clampNum(v, 0.1, 4) : prev)))

  const save = () => {
    if (!draft.name.trim()) {
      showToast(t('toast.templateNeedsName'), 'error')
      return
    }
    if (variable && heights.some((h) => !Number.isFinite(h) || h <= 0)) {
      showToast(t('toast.levelHeightsBad'), 'error')
      return
    }
    upsertTemplate({
      ...draft,
      name: draft.name.trim(),
      levels: variable ? heights.length : draft.levels,
      levelHeights: variable ? [...heights] : undefined,
    })
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
        className="flex max-h-[88vh] w-[620px] flex-col rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{existing ? t('tpl.edit') : t('tpl.new')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={() => openTemplateEditor(null)}>
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[232px_1fr] gap-4">
          {/* Live preview */}
          <div className="flex flex-col rounded-md border border-border bg-panel2 p-2">
            <div className="panel-title mb-1">{t('tpl.preview')}</div>
            <div className="flex flex-1 items-center justify-center overflow-auto">
              <RackPreview bays={draft.bays} bayWidth={draft.bayWidth} heights={previewHeights} uprightSize={draft.uprightSize} />
            </div>
            <div className="mt-1 text-center text-[11px] text-muted">
              {t('tpl.slots', { n: draft.bays * effectiveLevels })} · {t('tpl.totalHeight')} {totalHeight.toFixed(2)} m
            </div>
          </div>

          {/* Form */}
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
            <Row label={t('tpl.name')}>
              <input className="field w-44" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </Row>
            <Row label={t('tpl.bays')}>
              <input type="number" className="field w-20 text-right" value={draft.bays} min={1} max={12} step={1}
                onChange={(e) => patch({ bays: clampInt(Number(e.target.value) || 1, 1, 12) })} />
            </Row>
            <Row label={t('tpl.levels')}>
              <input type="number" className="field w-20 text-right" value={effectiveLevels} min={1} max={20} step={1}
                onChange={(e) => setLevelCount(Number(e.target.value) || 1)} />
            </Row>
            <Row label={t('tpl.bayWidth')}>
              <input type="number" className="field w-20 text-right" value={draft.bayWidth} min={0.5} max={6} step={0.1}
                onChange={(e) => patch({ bayWidth: clampNum(Number(e.target.value) || 0.5, 0.5, 6) })} />
            </Row>

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={variable} onChange={(e) => toggleVariable(e.target.checked)} />
              <span className="text-muted">{t('tpl.variableHeights')}</span>
            </label>

            {!variable ? (
              <Row label={t('tpl.levelHeight')}>
                <input type="number" className="field w-20 text-right" value={draft.levelHeight} min={0.1} max={4} step={0.1}
                  onChange={(e) => patch({ levelHeight: clampNum(Number(e.target.value) || 0.1, 0.1, 4) })} />
              </Row>
            ) : (
              <div className="flex flex-col gap-1 rounded-md border border-border bg-bg/40 p-2">
                <div className="mb-0.5 text-[11px] text-muted">{t('tpl.variableHeightsHint')}</div>
                {/* Top level first, to match the physical layout. */}
                {heights.map((_, l) => l).reverse().map((l) => (
                  <div key={l} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-muted">{t('tpl.levelTag', { n: l + 1 })}</span>
                    <input
                      type="number"
                      className="field w-20 text-right"
                      value={heights[l]}
                      min={0.1}
                      max={4}
                      step={0.05}
                      onChange={(e) => setHeightAt(l, Number(e.target.value) || 0.1)}
                    />
                    <button className="btn !py-0.5" onClick={() => setHeightAt(l, PALLET_H)}>{t('tpl.presetPallet')}</button>
                    <button className="btn !py-0.5" onClick={() => setHeightAt(l, NARROW_H)}>{t('tpl.presetNarrow')}</button>
                  </div>
                ))}
              </div>
            )}

            <Row label={t('tpl.depth')}>
              <input type="number" className="field w-20 text-right" value={draft.depth} min={0.4} max={3} step={0.1}
                onChange={(e) => patch({ depth: clampNum(Number(e.target.value) || 0.4, 0.4, 3) })} />
            </Row>
            <Row label={t('tpl.defaultWeight')}>
              <input type="number" className="field w-20 text-right" value={draft.defaultSlot.maxWeightKg} min={0} step={50}
                onChange={(e) => patch({ defaultSlot: { maxWeightKg: Math.max(0, Number(e.target.value) || 0) } })} />
            </Row>
            <Row label={t('tpl.carrier')}>
              <select
                className="field w-28"
                value={draft.carrier ?? 'auto'}
                onChange={(e) => patch({ carrier: e.target.value === 'auto' ? undefined : (e.target.value as RackTemplate['carrier']) })}
              >
                <option value="auto">{t('tpl.carrier.auto')}</option>
                <option value="pallet">{t('tpl.carrier.pallet')}</option>
                <option value="carton">{t('tpl.carrier.carton')}</option>
                <option value="bin">{t('tpl.carrier.bin')}</option>
              </select>
            </Row>

            <div className="text-[11px] text-muted">
              {(draft.bays * draft.bayWidth + draft.uprightSize).toFixed(2)} × {totalHeight.toFixed(2)} × {draft.depth.toFixed(2)} m
              {existing && usedBy > 0 && <span className="text-warn"> · {t('tpl.affects', { n: usedBy })}</span>}
            </div>
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
              saveTemplateToLibrary({
                ...draft,
                levels: variable ? heights.length : draft.levels,
                levelHeights: variable ? [...heights] : undefined,
              })
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
