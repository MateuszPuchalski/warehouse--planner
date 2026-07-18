import { useMemo } from 'react'
import { create } from 'zustand'
import type { SlotStatus } from '../types'

export type Lang = 'en' | 'pl'

const LANG_KEY = 'wp:lang:v1'

const en = {
  'app.title': 'Warehouse Planner',

  'top.undo': 'Undo',
  'top.redo': 'Redo',
  'top.undoTip': 'Undo (Ctrl+Z)',
  'top.redoTip': 'Redo (Ctrl+Y)',
  'top.color': 'Color',
  'top.color.status': 'Status',
  'top.color.utilization': 'Utilization',
  'top.color.stock': 'Stock',
  'top.color.none': 'None',
  'top.subiekt': 'Subiekt GT',
  'top.presets': 'Presets',
  'top.export': 'Export',
  'top.import': 'Import',
  'top.layoutName': 'Layout name',
  'top.language': 'Language',

  'toast.imported': 'Imported "{name}"',
  'toast.importFailed': 'Import failed: {msg}',
  'toast.cannotPlace': 'Cannot place here — overlaps a rack or leaves the floor',
  'toast.rotateOverlap': 'Warning: rotated rack now overlaps or leaves the floor',
  'toast.templateNeedsName': 'Template needs a name',
  'toast.levelHeightsBad': 'Per-level heights must be a list of positive numbers',
  'toast.presetNeedsName': 'Preset needs a name',
  'toast.presetSaved': 'Preset "{name}" saved',
  'toast.presetLoaded': 'Loaded preset "{name}"',
  'toast.templateUpdated': 'Template updated',
  'toast.templateCreated': 'Template created',
  'toast.templateDeleted': 'Template deleted',
  'toast.templateInUse': 'Cannot delete: {n} placed rack(s) use this template',
  'toast.savedToLibrary': 'Saved "{name}" to library',
  'toast.addedFromLibrary': 'Added "{name}" to this layout',
  'toast.stockImported': 'Imported {items} stock items ({racks} racks created)',
  'toast.stockImportFailed': 'Stock import failed: {msg}',

  'subiekt.title': 'Import stock from Subiekt GT',
  'subiekt.pickFile': 'Choose XLSX / CSV file…',
  'subiekt.help':
    'Export the product list from Subiekt GT (with the Lokalizacja column, e.g. "A01-02-03" = aisle A, rack 01, column 02, level 03) to Excel or CSV and load it here. Rack sizes and rows are inferred from the codes; slots are filled with the products.',
  'subiekt.current': 'Currently loaded: {n} items (imported {date}).',
  'subiekt.encoding': 'encoding: {enc}',
  'subiekt.col.symbol': 'Symbol',
  'subiekt.col.name': 'Name',
  'subiekt.col.quantity': 'Quantity',
  'subiekt.col.location': 'Location',
  'subiekt.col.unit': 'Unit',
  'subiekt.colIgnore': '— ignore —',
  'subiekt.firstRowData': 'First row is data (no header)',
  'subiekt.badLocation': 'no rack code',
  'subiekt.summary': '{items} items · {located} with rack locations · {codes} racks in data · {missing} to create',
  'subiekt.palletOnly': '{n} only on pallets/boxes',
  'subiekt.noLocation': '{n} without location',
  'subiekt.upgraded': '{n} racks will grow',
  'subiekt.outOfRange': '{n} rack(s) too small (manual racks are never resized)',
  'subiekt.unplaced': 'no space for: {codes}',
  'subiekt.duplicates': 'duplicate rack codes: {codes}',
  'subiekt.createMissing': 'Create missing racks from codes ({n}) and grow undersized ones',
  'subiekt.skippedMissing': '{n} location code(s) have no matching rack — skipped: {codes}',
  'subiekt.skippedUpgrades': '{n} undersized rack(s) left unchanged',
  'subiekt.floorGrow': '(floor grows to {w}×{d} m)',
  'subiekt.cancel': 'Cancel',
  'subiekt.import': 'Import',

  'tool.mode': 'Mode',
  'tool.select': 'Select / move',
  'tool.place': 'Place racks',
  'tool.wall': 'Draw walls',
  'tool.zone': 'Draw zones',
  'tool.delete': 'Delete racks',
  'tool.templates': 'Rack templates',
  'tool.newTemplate': '+ New template',
  'tool.fromLibrary': 'From library…',
  'tool.hideLibrary': 'Hide library',
  'tool.libraryEmpty': 'Library is empty. Use “Save to library” in the template editor.',
  'tool.add': 'Add',
  'tool.editTemplate': 'Edit template',
  'tool.card': '{bays} bays × {levels} levels',

  'floor.title': 'Floor settings',
  'floor.width': 'Width',
  'floor.depth': 'Depth',
  'floor.snap': 'Grid snap',
  'floor.minAisle': 'Min aisle',
  'floor.showGuides': 'Show aisle warnings',
  'floor.clear': 'Clear all racks ({n})',
  'floor.walls': 'Walls',
  'floor.wallHeight': 'Wall height',
  'floor.wallThickness': 'Wall thickness',
  'floor.buildPerimeter': 'Build perimeter walls',
  'floor.clearWalls': 'Clear all walls ({n})',
  'floor.wallsHelp':
    'Press W (or the ▭ tool) and drag on the floor to draw a wall. “Build perimeter walls” wraps the warehouse using its width × depth — edit those and the boundary walls follow.',
  'floor.help':
    'Click a rack to inspect it. Use the toolbar or press P to place racks, R to rotate, Del to remove.',

  'wall.title': 'Wall',
  'wall.length': 'Length',
  'wall.height': 'Height',
  'wall.thickness': 'Thickness',
  'wall.perimeter': 'Perimeter',
  'wall.custom': 'Custom',
  'wall.delete': '✕ Delete wall',
  'wall.deleteTip': 'Delete wall (Del)',
  'wall.openings': 'Openings ({n})',
  'wall.addOpening': '+ Add opening',
  'wall.removeOpeningTip': 'Remove opening',
  'wall.openingOffset': 'Offset',
  'wall.openingWidth': 'Width',
  'wall.openingHeight': 'Height',
  'wall.openingsHelp':
    'Offset is measured along the wall from its first endpoint. Height equal to the wall height makes a full-height gate.',
  'zone.title': 'Zone',
  'zone.defaultLabel': 'Zone',
  'zone.label': 'Label',
  'zone.kind': 'Type',
  'zone.kind.packing': 'Packing',
  'zone.kind.staging': 'Staging',
  'zone.kind.dock': 'Dock / deliveries',
  'zone.kind.office': 'Office',
  'zone.kind.custom': 'Custom',
  'zone.color': 'Color',
  'zone.height': 'Height',
  'zone.size': 'Size',
  'zone.delete': '✕ Delete zone',
  'zone.deleteTip': 'Delete zone (Del)',

  'rack.title': 'Rack',
  'rack.code': 'Code',
  'rack.stockCount': '{n} product(s) from Subiekt at this code',
  'rack.name': 'Name',
  'rack.namePlaceholder': 'Unnamed rack',
  'rack.template': 'Template',
  'rack.position': 'Position',
  'rack.rotation': 'Rotation',
  'rack.occupied': 'Slots: {occ}/{total} occupied',
  'rack.overweight': '{n} overweight',
  'rack.rotate': '⟳ Rotate',
  'rack.rotateTip': 'Rotate 90° (R)',
  'rack.delete': '✕ Delete',
  'rack.deleteTip': 'Delete (Del)',
  'rack.slotsTitle': 'Slots — click to edit',

  'slotgrid.bays': 'Bay 1 → {n}',
  'slotgrid.top': 'top = level {n}',

  'slot.title': 'Slot · bay {bay}, level {level}',
  'slot.label': 'Label',
  'slot.maxWeight': 'Max weight',
  'slot.currentWeight': 'Current weight',
  'slot.status': 'Status',
  'slot.auto': 'Auto (by weight)',
  'slot.utilized': '{pct}% utilized',
  'slot.reset': 'Reset to default',
  'slot.subiektTitle': 'Subiekt GT stock',
  'slot.subiektHint': 'Read-only — updates on re-import',
  'slot.multiLocation': 'in {n} locations',

  'status.empty': 'Empty',
  'status.ok': 'OK',
  'status.warning': 'Near capacity',
  'status.overweight': 'Overweight',
  'status.blocked': 'Blocked',

  'tpl.edit': 'Edit template',
  'tpl.new': 'New template',
  'tpl.name': 'Name',
  'tpl.bays': 'Bays',
  'tpl.levels': 'Levels',
  'tpl.bayWidth': 'Bay width (m)',
  'tpl.levelHeight': 'Level height (m)',
  'tpl.levelHeights': 'Per-level heights (m, bottom → top, optional)',
  'tpl.levelHeightsHint': 'e.g. 1.12, 0.37, 0.47, 1.7',
  'tpl.depth': 'Depth (m)',
  'tpl.defaultWeight': 'Default max weight (kg)',
  'tpl.slots': '{n} slots',
  'tpl.affects': 'affects {n} placed rack(s)',
  'tpl.delete': 'Delete',
  'tpl.inUse': 'In use by placed racks',
  'tpl.saveLib': 'Save to library',
  'tpl.save': 'Save',
  'tpl.create': 'Create',
  'tpl.defaultName': 'New rack type',

  'preset.title': 'Layout presets',
  'preset.name': 'Preset name',
  'preset.saveCurrent': 'Save current',
  'preset.empty': 'No presets yet — save the current layout above.',
  'preset.meta': '{racks} racks · {templates} templates',
  'preset.load': 'Load',
  'preset.builtin': 'Built-in layouts',
  'preset.sampleName': 'Regały — Mecalux & SSI Schaefer',
  'preset.sampleDesc':
    '53 racks from the "Regały" worksheet: 12 Mecalux + 13 SSI Schaefer pallet racks, 15 M7 shelf racks, 13 bin racks.',
  'preset.note':
    'Presets are stored in this browser. Loading a preset replaces the current layout (undoable with Ctrl+Z). Use Export/Import in the top bar to share layouts as files.',

  'sb.counts': '{racks} racks · {slots} slots',
  'sb.aislesOk': '✓ aisles OK',
  'sb.warnings': '⚠ aisle warnings: {n}',
  'sb.warningsTip': 'Click to select the first offending rack',
  'sb.mode': 'Mode',
  'mode.select': 'select',
  'mode.place': 'place',
  'mode.wall': 'wall',
  'mode.delete': 'delete',
  'sb.walls': '· {n} walls',
  'sb.hints':
    'V select · P place · W wall · R rotate · X delete · Del remove · Ctrl+Z undo · Esc cancel',
}

const pl: Record<TranslationKey, string> = {
  'app.title': 'Planer magazynu',

  'top.undo': 'Cofnij',
  'top.redo': 'Ponów',
  'top.undoTip': 'Cofnij (Ctrl+Z)',
  'top.redoTip': 'Ponów (Ctrl+Y)',
  'top.color': 'Kolor',
  'top.color.status': 'Status',
  'top.color.utilization': 'Wykorzystanie',
  'top.color.stock': 'Stany',
  'top.color.none': 'Brak',
  'top.subiekt': 'Subiekt GT',
  'top.presets': 'Presety',
  'top.export': 'Eksport',
  'top.import': 'Import',
  'top.layoutName': 'Nazwa układu',
  'top.language': 'Język',

  'toast.imported': 'Zaimportowano „{name}”',
  'toast.importFailed': 'Import nieudany: {msg}',
  'toast.cannotPlace': 'Nie można postawić — koliduje z regałem lub wystaje poza halę',
  'toast.rotateOverlap': 'Uwaga: po obrocie regał koliduje lub wystaje poza halę',
  'toast.templateNeedsName': 'Szablon musi mieć nazwę',
  'toast.levelHeightsBad': 'Wysokości poziomów muszą być listą liczb dodatnich',
  'toast.presetNeedsName': 'Preset musi mieć nazwę',
  'toast.presetSaved': 'Zapisano preset „{name}”',
  'toast.presetLoaded': 'Wczytano preset „{name}”',
  'toast.templateUpdated': 'Zaktualizowano szablon',
  'toast.templateCreated': 'Utworzono szablon',
  'toast.templateDeleted': 'Usunięto szablon',
  'toast.templateInUse': 'Nie można usunąć — szablon jest używany przez {n} regał(ów)',
  'toast.savedToLibrary': 'Zapisano „{name}” do biblioteki',
  'toast.addedFromLibrary': 'Dodano „{name}” do tego układu',
  'toast.stockImported': 'Zaimportowano {items} pozycji (utworzono {racks} regałów)',
  'toast.stockImportFailed': 'Import stanów nieudany: {msg}',

  'subiekt.title': 'Import stanów z Subiekt GT',
  'subiekt.pickFile': 'Wybierz plik XLSX / CSV…',
  'subiekt.help':
    'Wyeksportuj listę towarów z Subiekta GT (z kolumną Lokalizacja, np. „A01-02-03” = alejka A, regał 01, kolumna 02, poziom 03) do Excela lub CSV i wczytaj tutaj. Rozmiary regałów i rzędy są wyliczane z kodów; sloty wypełniane są towarami.',
  'subiekt.current': 'Obecnie wczytane: {n} pozycji (import {date}).',
  'subiekt.encoding': 'kodowanie: {enc}',
  'subiekt.col.symbol': 'Symbol',
  'subiekt.col.name': 'Nazwa',
  'subiekt.col.quantity': 'Ilość',
  'subiekt.col.location': 'Lokalizacja',
  'subiekt.col.unit': 'JM',
  'subiekt.colIgnore': '— pomiń —',
  'subiekt.firstRowData': 'Pierwszy wiersz to dane (brak nagłówka)',
  'subiekt.badLocation': 'brak kodu regału',
  'subiekt.summary': '{items} pozycji · {located} z lokalizacją regałową · {codes} regałów w danych · {missing} do utworzenia',
  'subiekt.palletOnly': '{n} tylko na paletach/kartonach',
  'subiekt.noLocation': '{n} bez lokalizacji',
  'subiekt.upgraded': '{n} regałów zostanie powiększonych',
  'subiekt.outOfRange': '{n} regał(ów) za małych (ręcznie zbudowane nie są zmieniane)',
  'subiekt.unplaced': 'brak miejsca dla: {codes}',
  'subiekt.duplicates': 'zduplikowane kody regałów: {codes}',
  'subiekt.createMissing': 'Dobuduj brakujące regały z kodów ({n}) i powiększ za małe',
  'subiekt.skippedMissing': 'Kody lokalizacji bez regału: {n} — pominięto: {codes}',
  'subiekt.skippedUpgrades': 'Za małe regały pozostawione bez zmian: {n}',
  'subiekt.floorGrow': '(hala rośnie do {w}×{d} m)',
  'subiekt.cancel': 'Anuluj',
  'subiekt.import': 'Importuj',

  'tool.mode': 'Tryb',
  'tool.select': 'Zaznaczanie / przesuwanie',
  'tool.place': 'Stawianie regałów',
  'tool.wall': 'Rysowanie ścian',
  'tool.zone': 'Rysowanie stref',
  'tool.delete': 'Usuwanie regałów',
  'tool.templates': 'Szablony regałów',
  'tool.newTemplate': '+ Nowy szablon',
  'tool.fromLibrary': 'Z biblioteki…',
  'tool.hideLibrary': 'Ukryj bibliotekę',
  'tool.libraryEmpty': 'Biblioteka jest pusta. Użyj „Zapisz do biblioteki” w edytorze szablonów.',
  'tool.add': 'Dodaj',
  'tool.editTemplate': 'Edytuj szablon',
  'tool.card': '{bays} przęs. × {levels} poz.',

  'floor.title': 'Ustawienia hali',
  'floor.width': 'Szerokość',
  'floor.depth': 'Głębokość',
  'floor.snap': 'Skok siatki',
  'floor.minAisle': 'Min. alejka',
  'floor.showGuides': 'Pokazuj ostrzeżenia alejek',
  'floor.clear': 'Usuń wszystkie regały ({n})',
  'floor.walls': 'Ściany',
  'floor.wallHeight': 'Wysokość ściany',
  'floor.wallThickness': 'Grubość ściany',
  'floor.buildPerimeter': 'Zbuduj ściany obwodowe',
  'floor.clearWalls': 'Usuń wszystkie ściany ({n})',
  'floor.wallsHelp':
    'Naciśnij W (lub narzędzie ▭) i przeciągnij po podłodze, aby narysować ścianę. „Zbuduj ściany obwodowe” otacza halę na podstawie jej szerokości × głębokości — zmień te wymiary, a ściany obwodowe podążą za nimi.',
  'floor.help':
    'Kliknij regał, aby go edytować. Użyj paska narzędzi lub naciśnij P (stawianie), R (obrót), Del (usuwanie).',

  'wall.title': 'Ściana',
  'wall.length': 'Długość',
  'wall.height': 'Wysokość',
  'wall.thickness': 'Grubość',
  'wall.perimeter': 'Obwodowa',
  'wall.custom': 'Własna',
  'wall.delete': '✕ Usuń ścianę',
  'wall.deleteTip': 'Usuń ścianę (Del)',
  'wall.openings': 'Otwory ({n})',
  'wall.addOpening': '+ Dodaj otwór',
  'wall.removeOpeningTip': 'Usuń otwór',
  'wall.openingOffset': 'Odległość',
  'wall.openingWidth': 'Szerokość',
  'wall.openingHeight': 'Wysokość',
  'wall.openingsHelp':
    'Odległość mierzona wzdłuż ściany od jej pierwszego końca. Wysokość równa wysokości ściany = brama na pełną wysokość.',
  'zone.title': 'Strefa',
  'zone.defaultLabel': 'Strefa',
  'zone.label': 'Etykieta',
  'zone.kind': 'Typ',
  'zone.kind.packing': 'Pakowalnia',
  'zone.kind.staging': 'Strefa odkładcza',
  'zone.kind.dock': 'Dok / dostawy',
  'zone.kind.office': 'Biuro',
  'zone.kind.custom': 'Własna',
  'zone.color': 'Kolor',
  'zone.height': 'Wysokość',
  'zone.size': 'Wymiar',
  'zone.delete': '✕ Usuń strefę',
  'zone.deleteTip': 'Usuń strefę (Del)',

  'rack.title': 'Regał',
  'rack.code': 'Kod',
  'rack.stockCount': '{n} produkt(ów) z Subiekta pod tym kodem',
  'rack.name': 'Nazwa',
  'rack.namePlaceholder': 'Regał bez nazwy',
  'rack.template': 'Szablon',
  'rack.position': 'Pozycja',
  'rack.rotation': 'Obrót',
  'rack.occupied': 'Sloty: {occ}/{total} zajęte',
  'rack.overweight': 'przeciążone: {n}',
  'rack.rotate': '⟳ Obróć',
  'rack.rotateTip': 'Obróć o 90° (R)',
  'rack.delete': '✕ Usuń',
  'rack.deleteTip': 'Usuń (Del)',
  'rack.slotsTitle': 'Sloty — kliknij, aby edytować',

  'slotgrid.bays': 'Przęsło 1 → {n}',
  'slotgrid.top': 'góra = poziom {n}',

  'slot.title': 'Slot · przęsło {bay}, poziom {level}',
  'slot.label': 'Etykieta',
  'slot.maxWeight': 'Maks. waga',
  'slot.currentWeight': 'Aktualna waga',
  'slot.status': 'Status',
  'slot.auto': 'Auto (wg wagi)',
  'slot.utilized': 'wykorzystanie: {pct}%',
  'slot.reset': 'Przywróć domyślne',
  'slot.subiektTitle': 'Stan z Subiekt GT',
  'slot.subiektHint': 'Tylko do odczytu — aktualizacja przy ponownym imporcie',
  'slot.multiLocation': 'w {n} lokalizacjach',

  'status.empty': 'Pusty',
  'status.ok': 'OK',
  'status.warning': 'Blisko limitu',
  'status.overweight': 'Przeciążony',
  'status.blocked': 'Zablokowany',

  'tpl.edit': 'Edytuj szablon',
  'tpl.new': 'Nowy szablon',
  'tpl.name': 'Nazwa',
  'tpl.bays': 'Przęsła',
  'tpl.levels': 'Poziomy',
  'tpl.bayWidth': 'Szerokość przęsła (m)',
  'tpl.levelHeight': 'Wysokość poziomu (m)',
  'tpl.levelHeights': 'Wysokości poziomów (m, od dołu, opcjonalne)',
  'tpl.levelHeightsHint': 'np. 1.12, 0.37, 0.47, 1.7',
  'tpl.depth': 'Głębokość (m)',
  'tpl.defaultWeight': 'Domyślna maks. waga (kg)',
  'tpl.slots': 'slotów: {n}',
  'tpl.affects': 'dotyczy postawionych regałów: {n}',
  'tpl.delete': 'Usuń',
  'tpl.inUse': 'Używany przez postawione regały',
  'tpl.saveLib': 'Zapisz do biblioteki',
  'tpl.save': 'Zapisz',
  'tpl.create': 'Utwórz',
  'tpl.defaultName': 'Nowy typ regału',

  'preset.title': 'Presety układów',
  'preset.name': 'Nazwa presetu',
  'preset.saveCurrent': 'Zapisz bieżący',
  'preset.empty': 'Brak presetów — zapisz bieżący układ powyżej.',
  'preset.meta': 'regały: {racks} · szablony: {templates}',
  'preset.load': 'Wczytaj',
  'preset.builtin': 'Układy wbudowane',
  'preset.sampleName': 'Regały — Mecalux i SSI Schaefer',
  'preset.sampleDesc':
    '53 regały z arkusza „Regały”: 12 paletowych Mecalux + 13 SSI Schaefer, 15 półkowych M7, 13 kuwetowych.',
  'preset.note':
    'Presety są zapisywane w tej przeglądarce. Wczytanie presetu zastępuje bieżący układ (można cofnąć Ctrl+Z). Użyj Eksportu/Importu w górnym pasku, aby udostępniać układy jako pliki.',

  'sb.counts': 'regały: {racks} · sloty: {slots}',
  'sb.aislesOk': '✓ alejki OK',
  'sb.warnings': '⚠ ostrzeżenia alejek: {n}',
  'sb.warningsTip': 'Kliknij, aby zaznaczyć pierwszy problematyczny regał',
  'sb.mode': 'Tryb',
  'mode.select': 'zaznaczanie',
  'mode.place': 'stawianie',
  'mode.wall': 'ściana',
  'mode.delete': 'usuwanie',
  'sb.walls': '· ściany: {n}',
  'sb.hints':
    'V zaznaczanie · P stawianie · W ściana · R obrót · X usuwanie · Del usuń · Ctrl+Z cofnij · Esc anuluj',
}

export type TranslationKey = keyof typeof en

const dicts: Record<Lang, Record<TranslationKey, string>> = { en, pl }

function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'pl' ? 'pl' : 'en'
  } catch {
    return 'en'
  }
}

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useI18nStore = create<I18nState>()((set) => ({
  lang: loadLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // non-fatal
    }
    set({ lang })
  },
}))

function format(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

/** Non-reactive translate — for event handlers (toasts). UI components should use useT(). */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return format(dicts[useI18nStore.getState().lang][key], vars)
}

/** Reactive translate hook — re-renders the component when the language changes. */
export function useT(): (key: TranslationKey, vars?: Record<string, string | number>) => string {
  const lang = useI18nStore((s) => s.lang)
  return useMemo(
    () => (key: TranslationKey, vars?: Record<string, string | number>) =>
      format(dicts[lang][key], vars),
    [lang],
  )
}

export function statusLabel(
  translate: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  status: SlotStatus,
): string {
  return translate(`status.${status}` as TranslationKey)
}
