import { useMemo } from 'react'
import type { SlotStatus } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { parseSlotKey, rackStats, resolveSlot } from '../lib/rackGeometry'
import { rotateGhostOrSelection, requestDelete } from '../lib/editorActions'
import { wallLengthM } from '../lib/walls'
import { statusLabel, useT } from '../lib/i18n'
import { SlotGrid } from './SlotGrid'

function NumField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          className="field w-20 text-right"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(min !== undefined && v < min ? min : max !== undefined && v > max ? max : v)
          }}
        />
        {suffix && <span className="w-6 text-[10px] text-muted">{suffix}</span>}
      </span>
    </label>
  )
}

function FloorPanel() {
  const floor = useWarehouseStore((s) => s.layout.floor)
  const updateFloor = useWarehouseStore((s) => s.updateFloor)
  const clearRacks = useWarehouseStore((s) => s.clearRacks)
  const buildPerimeterWalls = useWarehouseStore((s) => s.buildPerimeterWalls)
  const clearWalls = useWarehouseStore((s) => s.clearWalls)
  const rackCount = useWarehouseStore((s) => Object.keys(s.layout.racks).length)
  const wallCount = useWarehouseStore((s) => Object.keys(s.layout.walls).length)
  const t = useT()

  return (
    <div className="flex flex-col gap-2">
      <div className="panel-title">{t('floor.title')}</div>
      <NumField label={t('floor.width')} value={floor.widthM} min={5} max={200} step={1} suffix="m" onChange={(v) => updateFloor({ widthM: v })} />
      <NumField label={t('floor.depth')} value={floor.depthM} min={5} max={200} step={1} suffix="m" onChange={(v) => updateFloor({ depthM: v })} />
      <NumField label={t('floor.snap')} value={floor.cellSize} min={0.1} max={2} step={0.1} suffix="m" onChange={(v) => updateFloor({ cellSize: v })} />
      <NumField label={t('floor.minAisle')} value={floor.minAisleWidthM} min={0} max={10} step={0.1} suffix="m" onChange={(v) => updateFloor({ minAisleWidthM: v })} />
      <label className="flex items-center justify-between text-xs">
        <span className="text-muted">{t('floor.showGuides')}</span>
        <input
          type="checkbox"
          checked={floor.showAisleGuides}
          onChange={(e) => updateFloor({ showAisleGuides: e.target.checked })}
        />
      </label>
      <button className="btn btn-danger mt-2 justify-center" onClick={clearRacks} disabled={rackCount === 0}>
        {t('floor.clear', { n: rackCount })}
      </button>

      <div className="mt-3 h-px bg-border" />
      <div className="panel-title mt-1">{t('floor.walls')}</div>
      <NumField label={t('floor.wallHeight')} value={floor.wallHeightM} min={0.5} max={20} step={0.5} suffix="m" onChange={(v) => updateFloor({ wallHeightM: v })} />
      <NumField label={t('floor.wallThickness')} value={floor.wallThicknessM} min={0.05} max={1} step={0.05} suffix="m" onChange={(v) => updateFloor({ wallThicknessM: v })} />
      <button className="btn btn-accent mt-1 justify-center" onClick={buildPerimeterWalls}>
        {t('floor.buildPerimeter')}
      </button>
      <button className="btn btn-danger justify-center" onClick={clearWalls} disabled={wallCount === 0}>
        {t('floor.clearWalls', { n: wallCount })}
      </button>
      <p className="text-[11px] leading-relaxed text-muted">{t('floor.wallsHelp')}</p>

      <p className="text-[11px] leading-relaxed text-muted">{t('floor.help')}</p>
    </div>
  )
}

function WallPanel({ wallId }: { wallId: string }) {
  const wall = useWarehouseStore((s) => s.layout.walls[wallId])
  const cellSize = useWarehouseStore((s) => s.layout.floor.cellSize)
  const updateWall = useWarehouseStore((s) => s.updateWall)
  const deleteWall = useWarehouseStore((s) => s.deleteWall)
  const selectWall = useEditorStore((s) => s.selectWall)
  const t = useT()

  if (!wall) return null

  const remove = () => {
    deleteWall(wallId)
    selectWall(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="panel-title">{t('wall.title')}</div>

      <div className="grid grid-cols-2 gap-1 text-[11px] text-muted">
        <span>
          {t('wall.length')}: {wallLengthM(wall, cellSize).toFixed(2)} m
        </span>
        <span>{wall.perimeter ? t('wall.perimeter') : t('wall.custom')}</span>
      </div>

      <NumField label={t('wall.height')} value={wall.heightM} min={0.5} max={20} step={0.5} suffix="m" onChange={(v) => updateWall(wallId, { heightM: v })} />
      <NumField label={t('wall.thickness')} value={wall.thicknessM} min={0.05} max={1} step={0.05} suffix="m" onChange={(v) => updateWall(wallId, { thicknessM: v })} />

      <button className="btn btn-danger justify-center" onClick={remove} title={t('wall.deleteTip')}>
        {t('wall.delete')}
      </button>
    </div>
  )
}

function SlotEditor({ rackId, slotKey }: { rackId: string; slotKey: string }) {
  const rack = useWarehouseStore((s) => s.layout.racks[rackId])
  const template = useWarehouseStore((s) => (rack ? s.layout.templates[rack.templateId] : undefined))
  const updateSlot = useWarehouseStore((s) => s.updateSlot)
  const resetSlot = useWarehouseStore((s) => s.resetSlot)
  const t = useT()

  const { bay, level } = parseSlotKey(slotKey)
  if (!rack || !template || bay >= template.bays || level >= template.levels) return null
  const slot = resolveSlot(template, rack, bay, level)
  const override = rack.slotOverrides[slotKey] ?? {}

  const STATUSES: SlotStatus[] = ['blocked', 'empty', 'ok', 'warning', 'overweight']

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-panel2 p-2">
      <div className="flex items-center justify-between">
        <span className="panel-title">{t('slot.title', { bay: bay + 1, level: level + 1 })}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {statusLabel(t, slot.status)}
        </span>
      </div>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{t('slot.label')}</span>
        <input
          className="field w-32"
          value={override.label ?? ''}
          placeholder={slot.label}
          onChange={(e) => updateSlot(rackId, slotKey, { label: e.target.value || undefined })}
        />
      </label>

      <NumField
        label={t('slot.maxWeight')}
        value={slot.maxWeightKg}
        min={0}
        step={50}
        suffix="kg"
        onChange={(v) =>
          updateSlot(rackId, slotKey, {
            maxWeightKg: v === template.defaultSlot.maxWeightKg ? undefined : v,
          })
        }
      />
      <NumField
        label={t('slot.currentWeight')}
        value={slot.currentWeightKg}
        min={0}
        step={50}
        suffix="kg"
        onChange={(v) => updateSlot(rackId, slotKey, { currentWeightKg: v > 0 ? v : undefined })}
      />

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{t('slot.status')}</span>
        <select
          className="field w-32"
          value={override.statusOverride ?? 'auto'}
          onChange={(e) =>
            updateSlot(rackId, slotKey, {
              statusOverride: e.target.value === 'auto' ? undefined : (e.target.value as SlotStatus),
            })
          }
        >
          <option value="auto">{t('slot.auto')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(t, s)}
            </option>
          ))}
        </select>
      </label>

      <div className="h-1.5 overflow-hidden rounded bg-bg">
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.min(100, slot.utilization * 100)}%`,
            background: slot.utilization > 1 ? '#ff5c5c' : slot.utilization > 0.8 ? '#ffb020' : '#3ddc84',
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{t('slot.utilized', { pct: Math.round(slot.utilization * 100) })}</span>
        <button className="btn !py-0.5" onClick={() => resetSlot(rackId, slotKey)} disabled={!slot.hasOverride}>
          {t('slot.reset')}
        </button>
      </div>
    </div>
  )
}

function RackPanel({ rackId }: { rackId: string }) {
  const rack = useWarehouseStore((s) => s.layout.racks[rackId])
  const templates = useWarehouseStore((s) => s.layout.templates)
  const cellSize = useWarehouseStore((s) => s.layout.floor.cellSize)
  const updateRackMeta = useWarehouseStore((s) => s.updateRackMeta)
  const selectedSlotKey = useEditorStore((s) => s.selectedSlotKey)
  const t = useT()

  const template = rack ? templates[rack.templateId] : undefined
  const stats = useMemo(
    () => (rack && template ? rackStats(template, rack) : null),
    [rack, template],
  )

  if (!rack || !template || !stats) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="panel-title">{t('rack.title')}</div>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{t('rack.name')}</span>
        <input
          className="field w-36"
          value={rack.name ?? ''}
          placeholder={t('rack.namePlaceholder')}
          onChange={(e) => updateRackMeta(rackId, { name: e.target.value || undefined })}
        />
      </label>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{t('rack.template')}</span>
        <select
          className="field w-36"
          value={rack.templateId}
          onChange={(e) => updateRackMeta(rackId, { templateId: e.target.value })}
        >
          {Object.values(templates).map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-1 text-[11px] text-muted">
        <span>
          {t('rack.position')}: {(rack.gridX * cellSize).toFixed(1)}, {(rack.gridZ * cellSize).toFixed(1)} m
        </span>
        <span>
          {t('rack.rotation')}: {rack.rotation}°
        </span>
        <span>{t('rack.occupied', { occ: stats.occupied, total: stats.total })}</span>
        <span className={stats.overweight > 0 ? 'font-semibold text-danger' : ''}>
          {t('rack.overweight', { n: stats.overweight })}
        </span>
      </div>

      <div className="flex gap-1">
        <button className="btn flex-1 justify-center" onClick={rotateGhostOrSelection} title={t('rack.rotateTip')}>
          {t('rack.rotate')}
        </button>
        <button className="btn btn-danger flex-1 justify-center" onClick={() => requestDelete(rackId)} title={t('rack.deleteTip')}>
          {t('rack.delete')}
        </button>
      </div>

      <div>
        <div className="panel-title mb-1.5">{t('rack.slotsTitle')}</div>
        <SlotGrid rack={rack} template={template} />
      </div>

      {selectedSlotKey && <SlotEditor rackId={rackId} slotKey={selectedSlotKey} />}
    </div>
  )
}

export function Inspector() {
  const selectedRackId = useEditorStore((s) => s.selectedRackId)
  const selectedWallId = useEditorStore((s) => s.selectedWallId)
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-panel p-3">
      {selectedRackId ? (
        <RackPanel rackId={selectedRackId} />
      ) : selectedWallId ? (
        <WallPanel wallId={selectedWallId} />
      ) : (
        <FloorPanel />
      )}
    </aside>
  )
}
