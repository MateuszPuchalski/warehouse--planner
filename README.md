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
  status (empty/ok/near-capacity/overweight/blocked), continuous weight utilization,
  or **volume**.
- **Volume / cube overload** — a second capacity axis alongside weight. Each slot has a
  volume capacity in m³ (defaulted from the shelf's interior geometry, overridable per
  slot), and an occupied volume that is either entered manually or derived from imported
  stock (`quantity × per-unit volume`, quantity split across a product's locations).
  Slots over their volume capacity are flagged with a red ring in the grid, a badge in the
  slot editor, and per-rack / warehouse-wide counters — the "Volume" color mode shades every
  slot by its cube utilization. Product volume is imported via an optional column in the
  Subiekt export (m³ / dm³ / cm³ selectable), or typed in per slot.
- **Load proxies (goods in 3D)** — occupied slots render a solid load shaped by the rack's
  carrier type (pallet with a base slab / carton / bin), rising to the volume actually stored
  there (from Subiekt stock) and colored green→red by fill. Shown in the Stock/Volume color
  modes and toggled by "Show goods" in the Floor panel; carrier type is a template field
  (auto-inferred from rack depth otherwise). The slot inspector lists each product with a
  placeholder tile, quantity, and its share of the slot volume.
- **Suggest free slots (put-away)** — the "Suggest slots" button opens a panel where you pick a
  product (SKU from imported stock) and a quantity; the app ranks every free slot that fits by
  volume, weight (per-unit weight is an optional import column, kg/g), and carrier type, sorted by
  tightest volume fit (least wasted space). Clicking a result selects the rack + slot; all matches
  are highlighted green in 3D. The scorer (`src/lib/suggest.ts`) is structured to grow later
  factors (SKU consolidation, dock proximity, lower levels).
- **Find a product** — a search box in the top bar (shown once stock is imported) matches by
  symbol, name, or EAN; every matching slot is highlighted amber in 3D and listed in a dropdown
  (rack code · slot · quantity), and clicking a result selects that rack + slot. EAN is an optional
  import column. Matching lives in `src/lib/findStock.ts` (`matchStock` + `locateHits`).
- **KPI dashboard** — the "KPI" button opens a read-only panel summarizing the warehouse:
  fill %, free slots, volume utilization, overweight / over-volume slot counts and aisle
  warnings (stat tiles + meters), free slots broken down by carrier (pallet / carton / bin),
  and a stock summary (SKUs, total quantity, located / pallet-only / unlocated). Metrics are
  aggregated in `src/lib/kpi.ts` (`computeKpis`) reusing the existing slot/volume/aisle helpers.
- **Home screen** — the app opens on a launcher (`src/ui/HomeScreen.tsx`) to start a new empty
  warehouse, continue the last one, open the built-in „Regały" sample, import a JSON layout, or open
  a saved plan (preset). The title bar acts as a "Home" button to return. Editor and home are gated
  by an editor-store `view` flag; opening a plan clears undo history so it can't cross warehouses.
- **Aisle validation** — facing racks closer than the minimum aisle width get a red
  zone + distance badge; live distance guides while placing. Gaps ≤ 0.5 m count as
  intentional back-to-back (flue) placement, and a gap that contains another rack
  (e.g. second neighbors in a touching line) is not treated as an aisle.
- **Walls** — two ways to add them: pick the Wall tool (**W**) and **drag** on the floor
  to draw a grid-snapped segment (auto axis-locked when near-straight, with a live length
  badge), or **type the warehouse dimensions** and hit “Build perimeter walls” to wrap the
  floor — the four boundary walls then follow whenever you retype width/depth. Select a
  wall to tweak its height/thickness or delete it; wall height/thickness defaults live in
  the Floor panel. Walls can carry **openings** (gates/doors) — add them in the wall
  inspector with offset/width/height; a height below the wall height renders a lintel,
  and openings on perimeter walls survive floor resizes (stable wall ids).
- **Zones** — press **Z** and drag on the floor to mark operational areas (packing,
  staging, dock, office, custom) as labeled colored rectangles, with an optional
  translucent volume height. Zones are annotations: they never collide with racks.
  The built-in layout ships with „Pakowalnia", „Strefa dostaw" and „Przejście".
- **Subiekt GT import** — load a product export (XLSX or CSV) with a `Lokalizacja`
  column of codes like `A01-02-03` (aisle A, rack 01, column 02, level 03). The whole
  warehouse structure is inferred from the codes — how many lines (each line letter =
  one row of racks), how many racks per line, and each rack's bays × levels from the
  highest addresses seen — then every slot is filled with its products (multi-SKU and
  multi-location supported; pallet/box tokens like `PALETA65` are kept but not placed).
  Stock lives outside the layout document: re-import replaces it wholesale and never
  touches manual edits or undo history. By default the import only fills existing
  racks — location codes with no matching rack are listed and skipped; creating the
  missing racks is an explicit opt-in checkbox. Racks carry an editable `code` (Inspector) that
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
| V / P / W / Z / X | Select / Place / Wall / Zone / Delete mode |
| R | Rotate ghost or selected rack |
| Del | Delete selected rack or wall |
| Esc | Close modal / cancel placement / deselect |
| Ctrl+Z / Ctrl+Y | Undo / redo |

## Subiekt GT — live connection

The planner can run as a **live digital twin** instead of a static import. A small
read-only bridge service on the LAN ([`/bridge`](bridge/README.md), Node + `mssql`,
read-only SQL login) exposes `GET /api/stock` → `BridgeRecord[]`, reading `tw__Towar`
(symbol, name, EAN, location field — one of `tw_Pole1..8` or `tw_Uwagi`) joined with
`tw_Stan` (quantity per magazyn). Location parsing (`A01-02-03`) stays on the client
(`objectsToStockItems` → `parseLocationField`), so the bridge is a thin projection with
a single source of truth for addressing.

In the app, **Subiekt GT → Live connection**: set the bridge URL, hit **Refresh now**
(or the ⟳ button in the top bar), and optionally enable **auto-refresh** (30/60/300 s,
paused while the tab is hidden). The last sync time / errors show in that panel and the
status bar. Every refresh — and every file import — records an occupancy **history
snapshot** (`wp:history:v1`, capped ring buffer) as groundwork for rotation/forecast
features.

Run the bridge with sample data and no database via `cd bridge && npm run mock`. See
[`bridge/README.md`](bridge/README.md) for real-DB config, CORS, and the mixed-content
(HTTP/HTTPS) caveat. Sfera GT is only needed if the planner ever writes back to Subiekt.

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
