import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { aabbFor } from '../lib/rackGeometry'
import { measureToNeighbors } from '../lib/collision'
import { gridToWorld } from '../lib/grid'
import { RackFrame } from './RackFrame'
import { ghostValidMat, ghostInvalidMat } from './materials'

/** Translucent preview while placing or moving a rack, with aisle distance guides. */
export function GhostRack() {
  const ghost = useEditorStore((s) => s.ghost)
  const mode = useEditorStore((s) => s.mode)
  const placingTemplateId = useEditorStore((s) => s.placingTemplateId)
  const movingRackId = useEditorStore((s) => s.movingRackId)
  const layout = useWarehouseStore((s) => s.layout)

  useFrame(({ clock }) => {
    const pulse = 0.34 + 0.12 * Math.sin(clock.elapsedTime * 5)
    ghostValidMat.opacity = pulse
    ghostInvalidMat.opacity = pulse
  })

  const templateId =
    mode === 'place' ? placingTemplateId : movingRackId ? layout.racks[movingRackId]?.templateId : null
  const template = templateId ? layout.templates[templateId] : null

  const lines = useMemo(() => {
    if (!ghost || !template) return []
    const aabb = aabbFor(ghost.gridX, ghost.gridZ, ghost.rotation, template, layout.floor.cellSize)
    const others = Object.values(layout.racks)
      .filter((r) => r.id !== movingRackId)
      .map((r) => {
        const t = layout.templates[r.templateId]
        return t ? aabbFor(r.gridX, r.gridZ, r.rotation, t, layout.floor.cellSize) : null
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
    return measureToNeighbors(aabb, others, layout.floor.minAisleWidthM)
  }, [ghost, template, layout, movingRackId])

  if (!ghost || !template) return null

  const cell = layout.floor.cellSize
  return (
    <group>
      <group
        position={[gridToWorld(ghost.gridX, cell), 0, gridToWorld(ghost.gridZ, cell)]}
        rotation-y={THREE.MathUtils.degToRad(ghost.rotation)}
      >
        <RackFrame template={template} materialOverride={ghost.valid ? ghostValidMat : ghostInvalidMat} />
      </group>

      {lines.map((l, i) => {
        const mid: [number, number, number] = [
          (l.from[0] + l.to[0]) / 2,
          0.4,
          (l.from[2] + l.to[2]) / 2,
        ]
        const color = l.ok ? '#3ddc84' : '#ff5c5c'
        return (
          <group key={i}>
            <Line points={[l.from, l.to]} color={color} lineWidth={1.5} dashed dashSize={0.3} gapSize={0.18} />
            <Html center position={mid} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
              <div
                className="rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap"
                style={{
                  background: 'rgba(23,26,32,0.92)',
                  borderColor: color,
                  color,
                }}
              >
                {l.gap.toFixed(2)} m
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
