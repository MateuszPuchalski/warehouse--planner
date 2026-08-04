import { useEffect } from 'react'
import { useWarehouseStore } from './store/useWarehouseStore'
import { useEditorStore } from './store/useEditorStore'
import {
  armPlaceDefault,
  deleteSelected,
  duplicateSelection,
  escapeAction,
  flipGhostOrSelection,
  nudgeSelection,
  redo,
  rotateGhostOrSelection,
  selectAllRacks,
  undo,
} from './lib/editorActions'
import { saveAutosave } from './lib/persistence'
import { t, useI18nStore } from './lib/i18n'
import { WarehouseCanvas } from './scene/WarehouseCanvas'
import { TopBar } from './ui/TopBar'
import { Toolbar } from './ui/Toolbar'
import { Inspector } from './ui/Inspector'
import { StatusBar } from './ui/StatusBar'
import { TemplateEditor } from './ui/TemplateEditor'
import { PresetManager } from './ui/PresetManager'
import { SubiektImport } from './ui/SubiektImport'
import { SuggestPanel } from './ui/SuggestPanel'
import { Dashboard } from './ui/Dashboard'
import { Insights } from './ui/Insights'
import { Slotting } from './ui/Slotting'
import { HomeScreen } from './ui/HomeScreen'
import { BridgeSync } from './ui/BridgeSync'
import { MarqueeBox } from './ui/MarqueeBox'
import { ResizeHandle } from './ui/ResizeHandle'
import { usePanelStore } from './store/usePanelStore'

function Toast() {
  const toast = useEditorStore((s) => s.toast)
  if (!toast) return null
  return (
    <div
      className={`fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-md border px-3 py-1.5 text-xs shadow-lg ${
        toast.kind === 'error'
          ? 'border-danger/50 bg-danger/15 text-danger'
          : 'border-accent/50 bg-panel text-text'
      }`}
    >
      {toast.msg}
    </div>
  )
}

/** Arrow-key nudge deltas in grid cells. World-axis, so undo stays intelligible. */
const NUDGE_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

export default function App() {
  const editingTemplateId = useEditorStore((s) => s.editingTemplateId)
  const showPresetManager = useEditorStore((s) => s.showPresetManager)
  const showSubiektImport = useEditorStore((s) => s.showSubiektImport)
  const showSuggest = useEditorStore((s) => s.showSuggest)
  const showDashboard = useEditorStore((s) => s.showDashboard)
  const showInsights = useEditorStore((s) => s.showInsights)
  const showSlotting = useEditorStore((s) => s.showSlotting)
  const view = useEditorStore((s) => s.view)
  const lang = useI18nStore((s) => s.lang)
  const resizing = usePanelStore((s) => s.resizing)

  // Keep the document language and title in sync with the UI language.
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('app.title')
  }, [lang])

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      // Arrow nudge and the Ctrl combos must be handled before the modifier bail-out below.
      const nudge = NUDGE_KEYS[key]
      if (nudge) {
        if (useEditorStore.getState().selectedRackIds.size === 0) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        nudgeSelection(nudge[0] * step, nudge[1] * step)
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault()
        duplicateSelection()
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault()
        selectAllRacks()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (key) {
        case 'v':
          useEditorStore.getState().setMode('select')
          break
        case 'p':
          armPlaceDefault()
          break
        case 'w':
          useEditorStore.getState().setMode('wall')
          break
        case 'z':
          useEditorStore.getState().setMode('zone')
          break
        case 'x':
          useEditorStore.getState().setMode('delete')
          break
        case 'r':
          rotateGhostOrSelection()
          break
        case 'f':
          flipGhostOrSelection()
          break
        case 'escape':
          escapeAction()
          break
        case 'delete':
        case 'backspace':
          deleteSelected()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Debounced autosave to localStorage.
  useEffect(() => {
    let timer: number | undefined
    const unsub = useWarehouseStore.subscribe((s) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => saveAutosave(s.layout), 800)
    })
    return () => {
      unsub()
      window.clearTimeout(timer)
    }
  }, [])

  // Selection lives outside the undo history, so undoing a create/duplicate can leave
  // it pointing at racks that no longer exist. Prune whenever the rack map changes.
  useEffect(() => {
    let prev = useWarehouseStore.getState().layout.racks
    return useWarehouseStore.subscribe((s) => {
      const racks = s.layout.racks
      if (racks === prev) return
      prev = racks
      const ed = useEditorStore.getState()
      if (ed.selectedRackIds.size === 0) return
      const alive = [...ed.selectedRackIds].filter((id) => racks[id])
      if (alive.length !== ed.selectedRackIds.size) ed.setRackSelection(alive)
    })
  }, [])

  if (view === 'home') {
    return (
      <div className="h-dvh w-screen overflow-hidden bg-bg font-sans text-sm text-text">
        <HomeScreen />
        <Toast />
      </div>
    )
  }

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-bg font-sans text-sm text-text select-none">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <ResizeHandle side="left" />
        {/* Ignore pointer events mid-resize, or a move across the canvas would drag the ghost. */}
        <main className={`relative min-w-0 flex-1 ${resizing ? 'pointer-events-none' : ''}`}>
          <WarehouseCanvas />
        </main>
        <ResizeHandle side="right" />
        <Inspector />
      </div>
      <StatusBar />
      {editingTemplateId !== null && <TemplateEditor key={editingTemplateId} />}
      {showPresetManager && <PresetManager />}
      {showSubiektImport && <SubiektImport />}
      {showSuggest && <SuggestPanel />}
      {showDashboard && <Dashboard />}
      {showInsights && <Insights />}
      {showSlotting && <Slotting />}
      <BridgeSync />
      <MarqueeBox />
      <Toast />
    </div>
  )
}
