import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RackTemplate } from '../types'
import { buildMembers, type Member } from '../lib/rackGeometry'
import { boxGeo, uprightMat, beamMat, deckMat } from './materials'

const tmpMat4 = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const IDENTITY_QUAT = new THREE.Quaternion()

function MemberInstances({ members, material }: { members: Member[]; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      tmpMat4.compose(
        tmpPos.set(m.pos[0], m.pos[1], m.pos[2]),
        IDENTITY_QUAT,
        tmpScale.set(m.scale[0], m.scale[1], m.scale[2]),
      )
      mesh.setMatrixAt(i, tmpMat4)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [members])

  if (members.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      geometry={boxGeo}
      material={material}
      args={[undefined, undefined, members.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

/** Structural frame of one rack (uprights, beams, shelf decks), instanced per member type. */
export function RackFrame({
  template,
  materialOverride,
}: {
  template: RackTemplate
  materialOverride?: THREE.Material
}) {
  const members = useMemo(() => buildMembers(template), [template])
  return (
    <group>
      <MemberInstances members={members.uprights} material={materialOverride ?? uprightMat} />
      <MemberInstances members={members.beams} material={materialOverride ?? beamMat} />
      <MemberInstances members={members.decks} material={materialOverride ?? deckMat} />
    </group>
  )
}
