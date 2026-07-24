import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const raycaster = new THREE.Raycaster()
const tmpNdc = new THREE.Vector2()
const tmpHit = new THREE.Vector3()

export interface FloorHit {
  x: number
  z: number
}

export interface PlaneDragSpec {
  /** Fires on every window pointermove whose ray hits the floor plane. */
  onMove: (hit: FloorHit, ev: PointerEvent) => void
  /** committed=false when Escape or a right-click aborted the gesture. */
  onEnd: (committed: boolean) => void
}

/**
 * Floor-plane drag driven by window listeners rather than pointer capture, so the
 * gesture keeps tracking when the pointer leaves the mesh or the canvas. Owns
 * OrbitControls suppression, Escape-to-abort, and listener cleanup on unmount.
 */
export function usePlaneDrag(): (spec: PlaneDragSpec) => void {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const cleanupRef = useRef<(() => void) | null>(null)

  // A drag in flight when the component unmounts must not leak window listeners.
  useEffect(() => () => cleanupRef.current?.(), [])

  return useCallback(
    (spec: PlaneDragSpec) => {
      if (cleanupRef.current) return
      if (controls) controls.enabled = false

      const finish = (committed: boolean) => {
        if (!cleanupRef.current) return
        cleanupRef.current()
        cleanupRef.current = null
        if (controls) controls.enabled = true
        spec.onEnd(committed)
      }

      const onMove = (ev: PointerEvent) => {
        const rect = gl.domElement.getBoundingClientRect()
        tmpNdc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(tmpNdc, camera)
        if (!raycaster.ray.intersectPlane(FLOOR_PLANE, tmpHit)) return
        spec.onMove({ x: tmpHit.x, z: tmpHit.z }, ev)
      }

      const onUp = () => finish(true)
      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault()
          finish(false)
        }
      }
      const onContextMenu = (ev: Event) => {
        ev.preventDefault()
        finish(false)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('contextmenu', onContextMenu)
      cleanupRef.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('contextmenu', onContextMenu)
      }
    },
    [camera, gl, controls],
  )
}
