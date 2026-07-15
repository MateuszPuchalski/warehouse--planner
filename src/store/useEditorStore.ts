import { create } from 'zustand'
import type { ColorMode, EditorMode, GhostState, RackRotation, SlotKey, WallDraft } from '../types'

export interface EditorState {
  mode: EditorMode
  placingTemplateId: string | null
  placeRotation: RackRotation
  ghost: GhostState | null
  movingRackId: string | null
  selectedRackId: string | null
  selectedSlotKey: SlotKey | null
  selectedWallId: string | null
  hoveredRackId: string | null
  wallDraft: WallDraft | null
  colorMode: ColorMode
  deletingRackIds: string[]
  pointer: { x: number; z: number } | null
  showPresetManager: boolean
  editingTemplateId: string | null
  toast: { msg: string; kind: 'info' | 'error' } | null

  setMode: (mode: EditorMode) => void
  armPlace: (templateId: string) => void
  setGhost: (ghost: GhostState | null) => void
  setPlaceRotation: (r: RackRotation) => void
  setMovingRackId: (id: string | null) => void
  selectRack: (id: string | null) => void
  selectSlot: (key: SlotKey | null) => void
  selectWall: (id: string | null) => void
  setWallDraft: (draft: WallDraft | null) => void
  setHoveredRack: (id: string | null) => void
  clearHoveredRack: (id: string) => void
  setColorMode: (mode: ColorMode) => void
  addDeleting: (id: string) => void
  removeDeleting: (id: string) => void
  setPointer: (p: { x: number; z: number } | null) => void
  setShowPresetManager: (open: boolean) => void
  openTemplateEditor: (id: string | null) => void
  showToast: (msg: string, kind?: 'info' | 'error') => void
}

let toastTimer: number | undefined

export const useEditorStore = create<EditorState>()((set, get) => ({
  mode: 'select',
  placingTemplateId: null,
  placeRotation: 0,
  ghost: null,
  movingRackId: null,
  selectedRackId: null,
  selectedSlotKey: null,
  selectedWallId: null,
  hoveredRackId: null,
  wallDraft: null,
  colorMode: 'status',
  deletingRackIds: [],
  pointer: null,
  showPresetManager: false,
  editingTemplateId: null,
  toast: null,

  setMode: (mode) =>
    set({
      mode,
      ghost: null,
      movingRackId: null,
      wallDraft: null,
      ...(mode !== 'place' ? { placingTemplateId: null } : {}),
    }),

  armPlace: (templateId) =>
    set({
      mode: 'place',
      placingTemplateId: templateId,
      ghost: null,
      movingRackId: null,
      wallDraft: null,
    }),

  setGhost: (ghost) => {
    const cur = get().ghost
    if (
      ghost &&
      cur &&
      cur.gridX === ghost.gridX &&
      cur.gridZ === ghost.gridZ &&
      cur.rotation === ghost.rotation &&
      cur.valid === ghost.valid
    ) {
      return
    }
    set({ ghost })
  },

  setPlaceRotation: (placeRotation) => set({ placeRotation }),
  setMovingRackId: (movingRackId) => set({ movingRackId }),

  selectRack: (id) =>
    set((s) => ({
      selectedRackId: id,
      selectedSlotKey: s.selectedRackId === id ? s.selectedSlotKey : null,
      selectedWallId: id ? null : s.selectedWallId,
    })),

  selectSlot: (selectedSlotKey) => set({ selectedSlotKey }),

  selectWall: (selectedWallId) =>
    set(
      selectedWallId
        ? { selectedWallId, selectedRackId: null, selectedSlotKey: null }
        : { selectedWallId: null },
    ),

  setWallDraft: (wallDraft) => set({ wallDraft }),

  setHoveredRack: (hoveredRackId) => set({ hoveredRackId }),
  clearHoveredRack: (id) => {
    if (get().hoveredRackId === id) set({ hoveredRackId: null })
  },

  setColorMode: (colorMode) => set({ colorMode }),

  addDeleting: (id) =>
    set((s) =>
      s.deletingRackIds.includes(id) ? s : { deletingRackIds: [...s.deletingRackIds, id] },
    ),
  removeDeleting: (id) =>
    set((s) => ({ deletingRackIds: s.deletingRackIds.filter((d) => d !== id) })),

  setPointer: (p) => {
    const cur = get().pointer
    if (p && cur && Math.abs(cur.x - p.x) < 0.05 && Math.abs(cur.z - p.z) < 0.05) return
    set({ pointer: p })
  },

  setShowPresetManager: (showPresetManager) => set({ showPresetManager }),
  openTemplateEditor: (editingTemplateId) => set({ editingTemplateId }),

  showToast: (msg, kind = 'info') => {
    window.clearTimeout(toastTimer)
    set({ toast: { msg, kind } })
    toastTimer = window.setTimeout(() => set({ toast: null }), 3500)
  },
}))
