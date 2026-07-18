import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import type { Wall as WallType } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { gridToWorld } from '../lib/grid'
import { computeWallCuts } from '../lib/walls'
import { wallMat } from './materials'

const MIN_LEN = 0.05

function Wall({ wall }: { wall: WallType }) {
  const cell = useWarehouseStore((s) => s.layout.floor.cellSize)
  const mode = useEditorStore((s) => s.mode)
  const selected = useEditorStore((s) => s.selectedWallId === wall.id)

  const x1 = gridToWorld(wall.x1, cell)
  const z1 = gridToWorld(wall.z1, cell)
  const x2 = gridToWorld(wall.x2, cell)
  const z2 = gridToWorld(wall.z2, cell)
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz)

  const cuts = useMemo(() => computeWallCuts(wall, cell), [wall, cell])

  if (len < MIN_LEN) return null

  const cx = (x1 + x2) / 2
  const cz = (z1 + z2) / 2
  const angle = Math.atan2(-dz, dx)
  const thickness = Math.max(0.02, wall.thicknessM)
  const height = Math.max(0.05, wall.heightM)

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    if (mode === 'delete') {
      e.stopPropagation()
      useWarehouseStore.getState().deleteWall(wall.id)
      if (selected) useEditorStore.getState().selectWall(null)
      return
    }
    if (mode === 'select') {
      e.stopPropagation()
      useEditorStore.getState().selectWall(wall.id)
    }
  }

  // Local X runs from endpoint 1 (at -len/2) to endpoint 2 (+len/2); an
  // interval [a, b] along the wall is centered at (a + b) / 2 - len / 2.
  return (
    <group position={[cx, 0, cz]} rotation-y={angle}>
      {cuts.solids.map((s, i) => (
        <mesh
          key={`s${i}`}
          position={[(s.start + s.end) / 2 - len / 2, height / 2, 0]}
          castShadow
          receiveShadow
          material={wallMat}
          onClick={onClick}
        >
          <boxGeometry args={[Math.max(0.01, s.end - s.start), height, thickness]} />
          {selected && <Edges color="#4c9aff" />}
        </mesh>
      ))}
      {cuts.lintels.map((l, i) => (
        <mesh
          key={`l${i}`}
          position={[(l.start + l.end) / 2 - len / 2, l.yBottom + (height - l.yBottom) / 2, 0]}
          castShadow
          receiveShadow
          material={wallMat}
          onClick={onClick}
        >
          <boxGeometry args={[Math.max(0.01, l.end - l.start), Math.max(0.01, height - l.yBottom), thickness]} />
          {selected && <Edges color="#4c9aff" />}
        </mesh>
      ))}
    </group>
  )
}

/** All placed walls. Boundary (perimeter) and hand-drawn segments render identically. */
export function Walls() {
  const walls = useWarehouseStore((s) => s.layout.walls)
  return (
    <>
      {Object.values(walls).map((w) => (
        <Wall key={w.id} wall={w} />
      ))}
    </>
  )
}
