import { Html } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { zoneRectM } from '../lib/zones'
import { wallGhostValidMat, wallGhostInvalidMat } from './materials'

/** Translucent preview of the zone rectangle currently being drawn by dragging. */
export function ZoneGhost() {
  const draft = useEditorStore((s) => s.zoneDraft)
  const cell = useWarehouseStore((s) => s.layout.floor.cellSize)
  if (!draft) return null

  const { cx, cz, w, d } = zoneRectM(draft, cell)

  return (
    <group>
      {w > 0.02 && d > 0.02 && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[cx, 0.03, cz]}
          material={draft.valid ? wallGhostValidMat : wallGhostInvalidMat}
        >
          <planeGeometry args={[w, d]} />
        </mesh>
      )}
      <Html center position={[cx, 0.6, cz]} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <div
          className="rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap"
          style={{
            background: 'rgba(23,26,32,0.92)',
            borderColor: draft.valid ? '#4c9aff' : '#ff5c5c',
            color: draft.valid ? '#4c9aff' : '#ff5c5c',
          }}
        >
          {w.toFixed(1)} × {d.toFixed(1)} m
        </div>
      </Html>
    </group>
  )
}
