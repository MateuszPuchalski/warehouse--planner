import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { aisleCorridors, hallDimensions, rackClearances, MEASURE_Y, type DimLine } from '../lib/measure'

/** Length of the perpendicular end ticks that cap a dimension line. */
const TICK = 0.28

const COLORS: Record<DimLine['kind'], string> = {
  hall: '#8b93a3',
  rack: '#3ddc84',
  wall: '#4c9aff',
}
const TOO_TIGHT = '#ff5c5c'

function Dimension({ line }: { line: DimLine }) {
  const color = line.ok ? COLORS[line.kind] : TOO_TIGHT
  // Ticks run across the measured direction so the line reads as a dimension, not a route.
  const ticks = useMemo(() => {
    const t: [number, number, number][][] = []
    for (const p of [line.from, line.to]) {
      if (line.axis === 'x') {
        t.push([
          [p[0], MEASURE_Y, p[2] - TICK],
          [p[0], MEASURE_Y, p[2] + TICK],
        ])
      } else {
        t.push([
          [p[0] - TICK, MEASURE_Y, p[2]],
          [p[0] + TICK, MEASURE_Y, p[2]],
        ])
      }
    }
    return t
  }, [line])

  const mid: [number, number, number] = [
    (line.from[0] + line.to[0]) / 2,
    0.38,
    (line.from[2] + line.to[2]) / 2,
  ]

  return (
    <group>
      <Line points={[line.from, line.to]} color={color} lineWidth={1.6} />
      {ticks.map((pts, i) => (
        <Line key={i} points={pts} color={color} lineWidth={1.6} />
      ))}
      <Html center position={mid} style={{ pointerEvents: 'none' }} zIndexRange={[16, 0]}>
        <div
          className="rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
          style={{ background: 'rgba(23,26,32,0.92)', borderColor: color, color }}
        >
          {line.meters.toFixed(2)} m
        </div>
      </Html>
    </group>
  )
}

/**
 * Floor dimensions: overall hall width and depth, plus clearances. With a rack selected
 * it measures that rack's four sides (to the nearest rack or wall); with nothing
 * selected it shows one measurement per aisle corridor as an overview.
 */
export function MeasureOverlay() {
  const show = useEditorStore((s) => s.showMeasures)
  const selectedRackId = useEditorStore((s) => s.selectedRackId)
  const layout = useWarehouseStore((s) => s.layout)

  const lines = useMemo(() => {
    if (!show) return []
    const hall = hallDimensions(layout)
    const detail = selectedRackId
      ? rackClearances(layout, selectedRackId)
      : aisleCorridors(layout)
    return [...hall, ...detail]
  }, [show, layout, selectedRackId])

  if (!show) return null
  return (
    <group>
      {lines.map((l, i) => (
        <Dimension key={`${l.kind}-${l.axis}-${i}`} line={l} />
      ))}
    </group>
  )
}
