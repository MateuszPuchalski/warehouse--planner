import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { rackLabels } from '../lib/rackLabels'
import { useT } from '../lib/i18n'

/**
 * Labels are DOM (`Html`), not GPU text: troika's `<Text>` resolves its default font over
 * the network and this app has to work offline, and every other label in the scene shares
 * this badge recipe. If label pressure ever shows up in a profile, the way out is drei
 * `<Text>` with a font committed under `public/fonts/`.
 */
const MAX_LABELS = 200
const CODE_COLOR = '#c9d3e4'
const CODE_BORDER = '#3a4150'
const MUTED = '#8b93a3'

/**
 * Every rack's code, floating above it. One component rather than a label inside `Rack`,
 * which already carries eight store subscriptions per instance — adding a ninth to all of
 * them is exactly the re-render surface `uprightSkipMask` exists to avoid.
 */
export function RackLabels() {
  const show = useEditorStore((s) => s.showRackCodes)
  // The route's own badges read "12. B01" — they already carry the code, so showing the
  // plain code label as well would double every rack. Uncoded racks keep theirs, since
  // those are exactly the ones the route leaves out.
  const routeShown = useEditorStore((s) => s.showPickPath)
  const layout = useWarehouseStore((s) => s.layout)
  const t = useT()

  const labels = useMemo(() => {
    if (!show) return []
    const all = routeShown ? rackLabels(layout).filter((l) => l.code === null) : rackLabels(layout)
    return all.length > MAX_LABELS ? all.slice(0, MAX_LABELS) : all
  }, [show, routeShown, layout])

  if (labels.length === 0) return null

  return (
    <group>
      {labels.map((l) => {
        const coded = l.code !== null
        return (
          <Html
            key={l.rackId}
            center
            position={[l.x, l.y, l.z]}
            style={{ pointerEvents: 'none' }}
            // Below aisle violations (15) and dimensions (16): a warning outranks a name.
            zIndexRange={[14, 0]}
          >
            <div
              className={`rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap ${
                coded ? 'font-medium' : 'border-dashed'
              }`}
              style={{
                background: 'rgba(23,26,32,0.92)',
                borderColor: coded ? CODE_BORDER : MUTED,
                color: coded ? CODE_COLOR : MUTED,
              }}
            >
              {coded ? l.code : t('rack.noCode')}
            </div>
          </Html>
        )
      })}
    </group>
  )
}
