import type { ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import type { Wall as WallType } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { gridToWorld } from '../lib/grid'
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

  return (
    <mesh
      position={[cx, height / 2, cz]}
      rotation-y={angle}
      castShadow
      receiveShadow
      material={wallMat}
      onClick={onClick}
    >
      <boxGeometry args={[len, height, thickness]} />
      {selected && <Edges color="#4c9aff" />}
    </mesh>
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
