export type RackRotation = 0 | 90 | 180 | 270

/** Key of a slot within a rack: `${bayIndex}:${levelIndex}`, 0-based. */
export type SlotKey = string

export type SlotStatus = 'empty' | 'ok' | 'warning' | 'overweight' | 'blocked'

export type EditorMode = 'select' | 'place' | 'delete' | 'wall'

export type ColorMode = 'status' | 'utilization' | 'none'

export interface SlotDefaults {
  maxWeightKg: number
}

export interface RackTemplate {
  id: string
  name: string
  /** Horizontal sections. */
  bays: number
  /** Vertical shelf levels (level 0 sits on the floor). */
  levels: number
  /** Width of one bay in meters (between upright centers). */
  bayWidth: number
  /** Height of one level in meters. */
  levelHeight: number
  /** Rack depth in meters. */
  depth: number
  /** Visual thickness of upright posts in meters. */
  uprightSize: number
  /** Visual height of horizontal beams in meters. */
  beamHeight: number
  defaultSlot: SlotDefaults
}

/** Sparse per-slot deviation from the template defaults. */
export interface SlotOverride {
  label?: string
  maxWeightKg?: number
  currentWeightKg?: number
  statusOverride?: SlotStatus
}

export interface RackInstance {
  id: string
  templateId: string
  name?: string
  /** Grid coordinates of the rack center (integer cells, world = grid * cellSize). */
  gridX: number
  gridZ: number
  rotation: RackRotation
  slotOverrides: Record<SlotKey, SlotOverride>
}

/** Template defaults merged with instance overrides, ready for display. */
export interface ResolvedSlot {
  key: SlotKey
  bay: number
  level: number
  label: string
  maxWeightKg: number
  currentWeightKg: number
  utilization: number
  status: SlotStatus
  hasOverride: boolean
}

export interface FloorConfig {
  widthM: number
  depthM: number
  /** Grid snap size in meters. */
  cellSize: number
  minAisleWidthM: number
  showAisleGuides: boolean
  /** Default height of newly drawn / perimeter walls in meters. */
  wallHeightM: number
  /** Default thickness of newly drawn / perimeter walls in meters. */
  wallThicknessM: number
}

/**
 * A straight wall segment on the floor plane. Endpoints are in grid coordinates
 * (world = grid * cellSize), matching how racks store their position.
 */
export interface Wall {
  id: string
  x1: number
  z1: number
  x2: number
  z2: number
  heightM: number
  thicknessM: number
  /** True for the four auto-generated boundary walls, so they can be rebuilt from floor dims. */
  perimeter?: boolean
}

export interface WarehouseLayout {
  schemaVersion: 1
  name: string
  floor: FloorConfig
  templates: Record<string, RackTemplate>
  racks: Record<string, RackInstance>
  walls: Record<string, Wall>
  updatedAt: string
}

/** Axis-aligned bounds on the floor plane (all racks stay axis-aligned thanks to 90° rotations). */
export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface AisleViolation {
  rackA: string
  rackB: string
  gap: number
  axis: 'x' | 'z'
  zone: AABB
}

export interface GhostState {
  gridX: number
  gridZ: number
  rotation: RackRotation
  valid: boolean
}

/** Live preview of a wall being drawn by dragging. Endpoints in grid coordinates. */
export interface WallDraft {
  x1: number
  z1: number
  x2: number
  z2: number
  valid: boolean
}
