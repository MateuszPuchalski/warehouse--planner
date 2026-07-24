import { useState } from 'react'
import type { RackTemplate, SlotRole } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { newId } from '../lib/ids'
import { deriveLevelRole } from '../lib/rackGeometry'
import { ROLE_COLORS } from '../lib/colorModes'
import { saveTemplateToLibrary } from '../lib/persistence'
import { t as tNow, useT } from '../lib/i18n'

/** Quick-fill heights (m) for the two common shelf archetypes. */
const PALLET_H = 1.5
const NARROW_H = 0.4

function clampInt(v: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, v)))
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Grow/shrink an array to length n, padding new entries with `fill`. */
function resizeTo<T>(arr: T[], n: number, fill: T): T[] {
  if (n === arr.length) return arr
  if (n < arr.length) return arr.slice(0, n)
  return [...arr, ...Array.from({ length: n - arr.length }, () => fill)]
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
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
 * levels bottom→top with their real proportional heights, tinted by operational
 * role (pallet position vs picking face) so mixed racks are visible at a glance.
 */
function RackPreview({
  bays,
  bayWidth,
  heights,
  roles,
  uprightSize,
}: {
  bays: number
  bayWidth: number
  heights: number[]
  roles: SlotRole[]
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
        const color = ROLE_COLORS[roles[l] ?? 'pick']
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
                fill={color}
                fillOpacity={0.18}
                stroke={color}
                strokeOpacity={0.5}
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

/** Small colored legend swatch + label for a role. */
function RoleSwatch({ role, label }: { role: SlotRole; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ROLE_COLORS[role] }} />
      {label}
    </span>
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
  const initialHeights = existing?.levelHeights ?? Array.from({ length: draft.levels }, () => draft.levelHeight)
  const [heights, setHeights] = useState<number[]>(() => initialHeights)
  // Per-level role, defaulted from height and overridable. Kept length-synced with the level count.
  const [roles, setRoles] = useState<SlotRole[]>(() =>
    existing?.levelRoles && existing.levelRoles.length === draft.levels
      ? existing.levelRoles
      : initialHeights.map(deriveLevelRole),
  )

  if (editingId === null) return null

  const usedBy = Object.values(racks).filter((r) => r.templateId === draft.id).length
  const patch = (p: Partial<RackTemplate>) => setDraft((d) => ({ ...d, ...p }))

  const effectiveLevels = variable ? heights.length : draft.levels
  const previewHeights = variable ? heights : Array.from({ length: draft.levels }, () => draft.levelHeight)
  const totalHeight = previewHeights.reduce((a, b) => a + b, 0)
  const uniformRole: SlotRole = roles[0] ?? 'pick'

  const setLevelCount = (n: number) => {
    const count = clampInt(n, 1, 20)
    patch({ levels: count })
    const fillH = variable ? (heights[heights.length - 1] ?? draft.levelHeight) : draft.levelHeight
    if (variable) setHeights((h) => resizeTo(h, count, fillH))
    setRoles((r) => resizeTo(r, count, deriveLevelRole(fillH)))
  }

  const toggleVariable = (on: boolean) => {
    if (on) {
      setHeights(resizeTo(heights, draft.levels, draft.levelHeight))
      setRoles(resizeTo(roles, draft.levels, deriveLevelRole(draft.levelHeight)))
    }
    setVariable(on)
  }

  // Changing a level's height re-derives its role unless the user overrode it.
  const setHeightAt = (i: number, v: number) => {
    const nv = clampNum(v, 0.1, 4)
    setRoles((r) => r.map((role, idx) => (idx === i && role === deriveLevelRole(heights[i]) ? deriveLevelRole(nv) : role)))
    setHeights((h) => h.map((prev, idx) => (idx === i ? nv : prev)))
  }

  const setUniformHeight = (v: number) => {
    const nv = clampNum(v, 0.1, 4)
    const old = draft.levelHeight
    setRoles((r) => (r.every((role) => role === deriveLevelRole(old)) ? r.map(() => deriveLevelRole(nv)) : r))
    patch({ levelHeight: nv })
  }

  const setRoleAt = (i: number, role: SlotRole) => setRoles((r) => r.map((x, idx) => (idx === i ? role : x)))
  const setUniformRole = (role: SlotRole) => setRoles((r) => r.map(() => role))

  /** Assemble the template, storing levelRoles only when it diverges from the height default. */
  const commit = (): RackTemplate => {
    const levels = variable ? heights.length : draft.levels
    const levelHeights = variable ? [...heights] : undefined
    const effRoles = roles.slice(0, levels)
    const derived = previewHeights.map(deriveLevelRole)
    const levelRoles = arraysEqual(effRoles, derived) ? undefined : effRoles
    return { ...draft, name: draft.name.trim(), levels, levelHeights, levelRoles }
  }

  const save = () => {
    if (!draft.name.trim()) {
      showToast(t('toast.templateNeedsName'), 'error')
      return
    }
    if (variable && heights.some((h) => !Number.isFinite(h) || h <= 0)) {
      showToast(t('toast.levelHeightsBad'), 'error')
      return
    }
    upsertTemplate(commit())
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
              <RackPreview bays={draft.bays} bayWidth={draft.bayWidth} heights={previewHeights} roles={roles} uprightSize={draft.uprightSize} />
            </div>
            <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-muted">
              <RoleSwatch role="pallet" label={t('tpl.role.pallet')} />
              <RoleSwatch role="pick" label={t('tpl.role.pick')} />
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
              <input type="number" className="field w-20 text-right" value={draft.bayWidth} min={0.1} max={6} step={0.05}
                onChange={(e) => patch({ bayWidth: clampNum(Number(e.target.value) || 0.1, 0.1, 6) })} />
            </Row>

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={variable} onChange={(e) => toggleVariable(e.target.checked)} />
              <span className="text-muted">{t('tpl.variableHeights')}</span>
            </label>

            {!variable ? (
              <>
                <Row label={t('tpl.levelHeight')}>
                  <input type="number" className="field w-20 text-right" value={draft.levelHeight} min={0.1} max={4} step={0.1}
                    onChange={(e) => setUniformHeight(Number(e.target.value) || 0.1)} />
                </Row>
                <Row label={t('tpl.function')}>
                  <div className="flex gap-1">
                    <button className={`btn !py-0.5 ${uniformRole === 'pallet' ? 'btn-accent' : ''}`} onClick={() => setUniformRole('pallet')}>
                      {t('tpl.role.pallet')}
                    </button>
                    <button className={`btn !py-0.5 ${uniformRole === 'pick' ? 'btn-accent' : ''}`} onClick={() => setUniformRole('pick')}>
                      {t('tpl.role.pick')}
                    </button>
                  </div>
                </Row>
              </>
            ) : (
              <div className="flex flex-col gap-1 rounded-md border border-border bg-bg/40 p-2">
                <div className="mb-0.5 text-[11px] text-muted">{t('tpl.variableHeightsHint')}</div>
                {/* Top level first, to match the physical layout. */}
                {heights.map((_, l) => l).reverse().map((l) => (
                  <div key={l} className="flex items-center gap-1.5 text-xs">
                    <span className="w-5 text-muted">{t('tpl.levelTag', { n: l + 1 })}</span>
                    <input
                      type="number"
                      className="field w-16 text-right"
                      value={heights[l]}
                      min={0.1}
                      max={4}
                      step={0.05}
                      onChange={(e) => setHeightAt(l, Number(e.target.value) || 0.1)}
                    />
                    <button className="btn !px-1.5 !py-0.5" title={t('tpl.presetPallet')} onClick={() => setHeightAt(l, PALLET_H)}>{PALLET_H} m</button>
                    <button className="btn !px-1.5 !py-0.5" title={t('tpl.presetNarrow')} onClick={() => setHeightAt(l, NARROW_H)}>{NARROW_H} m</button>
                    <button
                      className="ml-auto flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] transition-colors hover:bg-border/60"
                      title={t('tpl.function')}
                      onClick={() => setRoleAt(l, roles[l] === 'pallet' ? 'pick' : 'pallet')}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ROLE_COLORS[roles[l] ?? 'pick'] }} />
                      {roles[l] === 'pallet' ? t('tpl.role.pallet') : t('tpl.role.pick')}
                    </button>
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
              const tpl = commit()
              saveTemplateToLibrary(tpl)
              showToast(t('toast.savedToLibrary', { name: tpl.name }))
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
