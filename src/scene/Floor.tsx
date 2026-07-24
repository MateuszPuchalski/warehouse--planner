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
import { usePlaneDrag } from './usePlaneDrag'
import { racksInScreenRect } from '../lib/screenPick'

/** Warehouse floor — visual plane + grid, and the single raycast target for placement. */
export function Floor() {
  const floor = useWarehouseStore((s) => s.layout.floor)
  const mode = useEditorStore((s) => s.mode)
  const placingTemplateId = useEditorStore((s) => s.placingTemplateId)

  const editor = useEditorStore.getState
  const startDrag = usePlaneDrag()
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    editor().setPointer({ x: e.point.x, z: e.point.z })
    if (mode === 'place' && placingTemplateId && !editor().movingRackId) {
      const ghost = computeGhost(
        placingTemplateId,
        e.point.x,
        e.point.z,
        editor().placeRotation,
        undefined,
        { snap: !(e.ctrlKey || e.metaKey) },
      )
      editor().setGhost(ghost)
    }
  }

  /** Shift+drag on the floor in select mode: marquee box-selection (plain drag orbits). */
  const startMarquee = (e: ThreeEvent<PointerEvent>) => {
    const origin = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    const additive = e.ctrlKey || e.metaKey
    const base = additive ? [...editor().selectedRackIds] : []
    editor().setMarquee({ x0: origin.x, y0: origin.y, x1: origin.x, y1: origin.y })

    startDrag({
      onMove: (_hit, ev) => {
        const rect = { x0: origin.x, y0: origin.y, x1: ev.clientX, y1: ev.clientY }
        editor().setMarquee(rect)
        const hits = racksInScreenRect(
          useWarehouseStore.getState().layout,
          camera,
          gl.domElement,
          rect,
        )
        editor().setRackSelection([...base, ...hits])
      },
      onEnd: (committed) => {
        editor().setMarquee(null)
        if (!committed) editor().setRackSelection(base)
      },
    })
  }

  /** Drag on the floor in wall/zone mode to draw a segment/rectangle. */
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (mode === 'select' && e.button === 0 && e.shiftKey) {
      e.stopPropagation()
      startMarquee(e)
      return
    }
    if ((mode !== 'wall' && mode !== 'zone') || e.button !== 0) return
    e.stopPropagation()
    const drawZone = mode === 'zone'
    const startX = e.point.x
    const startZ = e.point.z
    if (drawZone) editor().setZoneDraft(computeZoneDraft(startX, startZ, startX, startZ))
    else editor().setWallDraft(computeWallDraft(startX, startZ, startX, startZ))

    startDrag({
      onMove: (hit) => {
        editor().setPointer({ x: hit.x, z: hit.z })
        if (drawZone) editor().setZoneDraft(computeZoneDraft(startX, startZ, hit.x, hit.z))
        else editor().setWallDraft(computeWallDraft(startX, startZ, hit.x, hit.z))
      },
      onEnd: (committed) => {
        if (!committed) {
          // Escape / right-click aborted the draw.
          editor().setZoneDraft(null)
          editor().setWallDraft(null)
          return
        }
        if (drawZone) commitZoneDraft()
        else commitWallDraft()
      },
    })
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    if (mode === 'place') placeAtGhost()
    else if (mode === 'select') {
      // A shift-click on the floor ends a marquee; it must not clear the result.
      if (e.shiftKey || e.ctrlKey || e.metaKey) return
      editor().clearRackSelection()
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
