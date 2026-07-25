import { useEffect, useRef } from 'react'
import { usePanelStore, type PanelSide } from '../store/usePanelStore'
import { useT, type TranslationKey } from '../lib/i18n'

/**
 * Divider between a side panel and the 3D view: drag to resize, click the chevron to
 * collapse. Tracking happens on window listeners rather than pointer capture so the
 * gesture survives the pointer crossing the canvas, and Escape restores the start width.
 */
export function ResizeHandle({ side }: { side: PanelSide }) {
  const width = usePanelStore((s) => (side === 'left' ? s.leftWidth : s.rightWidth))
  const collapsed = usePanelStore((s) => (side === 'left' ? s.leftCollapsed : s.rightCollapsed))
  const setWidth = usePanelStore((s) => s.setWidth)
  const toggleCollapsed = usePanelStore((s) => s.toggleCollapsed)
  const setResizing = usePanelStore((s) => s.setResizing)
  const t = useT()
  const cleanupRef = useRef<(() => void) | null>(null)

  // A drag in flight when this unmounts must not leak window listeners.
  useEffect(() => () => cleanupRef.current?.(), [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || collapsed || cleanupRef.current) return
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    setResizing(true)

    const finish = (restore: boolean) => {
      if (!cleanupRef.current) return
      cleanupRef.current()
      cleanupRef.current = null
      setResizing(false)
      if (restore) setWidth(side, startWidth)
    }

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX
      // The right panel grows when the pointer moves left.
      setWidth(side, startWidth + (side === 'left' ? delta : -delta))
    }
    const onUp = () => finish(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        finish(true)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }

  const labelKey = `panel.${collapsed ? 'expand' : 'collapse'}${side === 'left' ? 'Left' : 'Right'}`
  const label = t(labelKey as TranslationKey)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      className={`group relative w-[5px] shrink-0 bg-border transition-colors hover:bg-accent/60 ${
        collapsed ? '' : 'cursor-col-resize'
      }`}
    >
      <button
        type="button"
        title={label}
        aria-label={label}
        // Stop the press here so clicking the chevron never starts a resize drag.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => toggleCollapsed(side)}
        className="absolute top-1/2 left-1/2 flex h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border border-border bg-panel2 text-[9px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
      >
        {(side === 'left') === collapsed ? '›' : '‹'}
      </button>
    </div>
  )
}
