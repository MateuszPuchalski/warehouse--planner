import { Html } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { gridToWorld } from '../lib/grid'
import { wallLengthM } from '../lib/walls'
import { wallGhostValidMat, wallGhostInvalidMat } from './materials'

/** Translucent preview of the wall currently being drawn by dragging. */
export function WallGhost() {
  const draft = useEditorStore((s) => s.wallDraft)
  const floor = useWarehouseStore((s) => s.layout.floor)
  if (!draft) return null

  const cell = floor.cellSize
  const x1 = gridToWorld(draft.x1, cell)
  const z1 = gridToWorld(draft.z1, cell)
  const x2 = gridToWorld(draft.x2, cell)
  const z2 = gridToWorld(draft.z2, cell)
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz)

  const cx = (x1 + x2) / 2
  const cz = (z1 + z2) / 2
  const angle = Math.atan2(-dz, dx)
  const height = Math.max(0.05, floor.wallHeightM)
  const thickness = Math.max(0.02, floor.wallThicknessM)
  const lengthM = wallLengthM(draft, cell)

  return (
    <group>
      {len > 0.02 && (
        <mesh
          position={[cx, height / 2, cz]}
          rotation-y={angle}
          material={draft.valid ? wallGhostValidMat : wallGhostInvalidMat}
        >
          <boxGeometry args={[len, height, thickness]} />
        </mesh>
      )}
      <Html center position={[cx, height + 0.4, cz]} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <div
          className="rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap"
          style={{
            background: 'rgba(23,26,32,0.92)',
            borderColor: draft.valid ? '#4c9aff' : '#ff5c5c',
            color: draft.valid ? '#4c9aff' : '#ff5c5c',
          }}
        >
          {lengthM.toFixed(2)} m
        </div>
      </Html>
    </group>
  )
}
