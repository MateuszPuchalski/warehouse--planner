import type { GhostState, RackRotation } from '../types'
import { useWarehouseStore, undo, redo } from '../store/useWarehouseStore'
import { useEditorStore } from '../store/useEditorStore'
import { clampGridCenter, gridToWorld } from './grid'
import { getFootprint } from './rackGeometry'
import { isPlacementValid } from './collision'
import { t } from './i18n'

/** Snap a candidate footprint to the grid, clamp it to the floor and check validity. */
export function computeGhost(
  templateId: string,
  worldX: number,
  worldZ: number,
  rotation: RackRotation,
  excludeId?: string,
): GhostState | null {
  const { layout } = useWarehouseStore.getState()
  const t = layout.templates[templateId]
  if (!t) return null
  const { w, d } = getFootprint(t, rotation)
  const gridX = clampGridCenter(worldX, w, layout.floor.widthM, layout.floor.cellSize)
  const gridZ = clampGridCenter(worldZ, d, layout.floor.depthM, layout.floor.cellSize)
  const valid = isPlacementValid(layout, templateId, gridX, gridZ, rotation, excludeId)
  return { gridX, gridZ, rotation, valid }
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
  const { layout, rotateRack } = useWarehouseStore.getState()

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

  if (ed.selectedRackId) {
    const rack = layout.racks[ed.selectedRackId]
    if (!rack) return
    const rotation = ((rack.rotation + 90) % 360) as RackRotation
    rotateRack(rack.id)
    if (!isPlacementValid(useWarehouseStore.getState().layout, rack.templateId, rack.gridX, rack.gridZ, rotation, rack.id)) {
      ed.showToast(t('toast.rotateOverlap'), 'error')
    }
  }
}

/** Start the shrink-out animation; the rack is actually removed in finalizeDelete. */
export function requestDelete(id: string): void {
  const ed = useEditorStore.getState()
  if (ed.deletingRackIds.includes(id)) return
  ed.addDeleting(id)
  if (ed.selectedRackId === id) ed.selectRack(null)
  if (ed.hoveredRackId === id) ed.clearHoveredRack(id)
}

export function finalizeDelete(id: string): void {
  useWarehouseStore.getState().deleteRack(id)
  useEditorStore.getState().removeDeleting(id)
}

export function deleteSelected(): void {
  const id = useEditorStore.getState().selectedRackId
  if (id) requestDelete(id)
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
  if (ed.mode !== 'select') {
    ed.setMode('select')
    return
  }
  ed.selectRack(null)
}

export { undo, redo }
