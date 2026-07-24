import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { pickRoute } from '../lib/pickPath'

/** Route line sits just above the measure guides (0.08) and well under the labels (~0.4). */
const ROUTE_Y = 0.09
/** Each label is a DOM node transformed every frame, so cap how many we mount. */
const MAX_LABELS = 40

/**
 * Walking order through the warehouse, drawn on the floor: a continuous line through
 * every coded rack in sequence, with numbered stops. Order comes from the ERP codes,
 * so a zig-zag here means the codes don't follow the physical layout.
 */
export function PickPathOverlay() {
  const show = useEditorStore((s) => s.showPickPath)
  const layout = useWarehouseStore((s) => s.layout)

  const stops = useMemo(() => (show ? pickRoute(layout) : []), [show, layout])
  const points = useMemo(
    () => stops.map((s) => [s.x, ROUTE_Y, s.z] as [number, number, number]),
    [stops],
  )

  if (!show || stops.length === 0) return null
  // Beyond the cap, label every nth stop — the line itself stays continuous.
  const labelStep = Math.ceil(stops.length / MAX_LABELS)

  return (
    <group>
      {points.length > 1 && <Line points={points} color="#4c9aff" lineWidth={3} />}
      {stops.map((s, i) =>
        i % labelStep === 0 || i === stops.length - 1 ? (
          <Html
            key={s.rackId}
            center
            position={[s.x, 0.45, s.z]}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[18, 0]}
          >
            <div
              className="rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap"
              style={{
                background: 'rgba(23,26,32,0.92)',
                borderColor: '#4c9aff',
                color: '#4c9aff',
              }}
            >
              {s.seq}. {s.code}
            </div>
          </Html>
        ) : null,
      )}
    </group>
  )
}
