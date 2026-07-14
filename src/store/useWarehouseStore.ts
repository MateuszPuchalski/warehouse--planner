import { create } from 'zustand'
import { temporal } from 'zundo'
import type { FloorConfig, RackRotation, SlotOverride, WarehouseLayout } from '../types'
import { newId } from '../lib/ids'
import { parseSlotKey } from '../lib/rackGeometry'
import { loadAutosave, seedLayout } from '../lib/persistence'

export interface WarehouseState {
  layout: WarehouseLayout
  addRack: (templateId: string, gridX: number, gridZ: number, rotation: RackRotation) => string
  moveRack: (id: string, gridX: number, gridZ: number) => void
  rotateRack: (id: string) => void
  deleteRack: (id: string) => void
  updateRackMeta: (id: string, patch: { name?: string; templateId?: string }) => void
  updateSlot: (rackId: string, key: string, patch: SlotOverride) => void
  resetSlot: (rackId: string, key: string) => void
  upsertTemplate: (t: import('../types').RackTemplate) => void
  deleteTemplate: (id: string) => boolean
  updateFloor: (patch: Partial<FloorConfig>) => void
  setLayoutName: (name: string) => void
  clearRacks: () => void
  replaceLayout: (layout: WarehouseLayout) => void
}

type PartialWarehouseState = Pick<WarehouseState, 'layout'>

function touch(layout: WarehouseLayout): WarehouseLayout {
  return { ...layout, updatedAt: new Date().toISOString() }
}

export const useWarehouseStore = create<WarehouseState>()(
  temporal<WarehouseState, [], [], PartialWarehouseState>(
    (set, get) => ({
      layout: loadAutosave() ?? seedLayout(),

      addRack: (templateId, gridX, gridZ, rotation) => {
        const id = newId()
        set((s) => ({
          layout: touch({
            ...s.layout,
            racks: {
              ...s.layout.racks,
              [id]: { id, templateId, gridX, gridZ, rotation, slotOverrides: {} },
            },
          }),
        }))
        return id
      },

      moveRack: (id, gridX, gridZ) =>
        set((s) => {
          const rack = s.layout.racks[id]
          if (!rack) return s
          return {
            layout: touch({
              ...s.layout,
              racks: { ...s.layout.racks, [id]: { ...rack, gridX, gridZ } },
            }),
          }
        }),

      rotateRack: (id) =>
        set((s) => {
          const rack = s.layout.racks[id]
          if (!rack) return s
          const rotation = ((rack.rotation + 90) % 360) as RackRotation
          return {
            layout: touch({
              ...s.layout,
              racks: { ...s.layout.racks, [id]: { ...rack, rotation } },
            }),
          }
        }),

      deleteRack: (id) =>
        set((s) => {
          if (!s.layout.racks[id]) return s
          const racks = { ...s.layout.racks }
          delete racks[id]
          return { layout: touch({ ...s.layout, racks }) }
        }),

      updateRackMeta: (id, patch) =>
        set((s) => {
          const rack = s.layout.racks[id]
          if (!rack) return s
          return {
            layout: touch({
              ...s.layout,
              racks: { ...s.layout.racks, [id]: { ...rack, ...patch } },
            }),
          }
        }),

      updateSlot: (rackId, key, patch) =>
        set((s) => {
          const rack = s.layout.racks[rackId]
          if (!rack) return s
          const merged: Record<string, unknown> = { ...rack.slotOverrides[key] }
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete merged[k]
            else merged[k] = v
          }
          const slotOverrides = { ...rack.slotOverrides }
          if (Object.keys(merged).length === 0) delete slotOverrides[key]
          else slotOverrides[key] = merged as SlotOverride
          return {
            layout: touch({
              ...s.layout,
              racks: { ...s.layout.racks, [rackId]: { ...rack, slotOverrides } },
            }),
          }
        }),

      resetSlot: (rackId, key) =>
        set((s) => {
          const rack = s.layout.racks[rackId]
          if (!rack || !(key in rack.slotOverrides)) return s
          const slotOverrides = { ...rack.slotOverrides }
          delete slotOverrides[key]
          return {
            layout: touch({
              ...s.layout,
              racks: { ...s.layout.racks, [rackId]: { ...rack, slotOverrides } },
            }),
          }
        }),

      upsertTemplate: (t) =>
        set((s) => {
          // Prune slot overrides that fall outside the (possibly shrunken) template.
          const racks = { ...s.layout.racks }
          for (const [rid, r] of Object.entries(racks)) {
            if (r.templateId !== t.id) continue
            const pruned = Object.fromEntries(
              Object.entries(r.slotOverrides).filter(([k]) => {
                const { bay, level } = parseSlotKey(k)
                return bay < t.bays && level < t.levels
              }),
            )
            racks[rid] = { ...r, slotOverrides: pruned }
          }
          return {
            layout: touch({
              ...s.layout,
              templates: { ...s.layout.templates, [t.id]: t },
              racks,
            }),
          }
        }),

      deleteTemplate: (id) => {
        const { layout } = get()
        if (Object.values(layout.racks).some((r) => r.templateId === id)) return false
        set((s) => {
          const templates = { ...s.layout.templates }
          delete templates[id]
          return { layout: touch({ ...s.layout, templates }) }
        })
        return true
      },

      updateFloor: (patch) =>
        set((s) => ({ layout: touch({ ...s.layout, floor: { ...s.layout.floor, ...patch } }) })),

      setLayoutName: (name) => set((s) => ({ layout: touch({ ...s.layout, name }) })),

      clearRacks: () => set((s) => ({ layout: touch({ ...s.layout, racks: {} }) })),

      replaceLayout: (layout) => set({ layout: touch(layout) }),
    }),
    {
      limit: 100,
      partialize: (state): PartialWarehouseState => ({ layout: state.layout }),
      handleSet: (handleSet) => {
        // Collapse rapid successive edits (typing in a number field) into one undo step.
        let last = 0
        return ((...args: Parameters<typeof handleSet>) => {
          const now = Date.now()
          if (now - last < 250) return
          last = now
          handleSet(...args)
        }) as typeof handleSet
      },
    },
  ),
)

export function undo(): void {
  useWarehouseStore.temporal.getState().undo()
}

export function redo(): void {
  useWarehouseStore.temporal.getState().redo()
}
