import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import type { AABB } from '../types'
import { rackIndex } from '../lib/collision'
import { aabbFor } from '../lib/rackGeometry'
import {
  aisleCorridors,
  boxClearances,
  hallDimensions,
  rackClearances,
  selectionDimensions,
  MEASURE_Y,
  type DimLine,
} from '../lib/measure'

/** Length of the perpendicular end ticks that cap a dimension line. */
const TICK = 0.28

const COLORS: Record<DimLine['kind'], string> = {
  hall: '#8b93a3',
  rack: '#3ddc84',
  wall: '#4c9aff',
  // Distances inside the current selection, in the selection's own colour.
  selection: '#4c9aff',
  span: '#c084fc',
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
 * Floor dimensions: overall hall width and depth plus one measurement per aisle
 * corridor, shown while the overlay is on. Selecting a rack ADDS that rack's four-side
 * clearances (to the nearest rack or wall) on top — it must not replace the overview, or
 * turning the overlay on with a rack already selected would look like nothing happened.
 *
 * Selecting SEVERAL racks always shows the distances between them and the selection's
 * overall extent, overlay or not — that is the measurement you want while arranging a
 * row. During a group drag they are computed from the ghost, so the numbers follow the
 * racks live instead of snapping to the new values only on release.
 */
export function MeasureOverlay() {
  const show = useEditorStore((s) => s.showMeasures)
  const selectedRackId = useEditorStore((s) => s.selectedRackId)
  const selectedRackIds = useEditorStore((s) => s.selectedRackIds)
  const groupGhost = useEditorStore((s) => s.groupGhost)
  const layout = useWarehouseStore((s) => s.layout)

  /** Boxes of the selected racks — the ghost's while a group drag is in flight. */
  const selectionBoxes = useMemo(() => {
    const cell = layout.floor.cellSize
    if (groupGhost) {
      return groupGhost.items
        .map((it) => {
          const t = layout.templates[it.templateId]
          return t
            ? { id: it.rackId, aabb: aabbFor(it.gridX, it.gridZ, it.rotation, t, cell) }
            : null
        })
        .filter((b): b is { id: string; aabb: AABB } => b !== null)
    }
    return rackIndex(layout)
      .filter((e) => selectedRackIds.has(e.id))
      .map((e) => ({ id: e.id, aabb: e.aabb }))
  }, [layout, selectedRackIds, groupGhost])

  const lines = useMemo(() => {
    const selection = selectionDimensions(selectionBoxes)
    // While a group is in flight, also measure from the whole moving block to whatever it
    // is approaching — the distances that actually change as you drag.
    if (groupGhost && selectionBoxes.length > 0) {
      const hull = {
        minX: Math.min(...selectionBoxes.map((b) => b.aabb.minX)),
        maxX: Math.max(...selectionBoxes.map((b) => b.aabb.maxX)),
        minZ: Math.min(...selectionBoxes.map((b) => b.aabb.minZ)),
        maxZ: Math.max(...selectionBoxes.map((b) => b.aabb.maxZ)),
      }
      const moving = new Set(groupGhost.items.map((it) => it.rackId))
      selection.push(...boxClearances(layout, hull, moving))
    }
    if (!show) return selection
    return [
      ...hallDimensions(layout),
      ...aisleCorridors(layout),
      ...(selectedRackId ? rackClearances(layout, selectedRackId) : []),
      ...selection,
    ]
  }, [show, layout, selectedRackId, selectionBoxes, groupGhost])

  if (lines.length === 0) return null
  return (
    <group>
      {lines.map((l, i) => (
        <Dimension key={`${l.kind}-${l.axis}-${i}`} line={l} />
      ))}
    </group>
  )
}
