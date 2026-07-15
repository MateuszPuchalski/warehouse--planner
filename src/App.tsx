import { useEffect } from 'react'
import { useWarehouseStore } from './store/useWarehouseStore'
import { useEditorStore } from './store/useEditorStore'
import {
  armPlaceDefault,
  deleteSelected,
  escapeAction,
  redo,
  rotateGhostOrSelection,
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
  const lang = useI18nStore((s) => s.lang)

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
        case 'x':
          useEditorStore.getState().setMode('delete')
          break
        case 'r':
          rotateGhostOrSelection()
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

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-bg font-sans text-sm text-text select-none">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <main className="relative min-w-0 flex-1">
          <WarehouseCanvas />
        </main>
        <Inspector />
      </div>
      <StatusBar />
      {editingTemplateId !== null && <TemplateEditor key={editingTemplateId} />}
      {showPresetManager && <PresetManager />}
      <Toast />
    </div>
  )
}
