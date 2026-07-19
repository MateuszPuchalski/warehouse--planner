import { useMemo, useRef, useState } from 'react'
import type { StockItem } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { useStockStore } from '../store/useStockStore'
import {
  guessMapping,
  parseStockFile,
  rowsToStockItems,
  type ColumnMapping,
  type ParsedFile,
  type VolumeUnit,
} from '../lib/stockFile'
import { buildPlan } from '../lib/autoBuild'
import { useT, type TranslationKey } from '../lib/i18n'

const MAPPING_FIELDS = ['symbol', 'name', 'quantity', 'location', 'unit', 'volume'] as const
const VOLUME_UNITS: VolumeUnit[] = ['m3', 'dm3', 'cm3']

const PREVIEW_ROWS = 12

export function SubiektImport() {
  const setShow = useEditorStore((s) => s.setShowSubiektImport)
  const showToast = useEditorStore((s) => s.showToast)
  const setColorMode = useEditorStore((s) => s.setColorMode)
  const layout = useWarehouseStore((s) => s.layout)
  const applyGenerated = useWarehouseStore((s) => s.applyGenerated)
  const setItems = useStockStore((s) => s.setItems)
  const stockCount = useStockStore((s) => s.items.length)
  const importedAt = useStockStore((s) => s.importedAt)
  const t = useT()

  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [firstRowIsData, setFirstRowIsData] = useState(false)
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>('m3')
  // Opt-in: by default the import only fills existing racks and never mutates the layout.
  const [createMissing, setCreateMissing] = useState(false)

  const close = () => setShow(false)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const result = await parseStockFile(file)
      setParsed(result)
      setFileName(file.name)
      setMapping(
        result.headerGuess ?? { symbol: 0, name: 1, quantity: 2, location: 3, unit: null, volume: null },
      )
      setFirstRowIsData(result.headerGuess === null && guessMapping(result.rows[0]) === null)
    } catch (err) {
      showToast(
        t('toast.stockImportFailed', { msg: err instanceof Error ? err.message : String(err) }),
        'error',
      )
    }
  }

  const conversion = useMemo(() => {
    if (!parsed || !mapping) return null
    return rowsToStockItems(parsed.rows, mapping, !firstRowIsData, volumeUnit)
  }, [parsed, mapping, firstRowIsData, volumeUnit])

  const plan = useMemo(() => {
    if (!conversion) return null
    return buildPlan(conversion.items, layout)
  }, [conversion, layout])

  const located = useMemo(
    () => (conversion ? conversion.items.filter((i) => i.locations.length > 0).length : 0),
    [conversion],
  )
  const palletOnly = useMemo(
    () =>
      conversion
        ? conversion.items.filter((i) => i.locations.length === 0 && i.otherLocations.length > 0).length
        : 0,
    [conversion],
  )

  /** Location codes with no matching rack in the layout (would-be-created + unplaceable). */
  const missingCodes = useMemo(
    () => (plan ? [...plan.racks.map((r) => r.code ?? '?'), ...plan.stats.unplaced] : []),
    [plan],
  )

  const doImport = () => {
    if (!conversion || !plan) return
    if (createMissing && (plan.racks.length > 0 || plan.rackUpgrades.length > 0)) {
      applyGenerated(plan)
    }
    setItems(conversion.items, 'file')
    setColorMode('stock')
    showToast(
      t('toast.stockImported', {
        items: conversion.items.length,
        racks: createMissing ? plan.racks.length : 0,
      }),
    )
    close()
  }

  const previewRows = parsed ? parsed.rows.slice(firstRowIsData ? 0 : 1, PREVIEW_ROWS + 1) : []
  const colCount = parsed ? Math.max(...parsed.rows.slice(0, 5).map((r) => r.length)) : 0

  const badLocation = (item: StockItem | undefined) =>
    item !== undefined && item.locationRaw !== '' && item.locations.length === 0

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="flex max-h-[85vh] w-[620px] flex-col rounded-lg border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('subiekt.title')}</span>
          <button className="btn !px-1.5 !py-0.5" onClick={close}>
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-accent" onClick={() => fileRef.current?.click()}>
            {t('subiekt.pickFile')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            hidden
            onChange={onFile}
          />
          {fileName && <span className="truncate text-xs text-muted">{fileName}</span>}
          {parsed?.encoding && (
            <span className="ml-auto text-[10px] text-muted">
              {t('subiekt.encoding', { enc: parsed.encoding })}
            </span>
          )}
        </div>

        {!parsed && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            {t('subiekt.help')}
            {stockCount > 0 && importedAt && (
              <>
                <br />
                {t('subiekt.current', {
                  n: stockCount,
                  date: new Date(importedAt).toLocaleString(),
                })}
              </>
            )}
          </p>
        )}

        {parsed && mapping && conversion && plan && (
          <>
            <div className="mt-3 grid grid-cols-6 gap-1.5">
              {MAPPING_FIELDS.map((field) => (
                <label key={field} className="flex flex-col gap-0.5 text-[10px] text-muted">
                  {t(`subiekt.col.${field}` as TranslationKey)}
                  <select
                    className="field"
                    value={mapping[field] ?? -1}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      const nullable = field === 'unit' || field === 'volume'
                      setMapping({ ...mapping, [field]: nullable && v === -1 ? null : v })
                    }}
                  >
                    {(field === 'unit' || field === 'volume') && (
                      <option value={-1}>{t('subiekt.colIgnore')}</option>
                    )}
                    {Array.from({ length: colCount }, (_, i) => (
                      <option key={i} value={i}>
                        {firstRowIsData ? `#${i + 1}` : String(parsed.rows[0][i] ?? `#${i + 1}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {mapping.volume !== null && (
              <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                {t('subiekt.volumeUnit')}
                <select
                  className="field w-24"
                  value={volumeUnit}
                  onChange={(e) => setVolumeUnit(e.target.value as VolumeUnit)}
                >
                  {VOLUME_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {t(`subiekt.volumeUnit.${u}` as TranslationKey)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={firstRowIsData}
                onChange={(e) => setFirstRowIsData(e.target.checked)}
              />
              {t('subiekt.firstRowData')}
            </label>

            <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-panel2 text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{t('subiekt.col.symbol')}</th>
                    <th className="px-2 py-1 text-left">{t('subiekt.col.name')}</th>
                    <th className="px-2 py-1 text-right">{t('subiekt.col.quantity')}</th>
                    <th className="px-2 py-1 text-left">{t('subiekt.col.location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((_, i) => {
                    const item = conversion.items[i]
                    if (!item) return null
                    const bad = badLocation(item)
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1 font-medium">{item.symbol}</td>
                        <td className="max-w-48 truncate px-2 py-1">{item.name}</td>
                        <td className="px-2 py-1 text-right">
                          {item.quantity} {item.unit ?? ''}
                        </td>
                        <td className={`px-2 py-1 ${bad ? 'text-warn' : ''}`}>
                          {item.locationRaw || '—'}
                          {bad && ` · ${t('subiekt.badLocation')}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-2 rounded-md border border-border bg-panel2 p-2 text-[11px] leading-relaxed">
              <div>
                {t('subiekt.summary', {
                  items: conversion.items.length,
                  located,
                  codes: plan.stats.rackCodes,
                  missing: plan.racks.length,
                })}
              </div>
              <div className="text-muted">
                {palletOnly > 0 && <>{t('subiekt.palletOnly', { n: palletOnly })} · </>}
                {conversion.noLocation > 0 && <>{t('subiekt.noLocation', { n: conversion.noLocation })} · </>}
                {plan.stats.upgraded > 0 && <>{t('subiekt.upgraded', { n: plan.stats.upgraded })} · </>}
                {plan.stats.outOfRange > 0 && (
                  <span className="text-warn">{t('subiekt.outOfRange', { n: plan.stats.outOfRange })} · </span>
                )}
                {plan.stats.unplaced.length > 0 && (
                  <span className="text-warn">
                    {t('subiekt.unplaced', { codes: plan.stats.unplaced.join(', ') })} ·{' '}
                  </span>
                )}
                {plan.stats.duplicateCodes.length > 0 && (
                  <span className="text-warn">
                    {t('subiekt.duplicates', { codes: plan.stats.duplicateCodes.join(', ') })}
                  </span>
                )}
              </div>
            </div>

            {(plan.racks.length > 0 || plan.rackUpgrades.length > 0) && (
              <>
                {!createMissing && missingCodes.length > 0 && (
                  <div className="mt-2 text-[11px] text-warn">
                    {t('subiekt.skippedMissing', {
                      n: missingCodes.length,
                      codes:
                        missingCodes.slice(0, 5).join(', ') + (missingCodes.length > 5 ? '…' : ''),
                    })}
                  </div>
                )}
                {!createMissing && plan.rackUpgrades.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted">
                    {t('subiekt.skippedUpgrades', { n: plan.rackUpgrades.length })}
                  </div>
                )}
                <label className="mt-2 flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={createMissing}
                    onChange={(e) => setCreateMissing(e.target.checked)}
                  />
                  {t('subiekt.createMissing', { n: plan.racks.length })}
                  {createMissing && plan.floorPatch && (
                    <span className="text-[10px] text-muted">
                      {t('subiekt.floorGrow', { w: plan.floorPatch.widthM, d: plan.floorPatch.depthM })}
                    </span>
                  )}
                </label>
              </>
            )}

            <div className="mt-3 flex items-center gap-1.5">
              <button className="btn ml-auto" onClick={close}>
                {t('subiekt.cancel')}
              </button>
              <button className="btn btn-accent" onClick={doImport} disabled={located === 0}>
                {t('subiekt.import')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
