import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { validateAisles } from '../lib/collision'

/** Red overlay zones + distance badges wherever two facing racks are closer than the minimum aisle width. */
export function AisleGuides() {
  const layout = useWarehouseStore((s) => s.layout)
  const violations = useMemo(() => validateAisles(layout), [layout])

  if (!layout.floor.showAisleGuides) return null

  return (
    <group>
      {violations.map((v, i) => {
        const w = Math.max(0.02, v.zone.maxX - v.zone.minX)
        const d = Math.max(0.02, v.zone.maxZ - v.zone.minZ)
        const cx = (v.zone.minX + v.zone.maxX) / 2
        const cz = (v.zone.minZ + v.zone.maxZ) / 2
        return (
          <group key={`${v.rackA}-${v.rackB}-${i}`}>
            <mesh rotation-x={-Math.PI / 2} position={[cx, 0.015, cz]}>
              <planeGeometry args={[w, d]} />
              <meshBasicMaterial color="#ff4444" transparent opacity={0.22} depthWrite={false} />
            </mesh>
            <Html center position={[cx, 0.5, cz]} style={{ pointerEvents: 'none' }} zIndexRange={[15, 0]}>
              <div
                className="rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
                style={{
                  background: 'rgba(23,26,32,0.92)',
                  borderColor: '#ff5c5c',
                  color: '#ff5c5c',
                }}
              >
                {v.gap.toFixed(1)} m &lt; {layout.floor.minAisleWidthM.toFixed(1)} m
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
