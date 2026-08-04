import { create } from 'zustand'
import type { PickReport } from '../types'
import { loadPickReport, savePickReport } from '../lib/persistence'
import { mergeReport, type ParsedPickReport } from '../lib/pickReport'

/**
 * The picking-frequency report lives outside the layout document, exactly like stock:
 * it describes what happened in the warehouse, not what the warehouse looks like, so it
 * survives layout edits, never enters undo history, and is replaced wholesale on re-import.
 */
export interface PickReportState {
  report: PickReport | null
  /** Fold a freshly parsed export into the stored report (the two exports complement). */
  addParsed: (parsed: ParsedPickReport, fileName: string) => void
  clearReport: () => void
}

export const usePickReportStore = create<PickReportState>()((set, get) => ({
  report: loadPickReport(),

  addParsed: (parsed, fileName) => {
    const report = mergeReport(get().report, parsed, fileName, Date.now())
    savePickReport(report)
    set({ report })
  },

  clearReport: () => {
    savePickReport(null)
    set({ report: null })
  },
}))
