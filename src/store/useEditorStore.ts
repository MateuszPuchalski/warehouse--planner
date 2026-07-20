import { create } from 'zustand'
import type { ColorMode, EditorMode, GhostState, RackRotation, SlotKey, WallDraft, ZoneDraft } from '../types'

export interface EditorState {
  mode: EditorMode
  placingTemplateId: string | null
  placeRotation: RackRotation
  ghost: GhostState | null
  movingRackId: string | null
  selectedRackId: string | null
  selectedSlotKey: SlotKey | null
  selectedWallId: string | null
  selectedZoneId: string | null
  hoveredRackId: string | null
  wallDraft: WallDraft | null
  zoneDraft: ZoneDraft | null
  colorMode: ColorMode
  deletingRackIds: string[]
  pointer: { x: number; z: number } | null
  showPresetManager: boolean
  showSubiektImport: boolean
  showSuggest: boolean
  showDashboard: boolean
  /** Slots highlighted as put-away suggestions, keyed `${rackId}:${bay}:${level}`. */
  suggestedSlots: Set<string>
  /** Slots highlighted by the SKU search, keyed `${rackId}:${bay}:${level}`. */
  foundSlots: Set<string>
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
  selectZone: (id: string | null) => void
  setWallDraft: (draft: WallDraft | null) => void
  setZoneDraft: (draft: ZoneDraft | null) => void
  setHoveredRack: (id: string | null) => void
  clearHoveredRack: (id: string) => void
  setColorMode: (mode: ColorMode) => void
  addDeleting: (id: string) => void
  removeDeleting: (id: string) => void
  setPointer: (p: { x: number; z: number } | null) => void
  setShowPresetManager: (open: boolean) => void
  setShowSubiektImport: (open: boolean) => void
  setShowSuggest: (open: boolean) => void
  setShowDashboard: (open: boolean) => void
  setSuggestedSlots: (slots: Set<string>) => void
  setFoundSlots: (slots: Set<string>) => void
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
  selectedZoneId: null,
  hoveredRackId: null,
  wallDraft: null,
  zoneDraft: null,
  colorMode: 'status',
  deletingRackIds: [],
  pointer: null,
  showPresetManager: false,
  showSubiektImport: false,
  showSuggest: false,
  showDashboard: false,
  suggestedSlots: new Set<string>(),
  foundSlots: new Set<string>(),
  editingTemplateId: null,
  toast: null,

  setMode: (mode) =>
    set((s) => ({
      mode,
      ghost: null,
      movingRackId: null,
      wallDraft: null,
      zoneDraft: null,
      suggestedSlots: s.suggestedSlots.size ? new Set<string>() : s.suggestedSlots,
      foundSlots: s.foundSlots.size ? new Set<string>() : s.foundSlots,
      ...(mode !== 'place' ? { placingTemplateId: null } : {}),
    })),

  armPlace: (templateId) =>
    set({
      mode: 'place',
      placingTemplateId: templateId,
      ghost: null,
      movingRackId: null,
      wallDraft: null,
      zoneDraft: null,
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
      selectedZoneId: id ? null : s.selectedZoneId,
    })),

  selectSlot: (selectedSlotKey) => set({ selectedSlotKey }),

  selectWall: (selectedWallId) =>
    set(
      selectedWallId
        ? { selectedWallId, selectedRackId: null, selectedSlotKey: null, selectedZoneId: null }
        : { selectedWallId: null },
    ),

  selectZone: (selectedZoneId) =>
    set(
      selectedZoneId
        ? { selectedZoneId, selectedRackId: null, selectedSlotKey: null, selectedWallId: null }
        : { selectedZoneId: null },
    ),

  setWallDraft: (wallDraft) => set({ wallDraft }),
  setZoneDraft: (zoneDraft) => set({ zoneDraft }),

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
  setShowSubiektImport: (showSubiektImport) => set({ showSubiektImport }),
  setShowSuggest: (showSuggest) => set({ showSuggest }),
  setShowDashboard: (showDashboard) => set({ showDashboard }),
  setSuggestedSlots: (suggestedSlots) => set({ suggestedSlots }),
  setFoundSlots: (foundSlots) => set({ foundSlots }),
  openTemplateEditor: (editingTemplateId) => set({ editingTemplateId }),

  showToast: (msg, kind = 'info') => {
    window.clearTimeout(toastTimer)
    set({ toast: { msg, kind } })
    toastTimer = window.setTimeout(() => set({ toast: null }), 3500)
  },
}))
