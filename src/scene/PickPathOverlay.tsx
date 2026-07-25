import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { uncodedRackIds } from '../lib/pickPath'
import { pickWalk, ROUTE_Y } from '../lib/pickWalk'
import { rackIndex } from '../lib/collision'
import { useT } from '../lib/i18n'

// Cyan: the rack beams are orange (#e8792b) and the dimension lines blue (#4c9aff), so
// the route needs a lane of its own to read against both.
const ROUTE_COLOR = '#22d3ee'
const START_COLOR = '#3ddc84'
const END_COLOR = '#c084fc'
const MUTED = '#8b93a3'
/** Half-length of an arrow chevron arm. */
const ARROW = 0.26
/** Each label is a DOM node transformed every frame — a cap, not a thinning policy. */
const MAX_STOP_LABELS = 200
const MARKER_R = 0.34

function badge(color: string, text: string, pos: [number, number, number], key: string, dashed = false) {
  return (
    <Html key={key} center position={pos} style={{ pointerEvents: 'none' }} zIndexRange={[18, 0]}>
      <div
        className={`rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap ${dashed ? 'border-dashed' : ''}`}
        style={{ background: 'rgba(23,26,32,0.92)', borderColor: color, color }}
      >
        {text}
      </div>
    </Html>
  )
}

/** Two short segments forming a chevron pointing along (dx, dz). */
function arrowPoints(
  x: number,
  z: number,
  dx: number,
  dz: number,
): [number, number, number][][] {
  // Perpendicular in the floor plane.
  const px = -dz
  const pz = dx
  const tipX = x + dx * ARROW
  const tipZ = z + dz * ARROW
  const backX = x - dx * ARROW * 0.4
  const backZ = z - dz * ARROW * 0.4
  return [
    [
      [backX + px * ARROW * 0.7, ROUTE_Y, backZ + pz * ARROW * 0.7],
      [tipX, ROUTE_Y, tipZ],
    ],
    [
      [backX - px * ARROW * 0.7, ROUTE_Y, backZ - pz * ARROW * 0.7],
      [tipX, ROUTE_Y, tipZ],
    ],
  ]
}

/** Square outline on the floor, for the end marker. */
function squareLoop(x: number, z: number, r: number): [number, number, number][] {
  return [
    [x - r, ROUTE_Y, z - r],
    [x + r, ROUTE_Y, z - r],
    [x + r, ROUTE_Y, z + r],
    [x - r, ROUTE_Y, z + r],
    [x - r, ROUTE_Y, z - r],
  ]
}

function circleLoop(x: number, z: number, r: number, segments = 24): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2
    return [x + Math.cos(a) * r, ROUTE_Y, z + Math.sin(a) * r] as [number, number, number]
  })
}

/**
 * The picking walk, drawn on the floor: the order comes from the ERP codes
 * (`pickPath`), the path from the aisle-following router (`pickWalk`). Legs that could not
 * be routed are drawn dashed and labelled, so an approximation never passes for a walkway.
 */
export function PickPathOverlay() {
  const show = useEditorStore((s) => s.showPickPath)
  const codesShown = useEditorStore((s) => s.showRackCodes)
  const layout = useWarehouseStore((s) => s.layout)
  const t = useT()

  const walk = useMemo(() => (show ? pickWalk(layout) : null), [show, layout])
  // Racks outside the route deserve a marker — unless the code labels are already on, which
  // mark the very same racks as "no code" and would double up.
  const excluded = useMemo(() => {
    if (!show || codesShown) return []
    const ids = new Set(uncodedRackIds(layout))
    return rackIndex(layout)
      .filter((e) => ids.has(e.id))
      .map((e) => ({
        id: e.id,
        x: (e.aabb.minX + e.aabb.maxX) / 2,
        z: (e.aabb.minZ + e.aabb.maxZ) / 2,
      }))
  }, [show, codesShown, layout])

  if (!walk || walk.stops.length === 0) return null
  const { stops, legs, arrows } = walk
  const labelStep = Math.max(1, Math.ceil(stops.length / MAX_STOP_LABELS))
  const first = stops[0]
  const last = stops[stops.length - 1]

  return (
    <group>
      {legs.map((leg, i) => (
        <Line
          key={`leg${i}`}
          points={leg.points}
          color={ROUTE_COLOR}
          lineWidth={leg.straight ? 2 : 3}
          dashed={leg.straight}
          dashSize={0.35}
          gapSize={0.25}
        />
      ))}

      {arrows.map((a, i) =>
        arrowPoints(a.x, a.z, a.dx, a.dz).map((pts, k) => (
          <Line key={`arrow${i}-${k}`} points={pts} color={ROUTE_COLOR} lineWidth={2} />
        )),
      )}

      {/* Start and end differ in shape as well as colour. */}
      <Line points={circleLoop(first.x, first.z, MARKER_R)} color={START_COLOR} lineWidth={2.5} />
      {badge(START_COLOR, t('pick.start'), [first.x, 0.62, first.z], 'start')}
      {stops.length > 1 && (
        <>
          <Line points={squareLoop(last.x, last.z, MARKER_R)} color={END_COLOR} lineWidth={2.5} />
          {badge(END_COLOR, t('pick.end'), [last.x, 0.62, last.z], 'end')}
        </>
      )}

      {stops.map((s, i) =>
        i % labelStep === 0 || i === stops.length - 1
          ? badge(ROUTE_COLOR, `${s.seq}. ${s.code}`, [s.x, 0.45, s.z], s.rackId)
          : null,
      )}

      {/* One badge on the first degraded leg, so the dashes are explained rather than guessed. */}
      {legs.some((l) => l.straight) &&
        (() => {
          const leg = legs.find((l) => l.straight)!
          const mid = leg.points[Math.floor(leg.points.length / 2)]
          return badge(ROUTE_COLOR, t('pick.legStraight'), [mid[0], 0.3, mid[2]], 'straight', true)
        })()}

      {excluded.map((e) => badge(MUTED, t('pick.excluded'), [e.x, 0.45, e.z], `x${e.id}`, true))}
    </group>
  )
}
