import { create } from 'zustand'
import type {
  ColorMode,
  EditorMode,
  GhostState,
  GroupGhostState,
  MarqueeRect,
  RackRotation,
  SlotKey,
  WallDraft,
  ZoneDraft,
} from '../types'

export type AppView = 'home' | 'editor'

export interface EditorState {
  /** Which top-level screen is shown: the launcher home screen or the editor. */
  view: AppView
  mode: EditorMode
  placingTemplateId: string | null
  placeRotation: RackRotation
  ghost: GhostState | null
  movingRackId: string | null
  /** Racks moving as a rigid group; empty for a single-rack drag. */
  movingRackIds: Set<string>
  /** Live preview of a group move / array, or null. */
  groupGhost: GroupGhostState | null
  /** Screen-space marquee rectangle while box-selecting, or null. */
  marquee: MarqueeRect | null
  /** Authoritative rack selection. `selectedRackId` is the derived primary of this set. */
  selectedRackIds: Set<string>
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
  showInsights: boolean
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
  setMovingRackIds: (ids: Iterable<string>) => void
  setGroupGhost: (g: GroupGhostState | null) => void
  setMarquee: (m: MarqueeRect | null) => void
  selectRack: (id: string | null) => void
  /** Shift/Ctrl-click: add or remove one rack from the selection. */
  toggleRackSelection: (id: string) => void
  /** Replace the whole rack selection (marquee, select-all, duplicate result). */
  setRackSelection: (ids: Iterable<string>) => void
  clearRackSelection: () => void
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
  setShowInsights: (open: boolean) => void
  setView: (view: AppView) => void
  setSuggestedSlots: (slots: Set<string>) => void
  setFoundSlots: (slots: Set<string>) => void
  openTemplateEditor: (id: string | null) => void
  showToast: (msg: string, kind?: 'info' | 'error') => void
}

let toastTimer: number | undefined

/**
 * Single place that keeps the rack selection consistent: `selectedRackId` is always
 * the last-inserted member of `selectedRackIds` (the "primary" the Inspector edits),
 * a non-empty rack selection clears any wall/zone selection, and the slot selection
 * only survives while exactly the same single rack stays selected.
 */
function selectionPatch(
  s: EditorState,
  ids: Iterable<string>,
): Pick<
  EditorState,
  'selectedRackIds' | 'selectedRackId' | 'selectedSlotKey' | 'selectedWallId' | 'selectedZoneId'
> {
  const selectedRackIds = ids instanceof Set ? ids : new Set(ids)
  let primary: string | null = null
  for (const id of selectedRackIds) primary = id
  const keepSlot =
    selectedRackIds.size === 1 && s.selectedRackIds.size === 1 && s.selectedRackId === primary
  return {
    selectedRackIds,
    selectedRackId: primary,
    selectedSlotKey: keepSlot ? s.selectedSlotKey : null,
    selectedWallId: primary ? null : s.selectedWallId,
    selectedZoneId: primary ? null : s.selectedZoneId,
  }
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  view: 'home',
  mode: 'select',
  placingTemplateId: null,
  placeRotation: 0,
  ghost: null,
  movingRackId: null,
  movingRackIds: new Set<string>(),
  groupGhost: null,
  marquee: null,
  selectedRackIds: new Set<string>(),
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
  showInsights: false,
  suggestedSlots: new Set<string>(),
  foundSlots: new Set<string>(),
  editingTemplateId: null,
  toast: null,

  setMode: (mode) =>
    set((s) => ({
      mode,
      ghost: null,
      movingRackId: null,
      movingRackIds: s.movingRackIds.size ? new Set<string>() : s.movingRackIds,
      groupGhost: null,
      marquee: null,
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
      movingRackIds: new Set<string>(),
      groupGhost: null,
      marquee: null,
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
      cur.valid === ghost.valid &&
      cur.join?.markerAlong === ghost.join?.markerAlong &&
      cur.join?.markerCross === ghost.join?.markerCross
    ) {
      return
    }
    set({ ghost })
  },

  setPlaceRotation: (placeRotation) => set({ placeRotation }),
  setMovingRackId: (movingRackId) => set({ movingRackId }),
  setMovingRackIds: (ids) => set({ movingRackIds: new Set(ids) }),

  setGroupGhost: (g) => {
    const cur = get().groupGhost
    if (g && cur && cur.dGridX === g.dGridX && cur.dGridZ === g.dGridZ && cur.valid === g.valid) return
    set({ groupGhost: g })
  },

  setMarquee: (marquee) => set({ marquee }),

  selectRack: (id) => set((s) => selectionPatch(s, id ? [id] : [])),

  toggleRackSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedRackIds)
      // Re-inserting makes the toggled rack the primary (Set preserves insertion order).
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return selectionPatch(s, next)
    }),

  setRackSelection: (ids) => set((s) => selectionPatch(s, ids)),
  clearRackSelection: () => set((s) => selectionPatch(s, [])),

  selectSlot: (selectedSlotKey) => set({ selectedSlotKey }),

  selectWall: (selectedWallId) =>
    set((s) =>
      selectedWallId
        ? {
            selectedWallId,
            selectedRackIds: s.selectedRackIds.size ? new Set<string>() : s.selectedRackIds,
            selectedRackId: null,
            selectedSlotKey: null,
            selectedZoneId: null,
          }
        : { selectedWallId: null },
    ),

  selectZone: (selectedZoneId) =>
    set((s) =>
      selectedZoneId
        ? {
            selectedZoneId,
            selectedRackIds: s.selectedRackIds.size ? new Set<string>() : s.selectedRackIds,
            selectedRackId: null,
            selectedSlotKey: null,
            selectedWallId: null,
          }
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
  setShowInsights: (showInsights) => set({ showInsights }),
  setView: (view) => set({ view }),
  setSuggestedSlots: (suggestedSlots) => set({ suggestedSlots }),
  setFoundSlots: (foundSlots) => set({ foundSlots }),
  openTemplateEditor: (editingTemplateId) => set({ editingTemplateId }),

  showToast: (msg, kind = 'info') => {
    window.clearTimeout(toastTimer)
    set({ toast: { msg, kind } })
    toastTimer = window.setTimeout(() => set({ toast: null }), 3500)
  },
}))
