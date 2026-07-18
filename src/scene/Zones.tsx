import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import type { Zone as ZoneType } from '../types'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { zoneColor, zoneRectM } from '../lib/zones'

function Zone({ zone }: { zone: ZoneType }) {
  const cell = useWarehouseStore((s) => s.layout.floor.cellSize)
  const mode = useEditorStore((s) => s.mode)
  const selected = useEditorStore((s) => s.selectedZoneId === zone.id)

  const color = zoneColor(zone)
  const { cx, cz, w, d } = zoneRectM(zone, cell)

  const fillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: selected ? 0.38 : 0.22,
        depthWrite: false,
      }),
    [color, selected],
  )
  const boxMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    [color],
  )
  const outline = useMemo<[number, number, number][]>(() => {
    const hw = w / 2
    const hd = d / 2
    return [
      [-hw, 0, -hd],
      [hw, 0, -hd],
      [hw, 0, hd],
      [-hw, 0, hd],
      [-hw, 0, -hd],
    ]
  }, [w, d])

  if (w < 0.05 || d < 0.05) return null
  const h = zone.heightM ?? 0

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    if (mode === 'delete') {
      e.stopPropagation()
      useWarehouseStore.getState().deleteZone(zone.id)
      if (selected) useEditorStore.getState().selectZone(null)
      return
    }
    if (mode === 'select') {
      e.stopPropagation()
      useEditorStore.getState().selectZone(zone.id)
    }
  }

  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} material={fillMat} onClick={onClick}>
        <planeGeometry args={[w, d]} />
      </mesh>
      <group position={[0, 0.035, 0]}>
        <Line points={outline} color={color} lineWidth={selected ? 2.5 : 1.5} />
      </group>
      {h > 0 && (
        <mesh position={[0, h / 2, 0]} material={boxMat}>
          <boxGeometry args={[w, h, d]} />
        </mesh>
      )}
      <Html center position={[0, h + 0.5, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div
          className="rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap"
          style={{
            background: 'rgba(23,26,32,0.92)',
            borderColor: selected ? '#4c9aff' : color,
            color: selected ? '#4c9aff' : color,
          }}
        >
          {zone.label}
        </div>
      </Html>
    </group>
  )
}

/** All placed zones — flat colored floor rectangles with a label, optional extruded volume. */
export function Zones() {
  const zones = useWarehouseStore((s) => s.layout.zones)
  return (
    <>
      {Object.values(zones).map((z) => (
        <Zone key={z.id} zone={z} />
      ))}
    </>
  )
}
