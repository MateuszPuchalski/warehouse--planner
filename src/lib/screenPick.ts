import * as THREE from 'three'
import type { MarqueeRect, WarehouseLayout } from '../types'
import { rackIndex } from './collision'
import { getLocalSize } from './rackGeometry'

const tmpVec = new THREE.Vector3()

/** Normalize a drag rectangle so x0/y0 is the top-left corner. */
export function normalizeRect(r: MarqueeRect): MarqueeRect {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  }
}

/**
 * Racks whose projected screen bounds intersect a marquee rectangle.
 *
 * Projecting the eight corners of each rack's box and comparing screen-space bounds
 * matches what the user actually sees under perspective, and needs no frustum
 * plumbing. Eight projections per rack is cheap enough to run on every pointermove.
 */
export function racksInScreenRect(
  layout: WarehouseLayout,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  rect: MarqueeRect,
): string[] {
  const r = normalizeRect(rect)
  const bounds = canvas.getBoundingClientRect()
  const out: string[] = []

  for (const entry of rackIndex(layout)) {
    const rack = layout.racks[entry.id]
    const template = rack ? layout.templates[rack.templateId] : undefined
    if (!template) continue
    const { h } = getLocalSize(template)
    const { minX, maxX, minZ, maxZ } = entry.aabb

    let sMinX = Infinity
    let sMinY = Infinity
    let sMaxX = -Infinity
    let sMaxY = -Infinity
    let anyInFront = false

    for (const x of [minX, maxX]) {
      for (const z of [minZ, maxZ]) {
        for (const y of [0, h]) {
          tmpVec.set(x, y, z).project(camera)
          // z outside [-1,1] means the corner is behind the camera / beyond the far plane.
          if (tmpVec.z >= -1 && tmpVec.z <= 1) anyInFront = true
          const sx = bounds.left + ((tmpVec.x + 1) / 2) * bounds.width
          const sy = bounds.top + ((1 - tmpVec.y) / 2) * bounds.height
          if (sx < sMinX) sMinX = sx
          if (sx > sMaxX) sMaxX = sx
          if (sy < sMinY) sMinY = sy
          if (sy > sMaxY) sMaxY = sy
        }
      }
    }

    if (!anyInFront) continue
    if (sMaxX < r.x0 || sMinX > r.x1 || sMaxY < r.y0 || sMinY > r.y1) continue
    out.push(entry.id)
  }
  return out
}
