export function worldToGrid(v: number, cellSize: number): number {
  return Math.round(v / cellSize)
}

export function gridToWorld(g: number, cellSize: number): number {
  return g * cellSize
}

/**
 * Snap a world coordinate to the grid, clamped so a footprint of `span`
 * meters centered on it stays inside a floor of `floorSpan` meters.
 */
export function clampGridCenter(world: number, span: number, floorSpan: number, cellSize: number): number {
  const half = (floorSpan - span) / 2
  if (half < 0) return 0
  const minG = Math.ceil(-half / cellSize - 1e-6)
  const maxG = Math.floor(half / cellSize + 1e-6)
  const g = Math.round(Math.min(half, Math.max(-half, world)) / cellSize)
  return Math.min(maxG, Math.max(minG, g))
}
