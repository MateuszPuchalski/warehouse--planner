import { useRef } from 'react'
import * as THREE from 'three'
import { type ThreeEvent } from '@react-three/fiber'
import { animated, useSpring } from '@react-spring/three'
import { Edges } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { getLocalSize, levelAtHeight, slotKey } from '../lib/rackGeometry'
import { gridToWorld, worldToGrid } from '../lib/grid'
import { uprightSkipMask } from '../lib/runs'
import {
  commitMoveGhost,
  computeGhost,
  computeGroupGhost,
  finalizeDelete,
  requestDelete,
} from '../lib/editorActions'
import { RackFrame } from './RackFrame'
import { SlotCells } from './SlotCells'
import { usePlaneDrag } from './usePlaneDrag'

const tmpLocal = new THREE.Vector3()

export function Rack({ rackId }: { rackId: string }) {
  const rack = useWarehouseStore((s) => s.layout.racks[rackId])
  const template = useWarehouseStore((s) =>
    rack ? s.layout.templates[rack.templateId] : undefined,
  )
  const cellSize = useWarehouseStore((s) => s.layout.floor.cellSize)
  // Joined neighbours share one upright frame, so each junction's downstream rack drops
  // an end frame. Selecting a primitive bitmask keeps zustand from re-rendering every
  // rack whenever any of them moves.
  const skipMask = useWarehouseStore((s) => uprightSkipMask(s.layout, rackId))
  // While anything is being dragged the moved rack is hidden, which would leave a hole
  // with a missing post — restore every full frame for the duration of the gesture.
  const anyDrag = useEditorStore((s) => s.movingRackId !== null || s.movingRackIds.size > 0)

  const mode = useEditorStore((s) => s.mode)
  const selected = useEditorStore((s) => s.selectedRackIds.has(rackId))
  const isPrimary = useEditorStore((s) => s.selectedRackId === rackId)
  const hovered = useEditorStore((s) => s.hoveredRackId === rackId)
  const isDeleting = useEditorStore((s) => s.deletingRackIds.includes(rackId))
  // Hidden while its translucent ghost stands in — but a copy-drag keeps the source visible.
  const isMoving = useEditorStore(
    (s) =>
      !s.groupGhost?.copy &&
      ((s.movingRackId === rackId && s.ghost !== null) ||
        (s.movingRackIds.has(rackId) && s.groupGhost !== null)),
  )
  const colorMode = useEditorStore((s) => s.colorMode)

  const groupRef = useRef<THREE.Group>(null)
  const draggingRef = useRef(false)
  const startDrag = usePlaneDrag()

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
   * Drag-to-move. The grab offset is captured up front so the rack keeps its position
   * relative to the cursor instead of snapping its centre under it; Alt turns the drag
   * into a copy, Shift constrains it to one axis, and Escape aborts (see usePlaneDrag).
   */
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'select' || e.button !== 0 || isDeleting || draggingRef.current) return
    e.stopPropagation()
    // Shift/Ctrl means "toggle this rack in the selection" — handled on click, and it must
    // not start a drag or reset the selection here. (Axis-lock reads Shift live mid-drag.)
    if (e.shiftKey || e.ctrlKey || e.metaKey) return

    const ed = editor()
    // Dragging an unselected rack selects it first; dragging one of several moves them all.
    if (!ed.selectedRackIds.has(rackId)) ed.selectRack(rackId)
    const ids = [...editor().selectedRackIds]
    const isGroup = ids.length > 1
    const isCopy = e.altKey

    const startGX = rack.gridX
    const startGZ = rack.gridZ
    const templateId = rack.templateId
    const rotation = rack.rotation
    /**
     * Grid-space offset from the grab point to the rack centre, established from the
     * FIRST floor sample rather than from this event's `e.point`. `e.point` lies on the
     * rack's pick box up at mid-height, which under a perspective camera maps to a very
     * different floor position — deriving the offset from it made a plain click jump the
     * rack to wherever the cursor met the floor.
     */
    let grab: { dx: number; dz: number } | null = null
    let moved = false
    let axis: 'x' | 'z' | null = null

    if (isGroup || isCopy) editor().setMovingRackIds(ids)
    else editor().setMovingRackId(rackId)
    draggingRef.current = true

    startDrag({
      onMove: (hit, ev) => {
        if (!grab) {
          grab = {
            dx: startGX - worldToGrid(hit.x, cellSize),
            dz: startGZ - worldToGrid(hit.z, cellSize),
          }
        }
        let gx = worldToGrid(hit.x, cellSize) + grab.dx
        let gz = worldToGrid(hit.z, cellSize) + grab.dz

        if (ev.shiftKey) {
          // Latch to the dominant axis once, then pin the other to its start value.
          if (!axis && (gx !== startGX || gz !== startGZ)) {
            axis = Math.abs(gx - startGX) >= Math.abs(gz - startGZ) ? 'x' : 'z'
          }
          if (axis === 'x') gz = startGZ
          else if (axis === 'z') gx = startGX
        } else {
          axis = null
        }

        if (isGroup || isCopy) {
          const g = computeGroupGhost(ids, gx - startGX, gz - startGZ, isCopy)
          if (!g) return
          if (!moved && g.dGridX === 0 && g.dGridZ === 0) return
          moved = true
          editor().setGroupGhost(g)
          return
        }

        const ghost = computeGhost(
          templateId,
          gridToWorld(gx, cellSize),
          gridToWorld(gz, cellSize),
          rotation,
          rackId,
          // Ctrl places without joining (Alt is copy-drag, Shift is axis-lock).
          { snap: !(ev.ctrlKey || ev.metaKey) },
        )
        if (!ghost) return
        if (!moved && ghost.gridX === startGX && ghost.gridZ === startGZ) return
        moved = true
        editor().setGhost(ghost)
      },

      onEnd: (committed) => {
        draggingRef.current = false
        if (committed && moved) commitMoveGhost()
        const ed2 = editor()
        ed2.setMovingRackId(null)
        ed2.setMovingRackIds([])
        ed2.setGhost(null)
        ed2.setGroupGhost(null)
      },
    })
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
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      editor().toggleRackSelection(rackId)
      return
    }
    // A single selected rack drills into slot selection on a second click.
    if (selected && editor().selectedRackIds.size === 1 && groupRef.current) {
      // Pick the slot under the click from the intersection point — no extra raycast needed.
      tmpLocal.copy(e.point)
      groupRef.current.worldToLocal(tmpLocal)
      const innerW = template.bays * template.bayWidth
      const bay = Math.min(
        template.bays - 1,
        Math.max(0, Math.floor((tmpLocal.x + innerW / 2) / template.bayWidth)),
      )
      const level = levelAtHeight(template, Math.max(0, tmpLocal.y))
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
      <RackFrame
        template={template}
        skipStart={!anyDrag && (skipMask & 1) !== 0}
        skipEnd={!anyDrag && (skipMask & 2) !== 0}
      />
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
        {/* Sized to the structural span, not the footprint: joined racks overlap by one
            upright thickness, and a full-width pick box would make that sliver ambiguous. */}
        <boxGeometry args={[template.bays * template.bayWidth, h, d]} />
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
          {/* The primary of a multi-selection gets the solid ring; the rest read as secondary. */}
          {selected && <Edges color="#4c9aff" opacity={isPrimary ? 1 : 0.45} transparent />}
        </mesh>
      )}
    </animated.group>
  )
}
