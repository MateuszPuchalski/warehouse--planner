import type { Wall, WarehouseLayout } from '../types'
import { rackIndex } from './collision'
import { pickRoute, type PickStop } from './pickPath'
import { computeWallCuts } from './walls'

/**
 * Route geometry: where the picker actually walks between the stops that `pickPath`
 * ordered. `pickPath` owns the ORDER (from the ERP codes); this file owns the PATH.
 *
 * The floor is rasterized into a coarse occupancy grid and each leg is an A* through it,
 * so the route runs down the aisles instead of cutting through racks. A corridor graph
 * built from `aisleCorridors` was the alternative, but that list only covers rack pairs
 * facing each other across a clear gap — no perimeter aisles, no cross aisles, no open
 * floor, no junctions — so it would need all of that synthesised and still need a
 * fallback. One uniform grid answers every leg and degrades per leg.
 */

/** Extra margin around racks and walls so the path does not scrape them. */
const CLEARANCE_M = 0.15
/** Above this the grid is not worth building; every leg degrades to a straight line. */
const MAX_CELLS = 40_000
/** Per-leg search budget. Exceeded → that leg degrades to a straight line. */
const MAX_POPS = 20_000
/** How far from a blocked stand point we look for somewhere to stand. */
const STAND_SEARCH_M = 3

export interface WalkGrid {
  cell: number
  nx: number
  nz: number
  /** World coordinate of the centre of cell (0,0). */
  originX: number
  originZ: number
  blocked: Uint8Array
  /** True when the floor was too large to rasterize — every cell reads as free. */
  degraded: boolean
}

const gridCache = new WeakMap<WarehouseLayout, WalkGrid>()

function markBox(
  g: WalkGrid,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): void {
  const i0 = Math.max(0, Math.floor((minX - CLEARANCE_M - g.originX) / g.cell + 0.5))
  const i1 = Math.min(g.nx - 1, Math.ceil((maxX + CLEARANCE_M - g.originX) / g.cell - 0.5))
  const j0 = Math.max(0, Math.floor((minZ - CLEARANCE_M - g.originZ) / g.cell + 0.5))
  const j1 = Math.min(g.nz - 1, Math.ceil((maxZ + CLEARANCE_M - g.originZ) / g.cell - 0.5))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) g.blocked[j * g.nx + i] = 1
  }
}

/** Solid stretches of a wall as world boxes, so a gate or door stays walkable. */
function wallSolidBoxes(wall: Wall, cellSize: number): [number, number, number, number][] {
  const x1 = wall.x1 * cellSize
  const z1 = wall.z1 * cellSize
  const x2 = wall.x2 * cellSize
  const z2 = wall.z2 * cellSize
  const { lengthM, solids } = computeWallCuts(wall, cellSize)
  if (lengthM <= 0) return []
  const ux = (x2 - x1) / lengthM
  const uz = (z2 - z1) / lengthM
  const half = wall.thicknessM / 2
  return solids.map((s) => {
    const ax = x1 + ux * s.start
    const az = z1 + uz * s.start
    const bx = x1 + ux * s.end
    const bz = z1 + uz * s.end
    return [
      Math.min(ax, bx) - half,
      Math.min(az, bz) - half,
      Math.max(ax, bx) + half,
      Math.max(az, bz) + half,
    ]
  })
}

/** Walkable-floor raster for a layout, memoized on layout identity. */
export function walkGrid(layout: WarehouseLayout): WalkGrid {
  const hit = gridCache.get(layout)
  if (hit) return hit

  // Fine enough to fit between racks, coarse enough to stay cheap. The clearance margin
  // must stay under half a cell or it would swallow legal corridors.
  const cell = Math.min(0.5, Math.max(0.25, layout.floor.cellSize))
  const hw = layout.floor.widthM / 2
  const hd = layout.floor.depthM / 2
  const nx = Math.max(1, Math.ceil(layout.floor.widthM / cell))
  const nz = Math.max(1, Math.ceil(layout.floor.depthM / cell))

  if (nx * nz > MAX_CELLS) {
    const g: WalkGrid = {
      cell,
      nx: 1,
      nz: 1,
      originX: 0,
      originZ: 0,
      blocked: new Uint8Array(1),
      degraded: true,
    }
    gridCache.set(layout, g)
    return g
  }

  const g: WalkGrid = {
    cell,
    nx,
    nz,
    originX: -hw + cell / 2,
    originZ: -hd + cell / 2,
    blocked: new Uint8Array(nx * nz),
    degraded: false,
  }

  for (const entry of rackIndex(layout)) {
    markBox(g, entry.aabb.minX, entry.aabb.minZ, entry.aabb.maxX, entry.aabb.maxZ)
  }
  // Walls come from their SOLID stretches, not their bounding boxes: a wall with a gate is
  // not a barrier, and the sample's packing room is only reachable through one.
  for (const wall of Object.values(layout.walls ?? {})) {
    for (const [minX, minZ, maxX, maxZ] of wallSolidBoxes(wall, layout.floor.cellSize)) {
      markBox(g, minX, minZ, maxX, maxZ)
    }
  }

  gridCache.set(layout, g)
  return g
}

/**
 * Walking distance in meters from one origin to EVERY cell of the grid, as a flood fill.
 * Slotting needs "how far is this rack from the dock" for every rack at once; one sweep
 * answers all of them, where a per-rack A* would re-search the same hall each time.
 * Unreachable cells stay `Infinity`. Returns null when the grid is degraded, so callers
 * fall back to straight-line distance rather than reading a field of zeros.
 */
export function walkDistanceField(layout: WarehouseLayout, x: number, z: number): Float32Array | null {
  const g = walkGrid(layout)
  if (g.degraded) return null
  const start = nearestFreeCell(g, x, z)
  if (!start) return null

  const dist = new Float32Array(g.nx * g.nz).fill(Infinity)
  const from = start.j * g.nx + start.i
  dist[from] = 0
  // 4-neighbour BFS: every step costs one cell, so the queue stays in distance order.
  const queue = new Int32Array(g.nx * g.nz)
  queue[0] = from
  let head = 0
  let tail = 1
  while (head < tail) {
    const cur = queue[head++]
    const ci = cur % g.nx
    const cj = (cur - ci) / g.nx
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = ci + di
      const nj = cj + dj
      if (!inside(g, ni, nj)) continue
      const nb = nj * g.nx + ni
      if (g.blocked[nb] === 1 || dist[nb] !== Infinity) continue
      dist[nb] = dist[cur] + g.cell
      queue[tail++] = nb
    }
  }
  return dist
}

/** Distance field lookup at a world point, snapped to the nearest walkable cell. */
export function distanceAt(g: WalkGrid, field: Float32Array, x: number, z: number): number | null {
  const cell = nearestFreeCell(g, x, z)
  if (!cell) return null
  const d = field[cell.j * g.nx + cell.i]
  return Number.isFinite(d) ? d : null
}

function toCell(g: WalkGrid, x: number, z: number): { i: number; j: number } {
  return {
    i: Math.round((x - g.originX) / g.cell),
    j: Math.round((z - g.originZ) / g.cell),
  }
}

function inside(g: WalkGrid, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < g.nx && j < g.nz
}

/**
 * Nearest walkable cell to a world point, searched in growing rings. A stand point sits
 * 0.4 m off the rack face, which lands inside the clearance margin whenever racks stand
 * back to back or flush to a wall — without this the whole route would degrade.
 */
export function nearestFreeCell(g: WalkGrid, x: number, z: number): { i: number; j: number } | null {
  const { i, j } = toCell(g, x, z)
  const maxR = Math.ceil(STAND_SEARCH_M / g.cell)
  for (let r = 0; r <= maxR; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        // Ring only: the interior was covered by a smaller r.
        if (r > 0 && Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
        const ci = i + di
        const cj = j + dj
        if (!inside(g, ci, cj)) continue
        if (g.blocked[cj * g.nx + ci] === 0) return { i: ci, j: cj }
      }
    }
  }
  return null
}

/** Whether the straight segment between two world points stays on walkable cells. */
function clearHop(g: WalkGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az)
  const steps = Math.max(1, Math.ceil(len / (g.cell / 2)))
  for (let s = 0; s <= steps; s++) {
    const { i, j } = toCell(g, ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps)
    if (!inside(g, i, j) || g.blocked[j * g.nx + i] === 1) return false
  }
  return true
}

/**
 * A* between two cells, 4-neighbour: walking a hall is Manhattan, and diagonals would cut
 * the corners off rack ends. Ties break towards keeping the current direction, so paths
 * come out as a few long straights instead of a staircase.
 */
function findPath(g: WalkGrid, from: { i: number; j: number }, to: { i: number; j: number }): number[] | null {
  const n = g.nx * g.nz
  const start = from.j * g.nx + from.i
  const goal = to.j * g.nx + to.i
  if (start === goal) return [start]

  const gScore = new Float32Array(n).fill(Infinity)
  const cameFrom = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  // Binary heap of cell indices, ordered by fScore.
  const heap: number[] = [start]
  const fScore = new Float32Array(n).fill(Infinity)
  gScore[start] = 0
  const h = (idx: number) => Math.abs((idx % g.nx) - to.i) + Math.abs(Math.floor(idx / g.nx) - to.j)
  fScore[start] = h(start)

  const push = (idx: number) => {
    heap.push(idx)
    let c = heap.length - 1
    while (c > 0) {
      const p = (c - 1) >> 1
      if (fScore[heap[p]] <= fScore[heap[c]]) break
      ;[heap[p], heap[c]] = [heap[c], heap[p]]
      c = p
    }
  }
  const pop = (): number => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let p = 0
      for (;;) {
        const l = 2 * p + 1
        const r = l + 1
        let m = p
        if (l < heap.length && fScore[heap[l]] < fScore[heap[m]]) m = l
        if (r < heap.length && fScore[heap[r]] < fScore[heap[m]]) m = r
        if (m === p) break
        ;[heap[p], heap[m]] = [heap[m], heap[p]]
        p = m
      }
    }
    return top
  }

  let pops = 0
  while (heap.length > 0) {
    if (++pops > MAX_POPS) return null
    const cur = pop()
    if (cur === goal) break
    if (closed[cur]) continue
    closed[cur] = 1
    const ci = cur % g.nx
    const cj = (cur - ci) / g.nx
    const prev = cameFrom[cur]
    const pdi = prev < 0 ? 0 : ci - (prev % g.nx)
    const pdj = prev < 0 ? 0 : cj - (prev - (prev % g.nx)) / g.nx

    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = ci + di
      const nj = cj + dj
      if (!inside(g, ni, nj)) continue
      const nb = nj * g.nx + ni
      if (g.blocked[nb] === 1 || closed[nb]) continue
      // A turn costs a hair more than going straight: same path length, fewer corners.
      const step = 1 + (di === pdi && dj === pdj ? 0 : 0.001)
      const tentative = gScore[cur] + step
      if (tentative >= gScore[nb]) continue
      cameFrom[nb] = cur
      gScore[nb] = tentative
      fScore[nb] = tentative + h(nb)
      push(nb)
    }
  }

  if (cameFrom[goal] < 0 && start !== goal) return null
  const path: number[] = [goal]
  let step = goal
  while (cameFrom[step] >= 0) {
    step = cameFrom[step]
    path.push(step)
  }
  return path.reverse()
}

/** Drop points that sit between two collinear neighbours. */
export function collapseCollinear(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points
  const out: [number, number][] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, az] = out[out.length - 1]
    const [bx, bz] = points[i]
    const [cx, cz] = points[i + 1]
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
    if (Math.abs(cross) > 1e-9) out.push(points[i])
  }
  out.push(points[points.length - 1])
  return out
}

export interface PickLeg {
  fromSeq: number
  toSeq: number
  points: [number, number, number][]
  meters: number
  /** True when no walkable path was found and this leg is a straight approximation. */
  straight: boolean
}

export interface PickWalkArrow {
  x: number
  z: number
  dx: number
  dz: number
}

export interface PickWalk {
  stops: PickStop[]
  legs: PickLeg[]
  arrows: PickWalkArrow[]
  totalMeters: number
}

/** Route line height: above the measure guides (0.07), below the labels (~0.4). */
export const ROUTE_Y = 0.09
const ARROW_SPACING_M = 2.5
const MAX_ARROWS = 120

/** Chevron anchors along the legs, spaced by arclength and capped. */
export function arrowMarkers(legs: PickLeg[], spacingM = ARROW_SPACING_M): PickWalkArrow[] {
  const out: PickWalkArrow[] = []
  let carry = spacingM / 2
  for (const leg of legs) {
    for (let i = 1; i < leg.points.length; i++) {
      const [ax, , az] = leg.points[i - 1]
      const [bx, , bz] = leg.points[i]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1e-6) continue
      const dx = (bx - ax) / len
      const dz = (bz - az) / len
      let t = carry
      while (t <= len) {
        if (out.length >= MAX_ARROWS) return out
        out.push({ x: ax + dx * t, z: az + dz * t, dx, dz })
        t += spacingM
      }
      carry = t - len
    }
  }
  return out
}

const walkCache = new WeakMap<WarehouseLayout, PickWalk>()

function legLength(points: [number, number, number][]): number {
  let m = 0
  for (let i = 1; i < points.length; i++) {
    m += Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2])
  }
  return m
}

/**
 * The full walk: the ordered stops plus one path per leg, each following the aisles where
 * a path exists and degrading to a straight line where none does — a leg is never dropped,
 * because a missing leg would silently misreport the route.
 */
export function pickWalk(layout: WarehouseLayout): PickWalk {
  const hit = walkCache.get(layout)
  if (hit) return hit

  const stops = pickRoute(layout)
  const grid = walkGrid(layout)
  const legs: PickLeg[] = []

  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    const straightLeg = (): PickLeg => ({
      fromSeq: a.seq,
      toSeq: b.seq,
      points: [
        [a.x, ROUTE_Y, a.z],
        [b.x, ROUTE_Y, b.z],
      ],
      meters: Math.hypot(b.x - a.x, b.z - a.z),
      straight: true,
    })

    if (grid.degraded) {
      legs.push(straightLeg())
      continue
    }
    const from = nearestFreeCell(grid, a.x, a.z)
    const to = nearestFreeCell(grid, b.x, b.z)
    if (!from || !to) {
      legs.push(straightLeg())
      continue
    }
    const cells = findPath(grid, from, to)
    if (!cells || cells.length === 0) {
      legs.push(straightLeg())
      continue
    }

    const world: [number, number][] = cells.map((idx) => {
      const ci = idx % grid.nx
      const cj = (idx - ci) / grid.nx
      return [grid.originX + ci * grid.cell, grid.originZ + cj * grid.cell]
    })
    // Reach out to the real stand point only when that hop is itself walkable. A stand
    // point can sit inside the clearance margin (racks back to back, a rack flush to a
    // wall), and snapping the end onto it unconditionally would draw a segment straight
    // through the rack the picker is standing at.
    if (clearHop(grid, a.x, a.z, world[0][0], world[0][1])) world.unshift([a.x, a.z])
    const last = world[world.length - 1]
    if (clearHop(grid, last[0], last[1], b.x, b.z)) world.push([b.x, b.z])
    const points = collapseCollinear(world).map(
      ([x, z]) => [x, ROUTE_Y, z] as [number, number, number],
    )
    legs.push({ fromSeq: a.seq, toSeq: b.seq, points, meters: legLength(points), straight: false })
  }

  const walk: PickWalk = {
    stops,
    legs,
    arrows: arrowMarkers(legs),
    totalMeters: legs.reduce((sum, l) => sum + l.meters, 0),
  }
  walkCache.set(layout, walk)
  return walk
}
