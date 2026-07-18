import * as THREE from 'three'
import { Grid, Line } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import {
  computeGhost,
  computeWallDraft,
  commitWallDraft,
  computeZoneDraft,
  commitZoneDraft,
  placeAtGhost,
  rotateGhostOrSelection,
} from '../lib/editorActions'

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const wallRaycaster = new THREE.Raycaster()
const tmpNdc = new THREE.Vector2()
const tmpHit = new THREE.Vector3()

/** Warehouse floor — visual plane + grid, and the single raycast target for placement. */
export function Floor() {
  const floor = useWarehouseStore((s) => s.layout.floor)
  const mode = useEditorStore((s) => s.mode)
  const placingTemplateId = useEditorStore((s) => s.placingTemplateId)

  const editor = useEditorStore.getState
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    editor().setPointer({ x: e.point.x, z: e.point.z })
    if (mode === 'place' && placingTemplateId && !editor().movingRackId) {
      const ghost = computeGhost(placingTemplateId, e.point.x, e.point.z, editor().placeRotation)
      editor().setGhost(ghost)
    }
  }

  /** Drag on the floor in wall/zone mode to draw a segment/rectangle, tracked via window listeners. */
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if ((mode !== 'wall' && mode !== 'zone') || e.button !== 0) return
    e.stopPropagation()
    if (controls) controls.enabled = false
    const drawZone = mode === 'zone'
    const startX = e.point.x
    const startZ = e.point.z
    if (drawZone) editor().setZoneDraft(computeZoneDraft(startX, startZ, startX, startZ))
    else editor().setWallDraft(computeWallDraft(startX, startZ, startX, startZ))

    const onMove = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      tmpNdc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      wallRaycaster.setFromCamera(tmpNdc, camera)
      if (!wallRaycaster.ray.intersectPlane(FLOOR_PLANE, tmpHit)) return
      editor().setPointer({ x: tmpHit.x, z: tmpHit.z })
      if (drawZone) editor().setZoneDraft(computeZoneDraft(startX, startZ, tmpHit.x, tmpHit.z))
      else editor().setWallDraft(computeWallDraft(startX, startZ, tmpHit.x, tmpHit.z))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (controls) controls.enabled = true
      if (drawZone) commitZoneDraft()
      else commitWallDraft()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    if (mode === 'place') placeAtGhost()
    else if (mode === 'select') {
      editor().selectRack(null)
      editor().selectWall(null)
      editor().selectZone(null)
    }
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
        onPointerDown={onPointerDown}
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
