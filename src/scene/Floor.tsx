import { Grid, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { computeGhost, placeAtGhost, rotateGhostOrSelection } from '../lib/editorActions'

/** Warehouse floor — visual plane + grid, and the single raycast target for placement. */
export function Floor() {
  const floor = useWarehouseStore((s) => s.layout.floor)
  const mode = useEditorStore((s) => s.mode)
  const placingTemplateId = useEditorStore((s) => s.placingTemplateId)

  const editor = useEditorStore.getState

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    editor().setPointer({ x: e.point.x, z: e.point.z })
    if (mode === 'place' && placingTemplateId && !editor().movingRackId) {
      const ghost = computeGhost(placingTemplateId, e.point.x, e.point.z, editor().placeRotation)
      editor().setGhost(ghost)
    }
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    if (mode === 'place') placeAtGhost()
    else if (mode === 'select') editor().selectRack(null)
  }

  const onContextMenu = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'place' || e.delta > 4) return
    e.nativeEvent.preventDefault()
    rotateGhostOrSelection()
  }

  const hw = floor.widthM / 2
  const hd = floor.depthM / 2
  const border: [number, number, number][] = [
    [-hw, 0.02, -hd],
    [hw, 0.02, -hd],
    [hw, 0.02, hd],
    [-hw, 0.02, hd],
    [-hw, 0.02, -hd],
  ]

  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        receiveShadow
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          editor().setPointer(null)
          if (mode === 'place') editor().setGhost(null)
        }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <planeGeometry args={[floor.widthM, floor.depthM]} />
        <meshStandardMaterial color="#1c2027" roughness={0.95} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0.005, 0]}
        args={[floor.widthM, floor.depthM]}
        cellSize={floor.cellSize}
        cellThickness={0.6}
        cellColor="#353c48"
        sectionSize={floor.cellSize * 10}
        sectionThickness={1.1}
        sectionColor="#495262"
        fadeDistance={160}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />
      <Line points={border} color="#3c4553" lineWidth={1.5} />
    </group>
  )
}
