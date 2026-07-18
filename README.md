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
  Templates can optionally define **per-level heights** (bottom → top, e.g.
  `1.12, 0.37, 0.47, 0.37, 1.175, 1.7`) instead of one uniform level height, so
  mixed pallet + shelf racking renders true to size.
- **Built-in layout: „Regały — Mecalux & SSI Schaefer”** — a real warehouse
  recreated from a rack survey worksheet, loadable from the Presets dialog:
  12 Mecalux 5.5 m pallet racks, 13 SSI Schaefer pallet racks, 15 Mecalux M7
  shelf racks and 13 bin (kuweta) racks — 53 racks / 1 824 slots in six coded
  lines (A–F) with validated ≥3 m aisles (`src/lib/sampleWarehouse.ts`).
- **Slot configuration** — click a selected rack (3D) or the inspector grid (2D) to
  edit any slot: label, max weight, current weight, status override. Color modes:
  status (empty/ok/near-capacity/overweight/blocked) or continuous utilization.
- **Aisle validation** — facing racks closer than the minimum aisle width get a red
  zone + distance badge; live distance guides while placing. Gaps ≤ 0.5 m count as
  intentional back-to-back (flue) placement, and a gap that contains another rack
  (e.g. second neighbors in a touching line) is not treated as an aisle.
- **Walls** — two ways to add them: pick the Wall tool (**W**) and **drag** on the floor
  to draw a grid-snapped segment (auto axis-locked when near-straight, with a live length
  badge), or **type the warehouse dimensions** and hit “Build perimeter walls” to wrap the
  floor — the four boundary walls then follow whenever you retype width/depth. Select a
  wall to tweak its height/thickness or delete it; wall height/thickness defaults live in
  the Floor panel.
- **Subiekt GT import** — load a product export (XLSX or CSV) with a `Lokalizacja`
  column of codes like `A01-02-03` (line A, rack 01, shelf 02, column 03). The whole
  warehouse structure is inferred from the codes — how many lines (each line letter =
  one row of racks), how many racks per line, and each rack's bays × levels from the
  highest addresses seen — then every slot is filled with its products (multi-SKU and
  multi-location supported; pallet/box tokens like `PALETA65` are kept but not placed).
  Stock lives outside the layout document: re-import replaces it wholesale and never
  touches manual edits or undo history. Racks carry an editable `code` (Inspector) that
  links them to the ERP; the "Stock" color mode shows occupancy, and the slot editor
  shows a read-only Subiekt section. CSV auto-detects `;`/`,`/tab and UTF-8/Windows-1250.
- **Persistence** — autosave to localStorage, named presets, reusable template
  library, JSON export/import with validation. Undo/redo (100 steps).
- **Languages** — English / Polish (Polski), switchable via the EN/PL selector in
  the top bar; the choice persists in localStorage. Translations live in
  `src/lib/i18n.ts` (`useT()` hook in components, plain `t()` in event handlers).

## Shortcuts

| Key | Action |
| --- | --- |
| V / P / W / X | Select / Place / Wall / Delete mode |
| R | Rotate ghost or selected rack |
| Del | Delete selected rack or wall |
| Esc | Close modal / cancel placement / deselect |
| Ctrl+Z / Ctrl+Y | Undo / redo |

## Subiekt GT — going live later

The import pipeline is `source → StockItem[] → structure inference → apply`, so a live
connection only swaps the source. The intended next step is a small read-only bridge
service on the LAN (Node + `mssql`, read-only SQL login) exposing `GET /api/stock` with
the same JSON shape the file parser produces, reading `tw__Towar` (symbol, name, location
field — one of `tw_Pole1..8` or `tw_Uwagi`) joined with `tw_Stan` (quantity per magazyn).
The stock store already persists a bridge URL for a future "Refresh from Subiekt" button.
Sfera GT is only needed if the planner ever writes back to Subiekt.

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
