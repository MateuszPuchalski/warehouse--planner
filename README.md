# Warehouse Planner

Interactive 3D warehouse layout planner built with React Three Fiber. Plan modular
pallet racking on a snapped floor grid, configure per-slot weight limits, validate
aisle widths, and save/load layout presets — all local, no backend.

## Run

```
npm install
npm run dev     # http://localhost:5173
```

## Features

- **Editor core** — place / drag-move / rotate (90° steps) / delete racks on a
  configurable floor grid with snapping, collision rejection (red ghost) and
  smooth pop-in / shrink-out animations.
- **Modular rack templates** — bays × levels × dimensions + default slot weight;
  editing a template updates every placed rack. Three built-ins seeded on first run.
- **Slot configuration** — click a selected rack (3D) or the inspector grid (2D) to
  edit any slot: label, max weight, current weight, status override. Color modes:
  status (empty/ok/near-capacity/overweight/blocked) or continuous utilization.
- **Aisle validation** — facing racks closer than the minimum aisle width get a red
  zone + distance badge; live distance guides while placing. Gaps ≤ 0.5 m count as
  intentional back-to-back (flue) placement.
- **Persistence** — autosave to localStorage, named presets, reusable template
  library, JSON export/import with validation. Undo/redo (100 steps).
- **Languages** — English / Polish (Polski), switchable via the EN/PL selector in
  the top bar; the choice persists in localStorage. Translations live in
  `src/lib/i18n.ts` (`useT()` hook in components, plain `t()` in event handlers).

## Shortcuts

| Key | Action |
| --- | --- |
| V / P / X | Select / Place / Delete mode |
| R | Rotate ghost or selected rack |
| Del | Delete selected rack |
| Esc | Close modal / cancel placement / deselect |
| Ctrl+Z / Ctrl+Y | Undo / redo |

## Stack

Vite · React 19 · TypeScript · three.js · @react-three/fiber · @react-three/drei ·
zustand + zundo · @react-spring/three · Tailwind CSS v4

## Architecture notes

- `src/types` — domain model. Templates define structure & defaults; rack instances
  store placement + **sparse** per-slot overrides (`slotOverrides["bay:level"]`).
- `src/store/useWarehouseStore` — undoable document state (zundo temporal).
  `useEditorStore` — ephemeral UI state (mode, selection, ghost, hover).
- `src/lib/rackGeometry` — template → member transforms, footprints, AABBs, slot
  resolution. 90° rotations keep every rack axis-aligned, so collision & aisle
  checks are simple interval math (`src/lib/collision`).
- `src/scene/RackFrame` — one `InstancedMesh` per member type per rack (~3 draw
  calls/rack); shared module-scope geometry/materials, matrices rebuilt only on
  template change.
