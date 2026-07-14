import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import type { RackInstance, RackTemplate } from '../types'
import { allSlots, getSlotCell, parseSlotKey } from '../lib/rackGeometry'
import { slotColor } from '../lib/colorModes'
import { useEditorStore } from '../store/useEditorStore'
import { boxGeo, slotMat } from './materials'

const tmpMat4 = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpColor = new THREE.Color()
const IDENTITY_QUAT = new THREE.Quaternion()

/** Translucent color-coded boxes filling each slot of a rack (purely visual; picking is math-based). */
export function SlotCells({ rack, template }: { rack: RackInstance; template: RackTemplate }) {
  const colorMode = useEditorStore((s) => s.colorMode)
  const selectedSlotKey = useEditorStore((s) =>
    s.selectedRackId === rack.id ? s.selectedSlotKey : null,
  )
  const ref = useRef<THREE.InstancedMesh>(null)
  const slots = useMemo(() => allSlots(template, rack), [template, rack])
  const count = template.bays * template.levels

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const cell = getSlotCell(template, slot.bay, slot.level)
      tmpMat4.compose(
        tmpPos.set(cell.pos[0], cell.pos[1], cell.pos[2]),
        IDENTITY_QUAT,
        tmpScale.set(cell.scale[0], cell.scale[1], cell.scale[2]),
      )
      mesh.setMatrixAt(i, tmpMat4)
      mesh.setColorAt(i, tmpColor.set(slotColor(slot, colorMode)))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [slots, template, colorMode])

  const selectedCell = useMemo(() => {
    if (!selectedSlotKey) return null
    const { bay, level } = parseSlotKey(selectedSlotKey)
    if (bay >= template.bays || level >= template.levels) return null
    return getSlotCell(template, bay, level)
  }, [selectedSlotKey, template])

  return (
    <group>
      <instancedMesh
        ref={ref}
        geometry={boxGeo}
        material={slotMat}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      />
      {selectedCell && (
        <mesh position={selectedCell.pos}>
          <boxGeometry args={selectedCell.scale} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} />
          <Edges color="#ffffff" />
        </mesh>
      )}
    </group>
  )
}
