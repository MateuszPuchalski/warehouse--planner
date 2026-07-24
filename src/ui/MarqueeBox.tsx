import { useEditorStore } from '../store/useEditorStore'
import { normalizeRect } from '../lib/screenPick'

/**
 * Box-selection rectangle, drawn as a DOM overlay rather than in 3D so it never
 * z-fights with the scene and always sits crisply on top.
 */
export function MarqueeBox() {
  const marquee = useEditorStore((s) => s.marquee)
  if (!marquee) return null
  const r = normalizeRect(marquee)
  return (
    <div
      className="pointer-events-none fixed z-30 rounded-sm border border-accent bg-accent/10"
      style={{ left: r.x0, top: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 }}
    />
  )
}
