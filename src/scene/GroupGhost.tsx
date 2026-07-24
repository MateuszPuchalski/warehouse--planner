import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { gridToWorld } from '../lib/grid'
import { RackFrame } from './RackFrame'
import { ghostValidMat, ghostInvalidMat } from './materials'

/** Above this many racks the preview drops to flat footprints to stay smooth. */
const MAX_FRAMES = 60

/**
 * Translucent preview of a rigid group move, an alt-drag copy, or an array. Distance
 * guides are deliberately left to GhostRack (anchor only) — one measure pass per rack
 * would be the real cost here, and N badges would be unreadable anyway.
 */
export function GroupGhost() {
  const groupGhost = useEditorStore((s) => s.groupGhost)
  const layout = useWarehouseStore((s) => s.layout)

  useFrame(({ clock }) => {
    const pulse = 0.34 + 0.12 * Math.sin(clock.elapsedTime * 5)
    ghostValidMat.opacity = pulse
    ghostInvalidMat.opacity = pulse
  })

  if (!groupGhost) return null
  const cell = layout.floor.cellSize
  const frames = groupGhost.items.length <= MAX_FRAMES

  return (
    <group>
      {groupGhost.items.map((item) => {
        const template = layout.templates[item.templateId]
        if (!template) return null
        const mat = item.valid ? ghostValidMat : ghostInvalidMat
        return (
          <group
            key={item.rackId}
            position={[gridToWorld(item.gridX, cell), 0, gridToWorld(item.gridZ, cell)]}
            rotation-y={THREE.MathUtils.degToRad(item.rotation)}
          >
            {frames ? (
              <RackFrame template={template} materialOverride={mat} />
            ) : (
              <mesh position={[0, 0.06, 0]} rotation-x={-Math.PI / 2} material={mat}>
                <planeGeometry
                  args={[template.bays * template.bayWidth + template.uprightSize, template.depth]}
                />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
