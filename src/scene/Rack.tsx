import { useRef } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { animated, useSpring } from '@react-spring/three'
import { Edges } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { getLocalSize, slotKey } from '../lib/rackGeometry'
import { gridToWorld } from '../lib/grid'
import { computeGhost, finalizeDelete, requestDelete } from '../lib/editorActions'
import { RackFrame } from './RackFrame'
import { SlotCells } from './SlotCells'

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const dragRaycaster = new THREE.Raycaster()
const tmpNdc = new THREE.Vector2()
const tmpHit = new THREE.Vector3()
const tmpLocal = new THREE.Vector3()

export function Rack({ rackId }: { rackId: string }) {
  const rack = useWarehouseStore((s) => s.layout.racks[rackId])
  const template = useWarehouseStore((s) =>
    rack ? s.layout.templates[rack.templateId] : undefined,
  )
  const cellSize = useWarehouseStore((s) => s.layout.floor.cellSize)
  const moveRack = useWarehouseStore((s) => s.moveRack)

  const mode = useEditorStore((s) => s.mode)
  const selected = useEditorStore((s) => s.selectedRackId === rackId)
  const hovered = useEditorStore((s) => s.hoveredRackId === rackId)
  const isDeleting = useEditorStore((s) => s.deletingRackIds.includes(rackId))
  const isMoving = useEditorStore((s) => s.movingRackId === rackId && s.ghost !== null)
  const colorMode = useEditorStore((s) => s.colorMode)

  const groupRef = useRef<THREE.Group>(null)
  const draggingRef = useRef(false)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null

  const spring = useSpring({
    from: { scale: 0.55 },
    to: { scale: isDeleting ? 0.02 : 1 },
    config: { tension: 320, friction: 24 },
    onRest: () => {
      if (useEditorStore.getState().deletingRackIds.includes(rackId)) finalizeDelete(rackId)
    },
  })

  if (!rack || !template) return null

  const { w, h, d } = getLocalSize(template)
  const editor = useEditorStore.getState

  /**
   * Drag-to-move via window listeners (not pointer capture): keeps tracking
   * even when the pointer leaves the rack or the canvas mid-drag.
   */
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'select' || e.button !== 0 || isDeleting || draggingRef.current) return
    e.stopPropagation()
    editor().selectRack(rackId)
    editor().setMovingRackId(rackId)
    if (controls) controls.enabled = false
    draggingRef.current = true

    const startGX = rack.gridX
    const startGZ = rack.gridZ
    const templateId = rack.templateId
    const rotation = rack.rotation
    let moved = false

    const onMove = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      tmpNdc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      dragRaycaster.setFromCamera(tmpNdc, camera)
      if (!dragRaycaster.ray.intersectPlane(FLOOR_PLANE, tmpHit)) return
      const ghost = computeGhost(templateId, tmpHit.x, tmpHit.z, rotation, rackId)
      if (!ghost) return
      if (!moved && ghost.gridX === startGX && ghost.gridZ === startGZ) return
      moved = true
      editor().setGhost(ghost)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      draggingRef.current = false
      if (controls) controls.enabled = true
      const ghost = editor().ghost
      if (moved && ghost && ghost.valid) moveRack(rackId, ghost.gridX, ghost.gridZ)
      editor().setMovingRackId(null)
      editor().setGhost(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || isDeleting) return
    if (mode === 'delete') {
      e.stopPropagation()
      requestDelete(rackId)
      return
    }
    if (mode !== 'select') return
    e.stopPropagation()
    if (selected && groupRef.current) {
      // Pick the slot under the click from the intersection point — no extra raycast needed.
      tmpLocal.copy(e.point)
      groupRef.current.worldToLocal(tmpLocal)
      const innerW = template.bays * template.bayWidth
      const bay = Math.min(
        template.bays - 1,
        Math.max(0, Math.floor((tmpLocal.x + innerW / 2) / template.bayWidth)),
      )
      const level = Math.min(
        template.levels - 1,
        Math.max(0, Math.floor(tmpLocal.y / template.levelHeight)),
      )
      editor().selectSlot(slotKey(bay, level))
    } else {
      editor().selectRack(rackId)
    }
  }

  const showSlots = colorMode !== 'none' || selected
  const highlight = selected || hovered

  return (
    <animated.group
      ref={groupRef}
      position={[gridToWorld(rack.gridX, cellSize), 0, gridToWorld(rack.gridZ, cellSize)]}
      rotation-y={THREE.MathUtils.degToRad(rack.rotation)}
      scale={spring.scale}
      visible={!isMoving}
    >
      <RackFrame template={template} />
      {showSlots && <SlotCells rack={rack} template={template} />}

      {/* Invisible pick box — the single raycast target for this rack. */}
      <mesh
        visible={false}
        position={[0, h / 2, 0]}
        onPointerOver={(e) => {
          if (mode === 'place' || isDeleting) return
          e.stopPropagation()
          editor().setHoveredRack(rackId)
        }}
        onPointerOut={() => editor().clearHoveredRack(rackId)}
        onPointerDown={onPointerDown}
        onClick={onClick}
      >
        <boxGeometry args={[w, h, d]} />
      </mesh>

      {highlight && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w + 0.06, h + 0.06, d + 0.06]} />
          <meshBasicMaterial
            color={mode === 'delete' ? '#ff5c5c' : '#4c9aff'}
            transparent
            opacity={selected ? 0.1 : 0.06}
            depthWrite={false}
          />
          {selected && <Edges color="#4c9aff" />}
        </mesh>
      )}
    </animated.group>
  )
}
