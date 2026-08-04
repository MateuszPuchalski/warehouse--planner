import type { GhostState, GroupGhostState, RackRotation, WallDraft, ZoneDraft } from '../types'
import { useWarehouseStore, undo, redo, markHistoryBoundary } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { clampGridCenter, clampGridFree, gridToWorld, worldToGrid } from './grid'
import { findAlignSnap } from './alignSnap'
import { findJoinSnaps } from './joinSnap'
import { JOIN_TOL } from './runs'
import { aabbFor, getFootprint } from './rackGeometry'
import { isPlacementValid, rackIndex, validateGroupPlacement, type RackMove } from './collision'
import { alignMoves, distributeMoves, packRunMoves, type AlignMode } from './align'
import { buildArraySpecs, type ArraySpec } from './arrayTool'
import { MIN_WALL_CELLS, snapWallSegment } from './walls'
import { MIN_ZONE_CELLS } from './zones'
import { t } from './i18n'

/**
 * Snap a candidate footprint to the grid, clamp it to the floor and check validity.
 *
 * A rack dropped near an aligned neighbour first tries to JOIN it — sharing the
 * upright frame, which needs a fractional (un-rounded) centre. Failing that it tries to
 * line up with a neighbour's edge or centre line, and only then falls back to plain grid
 * snapping. `opts.snap === false` (Ctrl) skips both and gives you the raw grid.
 */
export function computeGhost(
  templateId: string,
  worldX: number,
  worldZ: number,
  rotation: RackRotation,
  excludeId?: string,
  opts?: { snap?: boolean },
): GhostState | null {
  const { layout } = useWarehouseStore.getState()
  const t = layout.templates[templateId]
  if (!t) return null
  const { w, d } = getFootprint(t, rotation)
  const cell = layout.floor.cellSize

  if (opts?.snap !== false) {
    const joins = findJoinSnaps(
      layout,
      templateId,
      rotation,
      worldX,
      worldZ,
      excludeId ? new Set([excludeId]) : undefined,
    )
    // Walk them nearest-first: the closest junction is often already taken (dragging a
    // rack into the middle of a run), and offering the next free end beats showing an
    // invalid ghost the user has to nudge their way out of.
    let firstBlocked: GhostState | null = null
    for (const join of joins) {
      const gridX = clampGridFree(join.worldX, w, layout.floor.widthM, cell)
      const gridZ = clampGridFree(join.worldZ, d, layout.floor.depthM, cell)
      // Discard the join if the floor clamp had to move it — a clamped join is no join.
      const kept =
        Math.abs(gridX * cell - join.worldX) <= JOIN_TOL &&
        Math.abs(gridZ * cell - join.worldZ) <= JOIN_TOL
      if (!kept) continue
      const valid = isPlacementValid(layout, templateId, gridX, gridZ, rotation, excludeId)
      const ghost: GhostState = {
        gridX,
        gridZ,
        rotation,
        valid,
        join: { markerAlong: join.markerAlong, markerCross: join.markerCross, axis: join.axis },
      }
      if (valid) return ghost
      firstBlocked ??= ghost
    }
    // Every junction in reach is occupied: keep the nearest one so the ghost still reads
    // as "this is where it wants to go", rather than snapping back to a raw grid cell.
    if (firstBlocked) return firstBlocked
  }

  const gridX = clampGridCenter(worldX, w, layout.floor.widthM, cell)
  const gridZ = clampGridCenter(worldZ, d, layout.floor.depthM, cell)
  const valid = isPlacementValid(layout, templateId, gridX, gridZ, rotation, excludeId)

  if (opts?.snap !== false) {
    // No frame to share, but there may be an edge or centre line to line up with. Each
    // axis snaps on its own; an axis with nothing in reach keeps its grid position.
    const al = findAlignSnap(
      layout,
      templateId,
      rotation,
      worldX,
      worldZ,
      excludeId ? new Set([excludeId]) : undefined,
    )
    if (al) {
      const ax = al.guides.some((g) => g.axis === 'x')
      const az = al.guides.some((g) => g.axis === 'z')
      const agX = ax ? clampGridFree(al.worldX, w, layout.floor.widthM, cell) : gridX
      const agZ = az ? clampGridFree(al.worldZ, d, layout.floor.depthM, cell) : gridZ
      const alignValid = isPlacementValid(layout, templateId, agX, agZ, rotation, excludeId)
      // Never trade a placeable grid position for an aligned one that collides.
      if (alignValid || !valid) {
        return { gridX: agX, gridZ: agZ, rotation, valid: alignValid, guides: al.guides }
      }
    }
  }

  return { gridX, gridZ, rotation, valid }
}

/**
 * Materialize a rigid group move (or copy) at a grid delta. The delta is clamped
 * against the group's bounding box rather than per rack, so the group keeps its shape
 * instead of deforming at the floor edge.
 */
export function computeGroupGhost(
  ids: string[],
  dGridX: number,
  dGridZ: number,
  copy = false,
): GroupGhostState | null {
  const { layout } = useWarehouseStore.getState()
  const racks = ids.map((id) => layout.racks[id]).filter((r): r is NonNullable<typeof r> => !!r)
  if (racks.length === 0) return null

  const entries = rackIndex(layout)
  const byId = new Map(entries.map((e) => [e.id, e.aabb]))
  const boxes = racks.map((r) => byId.get(r.id)).filter((a): a is NonNullable<typeof a> => !!a)
  if (boxes.length === 0) return null

  const cell = layout.floor.cellSize
  const hw = layout.floor.widthM / 2
  const hd = layout.floor.depthM / 2
  const minX = Math.min(...boxes.map((b) => b.minX))
  const maxX = Math.max(...boxes.map((b) => b.maxX))
  const minZ = Math.min(...boxes.map((b) => b.minZ))
  const maxZ = Math.max(...boxes.map((b) => b.maxZ))
  // Clamp the shared delta so the whole bounding box stays on the floor.
  const dx = Math.min(Math.max(dGridX, (-hw - minX) / cell), (hw - maxX) / cell)
  const dz = Math.min(Math.max(dGridZ, (-hd - minZ) / cell), (hd - maxZ) / cell)
  const clampedX = dGridX < 0 ? Math.ceil(dx) : Math.floor(dx)
  const clampedZ = dGridZ < 0 ? Math.ceil(dz) : Math.floor(dz)

  // Copies carry a synthetic id so the sources stay in the static set (they don't move),
  // which means template and rotation must be passed explicitly — the id won't resolve.
  const moves = racks.map((r) => ({
    rackId: copy ? `${r.id}#copy` : r.id,
    gridX: r.gridX + clampedX,
    gridZ: r.gridZ + clampedZ,
    templateId: r.templateId,
    rotation: r.rotation,
  }))
  const { invalidIds } = validateGroupPlacement(layout, moves)

  const items = racks.map((r, i) => ({
    rackId: r.id,
    templateId: r.templateId,
    gridX: moves[i].gridX,
    gridZ: moves[i].gridZ,
    rotation: r.rotation,
    valid: !invalidIds.has(moves[i].rackId),
  }))
  return {
    items,
    dGridX: clampedX,
    dGridZ: clampedZ,
    valid: items.every((i) => i.valid),
    ...(copy ? { copy: true } : {}),
  }
}

/** Commit the current place-mode ghost as a new rack. */
export function placeAtGhost(): void {
  const ed = useEditorStore.getState()
  if (ed.mode !== 'place' || !ed.ghost || !ed.placingTemplateId) return
  if (!ed.ghost.valid) {
    ed.showToast(t('toast.cannotPlace'), 'error')
    return
  }
  useWarehouseStore
    .getState()
    .addRack(ed.placingTemplateId, ed.ghost.gridX, ed.ghost.gridZ, ed.ghost.rotation)
}

/** R key: rotate the placement ghost, or the selected rack. */
export function rotateGhostOrSelection(): void {
  const ed = useEditorStore.getState()
  const { layout } = useWarehouseStore.getState()

  if (ed.mode === 'place' && ed.ghost && ed.placingTemplateId) {
    const rotation = ((ed.ghost.rotation + 90) % 360) as RackRotation
    ed.setPlaceRotation(rotation)
    const cell = layout.floor.cellSize
    const g = computeGhost(
      ed.placingTemplateId,
      gridToWorld(ed.ghost.gridX, cell),
      gridToWorld(ed.ghost.gridZ, cell),
      rotation,
    )
    ed.setGhost(g)
    return
  }

  if (ed.selectedRackIds.size > 0) {
    // Refuse rather than rotate into an overlap and merely warn afterwards.
    rotateSelection()
  }
}

/** Snap a dragged segment to the grid, clamp its endpoints to the floor and validate length. */
export function computeWallDraft(
  worldX1: number,
  worldZ1: number,
  worldX2: number,
  worldZ2: number,
): WallDraft {
  const { floor } = useWarehouseStore.getState().layout
  const cell = floor.cellSize
  const snapped = snapWallSegment(worldX1, worldZ1, worldX2, worldZ2, cell)
  const hwG = floor.widthM / 2 / cell
  const hdG = floor.depthM / 2 / cell
  const clampX = (g: number) => Math.max(-hwG, Math.min(hwG, g))
  const clampZ = (g: number) => Math.max(-hdG, Math.min(hdG, g))
  const draft = {
    x1: clampX(snapped.x1),
    z1: clampZ(snapped.z1),
    x2: clampX(snapped.x2),
    z2: clampZ(snapped.z2),
  }
  const lenCells = Math.hypot(draft.x2 - draft.x1, draft.z2 - draft.z1)
  return { ...draft, valid: lenCells >= MIN_WALL_CELLS - 1e-6 }
}

/** Commit the current wall draft as a new wall. */
export function commitWallDraft(): void {
  const ed = useEditorStore.getState()
  const d = ed.wallDraft
  ed.setWallDraft(null)
  if (!d || !d.valid) return
  const { floor } = useWarehouseStore.getState().layout
  const id = useWarehouseStore.getState().addWall({
    x1: d.x1,
    z1: d.z1,
    x2: d.x2,
    z2: d.z2,
    heightM: floor.wallHeightM,
    thicknessM: floor.wallThicknessM,
  })
  ed.selectWall(id)
}

/** Snap a dragged zone rectangle to the grid and clamp it to the floor. */
export function computeZoneDraft(
  worldX1: number,
  worldZ1: number,
  worldX2: number,
  worldZ2: number,
): ZoneDraft {
  const { floor } = useWarehouseStore.getState().layout
  const cell = floor.cellSize
  const hwG = floor.widthM / 2 / cell
  const hdG = floor.depthM / 2 / cell
  const clampX = (g: number) => Math.max(-hwG, Math.min(hwG, g))
  const clampZ = (g: number) => Math.max(-hdG, Math.min(hdG, g))
  const draft = {
    x1: clampX(worldToGrid(worldX1, cell)),
    z1: clampZ(worldToGrid(worldZ1, cell)),
    x2: clampX(worldToGrid(worldX2, cell)),
    z2: clampZ(worldToGrid(worldZ2, cell)),
  }
  const valid =
    Math.abs(draft.x2 - draft.x1) >= MIN_ZONE_CELLS && Math.abs(draft.z2 - draft.z1) >= MIN_ZONE_CELLS
  return { ...draft, valid }
}

/** Commit the current zone draft as a new zone. */
export function commitZoneDraft(): void {
  const ed = useEditorStore.getState()
  const d = ed.zoneDraft
  ed.setZoneDraft(null)
  if (!d || !d.valid) return
  const id = useWarehouseStore.getState().addZone({
    x1: d.x1,
    z1: d.z1,
    x2: d.x2,
    z2: d.z2,
    label: t('zone.defaultLabel'),
    kind: 'custom',
  })
  ed.selectZone(id)
}

/** Start the shrink-out animation; the rack is actually removed in finalizeDelete. */
export function requestDelete(id: string): void {
  const ed = useEditorStore.getState()
  if (ed.deletingRackIds.includes(id)) return
  ed.addDeleting(id)
  if (ed.selectedRackIds.has(id)) {
    const next = new Set(ed.selectedRackIds)
    next.delete(id)
    ed.setRackSelection(next)
  }
  if (ed.hoveredRackId === id) ed.clearHoveredRack(id)
}

/**
 * Racks whose shrink animation has finished, flushed together on the next frame so a
 * group delete lands as ONE store mutation (and therefore one undo step).
 */
const pendingDeletes = new Set<string>()
let deleteFlushHandle: number | null = null

export function finalizeDelete(id: string): void {
  pendingDeletes.add(id)
  if (deleteFlushHandle !== null) return
  deleteFlushHandle = requestAnimationFrame(() => {
    deleteFlushHandle = null
    const ids = [...pendingDeletes]
    pendingDeletes.clear()
    if (ids.length === 0) return
    markHistoryBoundary()
    useWarehouseStore.getState().deleteRacks(ids)
    const ed = useEditorStore.getState()
    for (const rid of ids) ed.removeDeleting(rid)
  })
}

export function deleteSelected(): void {
  const ed = useEditorStore.getState()
  if (ed.selectedWallId) {
    markHistoryBoundary()
    useWarehouseStore.getState().deleteWall(ed.selectedWallId)
    ed.selectWall(null)
    return
  }
  if (ed.selectedZoneId) {
    markHistoryBoundary()
    useWarehouseStore.getState().deleteZone(ed.selectedZoneId)
    ed.selectZone(null)
    return
  }
  // Snapshot first: requestDelete mutates the selection as it removes each rack.
  const ids = Array.from(ed.selectedRackIds)
  for (const id of ids) requestDelete(id)
}

/** Move every selected rack by a grid delta. Refuses (and toasts) if any target is blocked. */
export function moveSelection(dGridX: number, dGridZ: number, boundary = true): boolean {
  const ed = useEditorStore.getState()
  const { layout, moveRacks } = useWarehouseStore.getState()
  const moves = [...ed.selectedRackIds]
    .map((id) => layout.racks[id])
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ rackId: r.id, gridX: r.gridX + dGridX, gridZ: r.gridZ + dGridZ }))
  if (moves.length === 0) return false
  if (!validateGroupPlacement(layout, moves).valid) {
    ed.showToast(t('toast.cannotMove'), 'error')
    return false
  }
  if (boundary) markHistoryBoundary()
  moveRacks(moves.map((m) => ({ id: m.rackId, gridX: m.gridX, gridZ: m.gridZ })))
  return true
}

/**
 * Arrow-key nudge. Deliberately skips the history boundary so a held key coalesces
 * into a single undo step.
 */
export function nudgeSelection(dGridX: number, dGridZ: number): void {
  moveSelection(dGridX, dGridZ, false)
}

/** Rotate every selected rack +90°, all-or-nothing (never leaves an overlapping layout). */
export function rotateSelection(): void {
  const ed = useEditorStore.getState()
  const { layout, rotateRacks } = useWarehouseStore.getState()
  const rots = [...ed.selectedRackIds]
    .map((id) => layout.racks[id])
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.id, rotation: ((r.rotation + 90) % 360) as RackRotation }))
  if (rots.length === 0) return
  const moves = rots.map((r) => {
    const rack = layout.racks[r.id]
    return { rackId: r.id, gridX: rack.gridX, gridZ: rack.gridZ, rotation: r.rotation }
  })
  if (!validateGroupPlacement(layout, moves).valid) {
    ed.showToast(t('toast.cannotRotate'), 'error')
    return
  }
  markHistoryBoundary()
  rotateRacks(rots)
}

/**
 * Turn every selected rack around (+180°). Its own action rather than "press R twice",
 * because R steps through 90°, where the footprint swaps and a rack joined into a run
 * really does overlap its neighbour — that intermediate state is refused, so two presses
 * can never get you here. A straight +180° is collision-neutral (the footprint is
 * rotation-mod-180 and `isJoinedPair` compares `rotation % 180`), and it is the only way
 * to reverse the column order, since column 0 always sits at the rack's local −X.
 */
export function flipSelection(): void {
  const ed = useEditorStore.getState()
  const { layout, rotateRacks } = useWarehouseStore.getState()
  const rots = [...ed.selectedRackIds]
    .map((id) => layout.racks[id])
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.id, rotation: ((r.rotation + 180) % 360) as RackRotation }))
  if (rots.length === 0) return
  /**
   * Guard the *invariant* rather than re-validating the layout. A 180° turn leaves every
   * footprint and every join pose untouched, so it cannot introduce a collision — whereas
   * an all-or-nothing `validateGroupPlacement` over a big selection would refuse the flip
   * because of some unrelated overlap that was already there (the built-in sample has a
   * 2 cm one in row A), which is a false refusal on exactly the layouts that need fixing.
   * If a future geometry change ever makes 180° non-neutral, this catches it instead.
   */
  const cell = layout.floor.cellSize
  const neutral = rots.every((r) => {
    const rack = layout.racks[r.id]
    const tpl = layout.templates[rack.templateId]
    if (!tpl) return false
    const before = aabbFor(rack.gridX, rack.gridZ, rack.rotation, tpl, cell)
    const after = aabbFor(rack.gridX, rack.gridZ, r.rotation, tpl, cell)
    return (
      Math.abs(before.minX - after.minX) < 1e-9 &&
      Math.abs(before.maxX - after.maxX) < 1e-9 &&
      Math.abs(before.minZ - after.minZ) < 1e-9 &&
      Math.abs(before.maxZ - after.maxZ) < 1e-9
    )
  })
  if (!neutral) {
    ed.showToast(t('toast.cannotFlip'), 'error')
    return
  }
  markHistoryBoundary()
  // ONE store write: the history throttle drops updates inside its window, so flipping a
  // whole run rack-by-rack would leave undo able to revert only the first.
  rotateRacks(rots)
}

/** F key: flip the placement ghost, or the selection. */
export function flipGhostOrSelection(): void {
  const ed = useEditorStore.getState()
  const { layout } = useWarehouseStore.getState()

  if (ed.mode === 'place' && ed.ghost && ed.placingTemplateId) {
    const rotation = ((ed.ghost.rotation + 180) % 360) as RackRotation
    ed.setPlaceRotation(rotation)
    const cell = layout.floor.cellSize
    ed.setGhost(
      computeGhost(
        ed.placingTemplateId,
        gridToWorld(ed.ghost.gridX, cell),
        gridToWorld(ed.ghost.gridZ, cell),
        rotation,
      ),
    )
    return
  }

  if (ed.selectedRackIds.size > 0) flipSelection()
}

/** Commit the in-flight move ghost (single rack or group). Re-validates against the live layout. */
export function commitMoveGhost(): boolean {
  const ed = useEditorStore.getState()
  const group = ed.groupGhost
  if (group) {
    if (group.copy) return commitCopyGhost()
    return moveSelection(group.dGridX, group.dGridZ)
  }
  const ghost = ed.ghost
  const rackId = ed.movingRackId
  if (!ghost || !rackId) return false
  const { layout, moveRacks } = useWarehouseStore.getState()
  const rack = layout.racks[rackId]
  if (!rack) return false
  const moves = [{ rackId, gridX: ghost.gridX, gridZ: ghost.gridZ }]
  if (!validateGroupPlacement(layout, moves).valid) {
    ed.showToast(t('toast.cannotMove'), 'error')
    return false
  }
  markHistoryBoundary()
  moveRacks([{ id: rackId, gridX: ghost.gridX, gridZ: ghost.gridZ }])
  return true
}

/** Commit an alt-drag / array preview as new racks, selecting the copies. */
export function commitCopyGhost(): boolean {
  const ed = useEditorStore.getState()
  const group = ed.groupGhost
  if (!group || !group.copy) return false
  const placeable = group.items.filter((i) => i.valid)
  if (placeable.length === 0) {
    ed.showToast(t('toast.arrayNone'), 'error')
    return false
  }
  markHistoryBoundary()
  const ids = useWarehouseStore
    .getState()
    .cloneRacks(placeable.map((i) => ({ sourceId: i.rackId, gridX: i.gridX, gridZ: i.gridZ })))
  ed.setRackSelection(ids)
  const skipped = group.items.length - placeable.length
  if (skipped > 0) ed.showToast(t('toast.arrayPartial', { placed: ids.length, skipped }))
  return true
}

/** Ctrl+D: copy the selection just clear of itself, trying each direction in turn. */
export function duplicateSelection(): void {
  const ed = useEditorStore.getState()
  const { layout } = useWarehouseStore.getState()
  const ids = [...ed.selectedRackIds].filter((id) => layout.racks[id])
  if (ids.length === 0) return

  const entries = rackIndex(layout).filter((e) => ids.includes(e.id))
  if (entries.length === 0) return
  const minX = Math.min(...entries.map((e) => e.aabb.minX))
  const maxX = Math.max(...entries.map((e) => e.aabb.maxX))
  const minZ = Math.min(...entries.map((e) => e.aabb.minZ))
  const maxZ = Math.max(...entries.map((e) => e.aabb.maxZ))
  const cell = layout.floor.cellSize
  const stepX = Math.ceil((maxX - minX) / cell) + 1
  const stepZ = Math.ceil((maxZ - minZ) / cell) + 1

  const candidates: [number, number][] = [
    [stepX, 0],
    [-stepX, 0],
    [0, stepZ],
    [0, -stepZ],
  ]
  for (const [dx, dz] of candidates) {
    const moves = ids.map((id) => {
      const r = layout.racks[id]
      return { rackId: id, gridX: r.gridX + dx, gridZ: r.gridZ + dz }
    })
    if (!validateGroupPlacement(layout, moves).valid) continue
    markHistoryBoundary()
    const newIds = useWarehouseStore.getState().duplicateRacks(ids, dx, dz)
    ed.setRackSelection(newIds)
    const coded = ids.filter((id) => layout.racks[id]?.code).length
    if (coded > 0) ed.showToast(t('toast.codesDropped', { n: coded }))
    return
  }
  ed.showToast(t('toast.dupNoRoom'), 'error')
}

/** Ctrl+A: select every rack. */
export function selectAllRacks(): void {
  const { layout } = useWarehouseStore.getState()
  useEditorStore.getState().setRackSelection(Object.keys(layout.racks))
}

/** Align the selection by footprint edges. Refuses if the result would overlap. */
export function alignSelection(mode: AlignMode): void {
  const ed = useEditorStore.getState()
  const { layout, moveRacks } = useWarehouseStore.getState()
  const moves = alignMoves(layout, [...ed.selectedRackIds], mode)
  applyMoves(moves, ed, layout, moveRacks)
}

/**
 * Close the selected racks up into one joined run. Deterministic where the drag magnet
 * is fiddly — a fine grid step, or a whole row that has drifted apart by centimetres.
 */
export function packSelectionIntoRun(): void {
  const ed = useEditorStore.getState()
  const { layout, moveRacks } = useWarehouseStore.getState()
  const result = packRunMoves(layout, [...ed.selectedRackIds])
  if ('refusal' in result) {
    if (result.refusal === 'mixed') ed.showToast(t('toast.packMixed'), 'error')
    return
  }
  applyMoves(result.moves, ed, layout, moveRacks)
}

/** Equalize the gaps between the selected racks along one axis. */
export function distributeSelection(axis: 'x' | 'z'): void {
  const ed = useEditorStore.getState()
  const { layout, moveRacks } = useWarehouseStore.getState()
  const moves = distributeMoves(layout, [...ed.selectedRackIds], axis)
  applyMoves(moves, ed, layout, moveRacks)
}

function applyMoves(
  moves: RackMove[],
  ed: ReturnType<typeof useEditorStore.getState>,
  layout: ReturnType<typeof useWarehouseStore.getState>['layout'],
  moveRacks: ReturnType<typeof useWarehouseStore.getState>['moveRacks'],
): void {
  if (moves.length === 0) return
  if (!validateGroupPlacement(layout, moves).valid) {
    ed.showToast(t('toast.alignFailed'), 'error')
    return
  }
  markHistoryBoundary()
  moveRacks(moves.map((m) => ({ id: m.rackId, gridX: m.gridX, gridZ: m.gridZ })))
}

/** Live preview of the array tool, shown through the group ghost. */
export function previewArray(spec: ArraySpec): void {
  const ed = useEditorStore.getState()
  const { layout } = useWarehouseStore.getState()
  const ids = [...ed.selectedRackIds]
  const { specs } = buildArraySpecs(layout, ids, spec)
  if (specs.length === 0) {
    ed.setGroupGhost(null)
    return
  }
  ed.setGroupGhost({
    items: specs.map((s) => {
      const src = layout.racks[s.sourceId]
      return {
        rackId: s.sourceId,
        templateId: src.templateId,
        gridX: s.gridX,
        gridZ: s.gridZ,
        rotation: src.rotation,
        valid: true,
      }
    }),
    dGridX: 0,
    dGridZ: 0,
    valid: true,
    copy: true,
  })
}

/** Commit the array tool: one atomic clone of every copy that fits. */
export function applyArray(spec: ArraySpec): void {
  const ed = useEditorStore.getState()
  const { layout, cloneRacks } = useWarehouseStore.getState()
  const ids = [...ed.selectedRackIds]
  const { specs, skipped } = buildArraySpecs(layout, ids, spec)
  ed.setGroupGhost(null)
  if (specs.length === 0) {
    ed.showToast(t('toast.arrayNone'), 'error')
    return
  }
  markHistoryBoundary()
  const newIds = cloneRacks(specs)
  ed.setRackSelection(newIds)
  if (skipped > 0) ed.showToast(t('toast.arrayPartial', { placed: newIds.length, skipped }))
}

/** Absolute position/rotation entry from the Inspector; refuses invalid targets. */
export function setRackPosition(rackId: string, gridX: number, gridZ: number): boolean {
  const ed = useEditorStore.getState()
  const { layout, moveRacks } = useWarehouseStore.getState()
  if (!layout.racks[rackId]) return false
  if (!validateGroupPlacement(layout, [{ rackId, gridX, gridZ }]).valid) {
    ed.showToast(t('toast.cannotMove'), 'error')
    return false
  }
  moveRacks([{ id: rackId, gridX, gridZ }])
  return true
}

export function setRackRotationAbs(rackId: string, rotation: RackRotation): boolean {
  const ed = useEditorStore.getState()
  const { layout, setRackRotation } = useWarehouseStore.getState()
  const rack = layout.racks[rackId]
  if (!rack) return false
  if (!validateGroupPlacement(layout, [{ rackId, gridX: rack.gridX, gridZ: rack.gridZ, rotation }]).valid) {
    ed.showToast(t('toast.cannotRotate'), 'error')
    return false
  }
  markHistoryBoundary()
  setRackRotation(rackId, rotation)
  return true
}

/** P key: (re-)enter place mode with the last used or first available template. */
export function armPlaceDefault(): void {
  const ed = useEditorStore.getState()
  const templateId =
    ed.placingTemplateId ?? Object.keys(useWarehouseStore.getState().layout.templates)[0]
  if (templateId) ed.armPlace(templateId)
}

/** Escape: close modals, then cancel placement, then clear selection. */
export function escapeAction(): void {
  const ed = useEditorStore.getState()
  if (ed.editingTemplateId !== null) {
    ed.openTemplateEditor(null)
    return
  }
  if (ed.showPresetManager) {
    ed.setShowPresetManager(false)
    return
  }
  if (ed.showSubiektImport) {
    ed.setShowSubiektImport(false)
    return
  }
  if (ed.showSuggest) {
    ed.setShowSuggest(false)
    return
  }
  if (ed.showDashboard) {
    ed.setShowDashboard(false)
    return
  }
  if (ed.showSlotting) {
    ed.setShowSlotting(false)
    return
  }
  // The pick-route and dimensions overlays are deliberate view toggles driven by their
  // own buttons, not transient state — Escape must not silently switch them off, or
  // pressing it to deselect a rack would also wipe the measurements off the plan.
  if (ed.mode !== 'select') {
    ed.setMode('select')
    return
  }
  if (ed.selectedWallId) {
    ed.selectWall(null)
    return
  }
  if (ed.selectedZoneId) {
    ed.selectZone(null)
    return
  }
  ed.clearRackSelection()
}

export { undo, redo }
