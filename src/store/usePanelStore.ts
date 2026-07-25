import { create } from 'zustand'

const PANELS_KEY = 'wp:panels:v1'

export type PanelSide = 'left' | 'right'

export const PANEL_DEFAULTS = { left: 208, right: 288 } as const
export const PANEL_LIMITS = {
  left: { min: 160, max: 420 },
  right: { min: 220, max: 560 },
} as const

/** Never let the panels squeeze the 3D view below this. */
const MIN_CANVAS_PX = 360

function clampWidth(side: PanelSide, px: number): number {
  const { min, max } = PANEL_LIMITS[side]
  // Guard against a width persisted on a much wider window.
  const roomy = typeof window === 'undefined' ? max : Math.max(min, window.innerWidth - MIN_CANVAS_PX)
  return Math.round(Math.min(Math.min(max, roomy), Math.max(min, px)))
}

interface Persisted {
  left: number
  right: number
  leftCollapsed: boolean
  rightCollapsed: boolean
}

function load(): Persisted {
  const fallback: Persisted = {
    left: PANEL_DEFAULTS.left,
    right: PANEL_DEFAULTS.right,
    leftCollapsed: false,
    rightCollapsed: false,
  }
  try {
    const raw = localStorage.getItem(PANELS_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<Persisted>
    return {
      left: clampWidth('left', typeof p.left === 'number' ? p.left : fallback.left),
      right: clampWidth('right', typeof p.right === 'number' ? p.right : fallback.right),
      leftCollapsed: p.leftCollapsed === true,
      rightCollapsed: p.rightCollapsed === true,
    }
  } catch {
    return fallback
  }
}

function save(p: Persisted): void {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(p))
  } catch {
    // non-fatal
  }
}

export interface PanelState {
  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean
  /** True while a divider is being dragged, so the canvas can ignore pointer events. */
  resizing: boolean
  setWidth: (side: PanelSide, px: number) => void
  toggleCollapsed: (side: PanelSide) => void
  setResizing: (resizing: boolean) => void
}

const initial = load()

export const usePanelStore = create<PanelState>()((set, get) => ({
  leftWidth: initial.left,
  rightWidth: initial.right,
  leftCollapsed: initial.leftCollapsed,
  rightCollapsed: initial.rightCollapsed,
  resizing: false,

  setWidth: (side, px) => {
    const width = clampWidth(side, px)
    const s = get()
    if (side === 'left') {
      if (s.leftWidth === width) return
      set({ leftWidth: width })
    } else {
      if (s.rightWidth === width) return
      set({ rightWidth: width })
    }
    const n = get()
    save({
      left: n.leftWidth,
      right: n.rightWidth,
      leftCollapsed: n.leftCollapsed,
      rightCollapsed: n.rightCollapsed,
    })
  },

  toggleCollapsed: (side) => {
    const s = get()
    const next =
      side === 'left' ? { leftCollapsed: !s.leftCollapsed } : { rightCollapsed: !s.rightCollapsed }
    set(next)
    const n = get()
    save({
      left: n.leftWidth,
      right: n.rightWidth,
      leftCollapsed: n.leftCollapsed,
      rightCollapsed: n.rightCollapsed,
    })
  },

  setResizing: (resizing) => set({ resizing }),
}))
