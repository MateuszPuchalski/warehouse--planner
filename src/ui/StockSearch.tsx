import { useEffect, useMemo, useRef, useState } from 'react'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { useStockStore } from '../store/useStockStore'
import { locateHits, matchStock } from '../lib/findStock'
import { useT } from '../lib/i18n'

/** Top-bar product search: type symbol/name/EAN → highlight matching slots + list locations. */
export function StockSearch() {
  const items = useStockStore((s) => s.items)
  const layout = useWarehouseStore((s) => s.layout)
  const setFoundSlots = useEditorStore((s) => s.setFoundSlots)
  const selectRack = useEditorStore((s) => s.selectRack)
  const selectSlot = useEditorStore((s) => s.selectSlot)
  const t = useT()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const hits = useMemo(() => {
    if (!query.trim()) return []
    return locateHits(matchStock(items, query), layout, 50)
  }, [items, query, layout])

  // Drive the 3D highlight from the current matches.
  useEffect(() => {
    setFoundSlots(new Set(hits.map((h) => `${h.rackId}:${h.slotKey}`)))
  }, [hits, setFoundSlots])

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  if (items.length === 0) return null

  const clear = () => {
    setQuery('')
    setOpen(false)
    setFoundSlots(new Set())
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center">
        <input
          className="field w-44"
          value={query}
          placeholder={t('find.placeholder')}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') clear()
          }}
        />
        {query && (
          <button className="btn !px-1.5 !py-0.5 -ml-7 !border-0 !bg-transparent" title={t('find.clear')} onClick={clear}>
            ✕
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border border-border bg-panel p-1 shadow-2xl">
          {hits.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted">{t('find.none')}</div>
          ) : (
            <>
              <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t('find.results', { n: hits.length })}
              </div>
              {hits.map((h, i) => (
                <button
                  key={`${h.rackId}:${h.slotKey}:${i}`}
                  className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-panel2"
                  onClick={() => {
                    selectRack(h.rackId)
                    selectSlot(h.slotKey)
                    setOpen(false)
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">
                      {h.item.symbol} <span className="font-normal text-muted">— {h.item.name}</span>
                    </div>
                    <div className="text-[10px] text-muted">
                      {h.rackCode} · {h.label}
                      {h.item.ean ? ` · EAN ${h.item.ean}` : ''}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">
                    {h.item.quantity} {h.item.unit ?? ''}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
