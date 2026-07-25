import type { RackInstance, RackRotation, RackTemplate, WarehouseLayout } from '../types'
import { getLevelOffsets } from './rackGeometry'

/**
 * How close two structural spans must sit to count as joined, in meters. An order of
 * magnitude above float noise from fractional grid coordinates, and well below the
 * smallest upright thickness in use (0.04 m), so "joined" can never be confused with
 * "genuinely overlapping".
 */
export const JOIN_TOL = 0.005

/**
 * Identity of a rack's joining system. Templates sharing this key can share an upright
 * frame, so they may sit in one run whatever their level layout is: same declared frame
 * system, same depth, same upright thickness — the three things the shared post has to
 * agree on. A template with no declared system falls back to its own id, which keeps the
 * old "identical templates only" behaviour for everything that predates this.
 */
export function joinKeyOf(t: RackTemplate): string {
  const sys = t.frameSystem?.trim()
  return sys ? `sys:${sys}|${t.depth.toFixed(3)}|${t.uprightSize.toFixed(3)}` : `tpl:${t.id}`
}

/** Whether two templates may share an upright frame. */
export function canJoin(a: RackTemplate, b: RackTemplate): boolean {
  return joinKeyOf(a) === joinKeyOf(b)
}

/** Outer height of a rack: top of the highest level plus its beam. */
export function frameHeightOf(t: RackTemplate): number {
  return getLevelOffsets(t)[t.levels] + t.beamHeight
}

/** Structural width: upright centre to upright centre, i.e. the beam span. */
export function structuralWidth(t: RackTemplate): number {
  return t.bays * t.bayWidth
}

/** Axis a rack's bays run along, given its rotation. */
export function runAxis(rotation: RackRotation): 'x' | 'z' {
  return rotation === 90 || rotation === 270 ? 'z' : 'x'
}

/** Centre-to-centre distance at which two racks share one upright frame. */
export function joinedSpacing(a: RackTemplate, b: RackTemplate): number {
  return (structuralWidth(a) + structuralWidth(b)) / 2
}

/**
 * Whether the rack's local +X points along the positive run axis. Rotating by θ maps
 * local (x,z) to world (x·cosθ + z·sinθ, −x·sinθ + z·cosθ), so local +X lands on
 * world +X at 0°, −Z at 90°, −X at 180° and +Z at 270°.
 */
export function localPlusIsPositiveRun(rotation: RackRotation): boolean {
  return rotation === 0 || rotation === 270
}

/** Along-axis and cross-axis world coordinates of a rack centre. */
export function runCoords(
  gridX: number,
  gridZ: number,
  rotation: RackRotation,
  cellSize: number,
): { along: number; cross: number } {
  const x = gridX * cellSize
  const z = gridZ * cellSize
  return runAxis(rotation) === 'x' ? { along: x, cross: z } : { along: z, cross: x }
}

export interface RunFlags {
  /** Id of the first rack in the chain. */
  runId: string
  indexInRun: number
  runLength: number
  /** Omit the upright pair at the rack's LOCAL −X end. */
  skipStart: boolean
  /** Omit the upright pair at the rack's LOCAL +X end. */
  skipEnd: boolean
}

const runCache = new WeakMap<WarehouseLayout, Map<string, RunFlags>>()

/**
 * Group racks into continuous runs that share upright frames, memoized on layout
 * identity (every store mutation runs the layout through `touch()`, so identity is a
 * correct cache key — the same trick `rackIndex` uses).
 *
 * Racks join only when they use the same template, face the same way (0°≡180° and
 * 90°≡270°, since the frame is symmetric on both local axes), sit on the same
 * cross-axis line, and their structural spans meet within `JOIN_TOL`.
 */
export function runIndex(layout: WarehouseLayout): Map<string, RunFlags> {
  const hit = runCache.get(layout)
  if (hit) return hit

  const cell = layout.floor.cellSize
  const out = new Map<string, RunFlags>()

  const buckets = new Map<string, RackInstance[]>()
  for (const rack of Object.values(layout.racks)) {
    if (!layout.templates[rack.templateId]) continue
    const { cross } = runCoords(rack.gridX, rack.gridZ, rack.rotation, cell)
    // 0°≡180° and 90°≡270° render identically, so they may share a run.
    const key = `${joinKeyOf(layout.templates[rack.templateId])}|${rack.rotation % 180}|${cross.toFixed(3)}`
    const list = buckets.get(key)
    if (list) list.push(rack)
    else buckets.set(key, [rack])
  }

  for (const [key, racks] of buckets) {
    // A run may now mix templates of one frame system, so width and height are per rack.
    const halfW = (r: RackInstance) => structuralWidth(layout.templates[r.templateId]) / 2
    const heightOf = (r: RackInstance) => frameHeightOf(layout.templates[r.templateId])
    const along = (r: RackInstance) => runCoords(r.gridX, r.gridZ, r.rotation, cell).along
    racks.sort((a, b) => along(a) - along(b))

    let chain: RackInstance[] = []
    const flush = () => {
      if (chain.length === 0) return
      const runId = `${key}#${chain[0].id}`
      // Each junction keeps exactly ONE post, and it has to be the TALLER of the two —
      // otherwise a tall rack next to a short one would lose the upper part of its frame.
      // Equal heights keep the old rule: the downstream rack drops its post.
      const drop = chain.map(() => ({ low: false, high: false }))
      for (let i = 1; i < chain.length; i++) {
        if (heightOf(chain[i]) > heightOf(chain[i - 1]) + JOIN_TOL) drop[i - 1].high = true
        else drop[i].low = true
      }
      chain.forEach((rack, i) => {
        // Run-relative ends, expressed in the rack's own local terms.
        const lowEndIsLocalStart = localPlusIsPositiveRun(rack.rotation)
        out.set(rack.id, {
          runId,
          indexInRun: i,
          runLength: chain.length,
          skipStart: lowEndIsLocalStart ? drop[i].low : drop[i].high,
          skipEnd: lowEndIsLocalStart ? drop[i].high : drop[i].low,
        })
      })
      chain = []
    }

    for (const rack of racks) {
      if (chain.length > 0) {
        const prev = chain[chain.length - 1]
        const gap = along(rack) - halfW(rack) - (along(prev) + halfW(prev))
        // A real overlap deeper than tolerance is a defect, not a join — leave both
        // frames complete so it stays visible.
        if (Math.abs(gap) > JOIN_TOL) flush()
      }
      chain.push(rack)
    }
    flush()
  }

  runCache.set(layout, out)
  return out
}

/**
 * Skip flags as a bitmask (bit0 = local start, bit1 = local end). Returning a
 * primitive keeps zustand's `Object.is` selector comparison from re-rendering every
 * rack in the warehouse whenever any of them moves.
 */
export function uprightSkipMask(layout: WarehouseLayout, rackId: string): number {
  const flags = runIndex(layout).get(rackId)
  if (!flags) return 0
  return (flags.skipStart ? 1 : 0) | (flags.skipEnd ? 2 : 0)
}
