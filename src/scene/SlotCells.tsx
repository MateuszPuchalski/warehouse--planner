import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import type { RackInstance, RackTemplate } from '../types'
import { allSlots, effectiveVolume, getSlotCell, parseSlotKey } from '../lib/rackGeometry'
import { carrierKind, proxyTransforms, stockProxyFill } from '../lib/loadProxy'
import { slotColor, utilizationColor } from '../lib/colorModes'
import { useEditorStore } from '../store/useEditorStore'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useRackStock } from '../store/useStockStore'
import { boxGeo, slotMat, loadMat, palletBaseMat } from './materials'

const tmpMat4 = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpColor = new THREE.Color()
const IDENTITY_QUAT = new THREE.Quaternion()
const ZERO_SCALE = new THREE.Vector3(0, 0, 0)
const UNKNOWN_COLOR = '#94a3b8'

/** Translucent color-coded boxes filling each slot of a rack (purely visual; picking is math-based). */
export function SlotCells({ rack, template }: { rack: RackInstance; template: RackTemplate }) {
  const colorMode = useEditorStore((s) => s.colorMode)
  const showLoadProxies = useWarehouseStore((s) => s.layout.floor.showLoadProxies)
  const selectedSlotKey = useEditorStore((s) =>
    s.selectedRackId === rack.id ? s.selectedSlotKey : null,
  )
  const suggestedSlots = useEditorStore((s) => s.suggestedSlots)
  const ref = useRef<THREE.InstancedMesh>(null)
  const loadRef = useRef<THREE.InstancedMesh>(null)
  const baseRef = useRef<THREE.InstancedMesh>(null)
  const slots = useMemo(() => allSlots(template, rack), [template, rack])
  const stock = useRackStock(rack.code)
  const count = template.bays * template.levels

  const proxiesVisible = showLoadProxies && (colorMode === 'stock' || colorMode === 'volume')

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
      const stockItems = stock?.[slot.key]
      const volUtil = effectiveVolume(slot, stockItems).util
      mesh.setColorAt(i, tmpColor.set(slotColor(slot, colorMode, stockItems?.length ?? 0, volUtil)))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [slots, template, colorMode, stock])

  // Load proxies: a solid box (+ pallet base) sitting in each slot that holds
  // stock, sized to the stock-derived volume fill. Empty slots collapse to zero.
  useLayoutEffect(() => {
    const load = loadRef.current
    const base = baseRef.current
    if (!load || !base) return
    const carrier = carrierKind(template)
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const cell = getSlotCell(template, slot.bay, slot.level)
      const fill = proxiesVisible ? stockProxyFill(slot, stock?.[slot.key]) : null
      if (!fill) {
        tmpMat4.compose(tmpPos.set(cell.pos[0], cell.pos[1], cell.pos[2]), IDENTITY_QUAT, ZERO_SCALE)
        load.setMatrixAt(i, tmpMat4)
        base.setMatrixAt(i, tmpMat4)
        continue
      }
      const { load: lm, base: bm } = proxyTransforms(template, slot.level, fill.util, carrier)
      tmpMat4.compose(
        tmpPos.set(cell.pos[0] + lm.pos[0], lm.pos[1], cell.pos[2] + lm.pos[2]),
        IDENTITY_QUAT,
        tmpScale.set(lm.scale[0], lm.scale[1], lm.scale[2]),
      )
      load.setMatrixAt(i, tmpMat4)
      load.setColorAt(i, tmpColor.set(fill.hasVolume ? utilizationColor(fill.util) : UNKNOWN_COLOR))
      if (bm) {
        tmpMat4.compose(
          tmpPos.set(cell.pos[0] + bm.pos[0], bm.pos[1], cell.pos[2] + bm.pos[2]),
          IDENTITY_QUAT,
          tmpScale.set(bm.scale[0], bm.scale[1], bm.scale[2]),
        )
      } else {
        tmpMat4.compose(tmpPos.set(cell.pos[0], cell.pos[1], cell.pos[2]), IDENTITY_QUAT, ZERO_SCALE)
      }
      base.setMatrixAt(i, tmpMat4)
    }
    load.instanceMatrix.needsUpdate = true
    base.instanceMatrix.needsUpdate = true
    if (load.instanceColor) load.instanceColor.needsUpdate = true
  }, [slots, template, stock, proxiesVisible])

  const selectedCell = useMemo(() => {
    if (!selectedSlotKey) return null
    const { bay, level } = parseSlotKey(selectedSlotKey)
    if (bay >= template.bays || level >= template.levels) return null
    return getSlotCell(template, bay, level)
  }, [selectedSlotKey, template])

  const suggestedCells = useMemo(() => {
    if (suggestedSlots.size === 0) return []
    return slots
      .filter((s) => suggestedSlots.has(`${rack.id}:${s.key}`))
      .map((s) => getSlotCell(template, s.bay, s.level))
  }, [suggestedSlots, slots, rack.id, template])

  return (
    <group>
      <instancedMesh
        ref={ref}
        geometry={boxGeo}
        material={slotMat}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={baseRef}
        geometry={boxGeo}
        material={palletBaseMat}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        raycast={() => null}
      />
      <instancedMesh
        ref={loadRef}
        geometry={boxGeo}
        material={loadMat}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        raycast={() => null}
      />
      {suggestedCells.map((cell, i) => (
        <mesh key={`sug${i}`} position={cell.pos} raycast={() => null}>
          <boxGeometry args={cell.scale} />
          <meshBasicMaterial color="#3ddc84" transparent opacity={0.28} depthWrite={false} />
          <Edges color="#3ddc84" />
        </mesh>
      ))}
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
