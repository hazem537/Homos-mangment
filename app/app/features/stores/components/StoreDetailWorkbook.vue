<script setup lang="ts">
/**
 * Store detail workbook (Handsontable): KPIs + إجمالي حركات المخزن.
 * Styles are per-user + per-store (table_view_prefs).
 */
import Handsontable from 'handsontable'
import { registerAllModules } from 'handsontable/registry'
import { HotTable } from '@handsontable/vue3'
import type { GridSettings } from 'handsontable/settings'
import { storesDetailWorkbookKey } from '~/composables/tableKeys'
import {
  ACTION_DELETE,
  ACTION_DELETE_SECTION,
  ACTION_EDIT,
  ACTION_EDIT_SECTION,
  ACTION_OPS,
  buildStoreWorkbook,
  defaultStoreColWidths,
  isStoreReadOnly,
  matrixForHot,
  minWidthForStoreCol,
  regionLocalCol,
  SECTION_STATS_MARKER,
  SECTION_TITLE_MARKER,
  STORE_SHEET_KEY,
  type CellValue,
  type StoreSheetMovement,
  type StoreSheetSection,
  type StoreWorkbookStats,
  type StoreRegion
} from '../utils/storeDetailSheetData'
import {
  WORKBOOK_DEFAULT_FONT_FAMILY,
  WORKBOOK_DEFAULT_FONT_SIZE,
  WORKBOOK_FONT_SIZES,
  WORKBOOK_ZOOM_LEVELS,
  type WorkbookTextAlign
} from '~/utils/workbookStyleToolbar'
import { formatNumber } from '~/utils/formatNumber'
import 'handsontable/styles/handsontable.min.css'
import 'handsontable/styles/ht-theme-main.min.css'

registerAllModules()

type TextAlign = WorkbookTextAlign
type CellStyle = {
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
  backgroundColor?: string
  align?: TextAlign
}

const FONT_SIZES = WORKBOOK_FONT_SIZES
const ZOOM_LEVELS = WORKBOOK_ZOOM_LEVELS

const props = defineProps<{
  storeId: string
  stats: StoreWorkbookStats
  movements: StoreSheetMovement[]
  sections: StoreSheetSection[]
  openEditSection: (sectionIndex: number) => void
  deleteSection: (sectionIndex: number) => void | Promise<void>
  openEditMovement: (scope: 'total' | 'section', dataIndex: number, sectionIndex?: number) => void
  deleteMovement: (scope: 'total' | 'section', dataIndex: number, sectionIndex?: number) => void | Promise<void>
}>()

const prefs = useTablePrefs(() => storesDetailWorkbookKey(props.storeId))
const hostRef = ref<HTMLElement | null>(null)
const hotRef = ref<{ hotInstance?: Handsontable | null } | null>(null)
const tableHeight = ref(420)
const applyingData = ref(false)
const mounted = ref(false)
const fontFamily = ref<string>(WORKBOOK_DEFAULT_FONT_FAMILY)
const fontSize = ref(WORKBOOK_DEFAULT_FONT_SIZE)
const isBold = ref(false)
const isItalic = ref(false)
const textAlign = ref<TextAlign>('right')
const textColor = ref('#111827')
const bgColor = ref('transparent')
const zoomPercent = ref(100)
const cellStyles = reactive<Record<string, CellStyle>>({})
const cellRegions = shallowRef<StoreRegion[][]>([])
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastActionKey = ''
let resizeObserver: ResizeObserver | null = null
let lastSelection: Array<[number, number, number, number]> = []
let measureCtx: CanvasRenderingContext2D | null = null

function styleKey(row: number, col: number) {
  return `${row}:${col}`
}
function getCellStyle(row: number, col: number) {
  return cellStyles[styleKey(row, col)]
}

const workbookPack = computed(() =>
  buildStoreWorkbook({
    movements: props.movements,
    sections: props.sections,
    stats: props.stats
  })
)

const sheetData = computed(() => matrixForHot(workbookPack.value.matrix))

watch(
  workbookPack,
  (pack) => {
    cellRegions.value = pack.regions
  },
  { immediate: true }
)

function regionAt(row: number, col: number) {
  return cellRegions.value[row]?.[col]
}

function loadCellStylesFromPrefs() {
  const sheets = prefs.styles.value?.sheets as
    | Record<string, { cellStyles?: Record<string, CellStyle>, zoom?: number }>
    | undefined
  const bucket = sheets?.[STORE_SHEET_KEY]
  const next = bucket?.cellStyles || {}
  for (const key of Object.keys(cellStyles)) delete cellStyles[key]
  Object.assign(cellStyles, next)
  const z = Number(bucket?.zoom)
  if (Number.isFinite(z) && z >= 50) {
    zoomPercent.value = Math.min(200, Math.max(50, Math.round(z)))
  }
}

function savedColWidths(): number[] | undefined {
  const sheets = prefs.styles.value?.sheets as
    | Record<string, { colWidths?: number[] }>
    | undefined
  const saved = sheets?.[STORE_SHEET_KEY]?.colWidths
  const mins = defaultStoreColWidths()
  if (!saved?.length || saved.length !== mins.length) return undefined
  return saved.map((w, i) => Math.max(Number(w) || 0, mins[i] ?? 96))
}

function rememberSelection(hot?: Handsontable | null) {
  const inst = hot ?? hotRef.value?.hotInstance
  if (!inst || inst.isDestroyed) return
  const sel = inst.getSelected()
  if (sel?.length) lastSelection = sel.map(r => [r[0], r[1], r[2], r[3]] as [number, number, number, number])
}

function restoreSelection(hot: Handsontable, ranges: Array<[number, number, number, number]>) {
  if (!ranges.length || hot.isDestroyed) return
  hot.selectCells(ranges)
}

function normalizeRange(
  hot: Handsontable,
  range: [number, number, number, number]
): [number, number, number, number] | null {
  const maxRow = hot.countRows() - 1
  const maxCol = hot.countCols() - 1
  if (maxRow < 0 || maxCol < 0) return null

  let rowStart = Math.min(range[0], range[2])
  let rowEnd = Math.max(range[0], range[2])
  let colStart = Math.min(range[1], range[3])
  let colEnd = Math.max(range[1], range[3])

  if (rowStart < 0) rowStart = 0
  if (colStart < 0) colStart = 0
  if (rowEnd < 0) rowEnd = maxRow
  if (colEnd < 0) colEnd = maxCol

  return [
    Math.max(0, Math.min(rowStart, maxRow)),
    Math.max(0, Math.min(colStart, maxCol)),
    Math.max(0, Math.min(rowEnd, maxRow)),
    Math.max(0, Math.min(colEnd, maxCol))
  ]
}

function targetRanges(hot: Handsontable) {
  const raw = hot.getSelected() || lastSelection
  const out: Array<[number, number, number, number]> = []
  for (const range of raw) {
    if (!range || range.length < 4) continue
    const n = normalizeRange(hot, [range[0], range[1], range[2], range[3]])
    if (n) out.push(n)
  }
  return out
}

function applyStyleToSelection(patch: CellStyle) {
  const hot = hotRef.value?.hotInstance
  if (!hot) return
  rememberSelection(hot)
  const ranges = targetRanges(hot)
  if (!ranges.length) return
  for (const [r1, c1, r2, c2] of ranges) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        const key = styleKey(r, c)
        const next: CellStyle = { ...(cellStyles[key] || {}), ...patch }
        if (!next.fontFamily) delete next.fontFamily
        if (next.fontSize == null) delete next.fontSize
        if (!next.bold) delete next.bold
        if (!next.italic) delete next.italic
        if (!next.color) delete next.color
        if (!next.backgroundColor || next.backgroundColor === 'transparent') {
          delete next.backgroundColor
        }
        if (!next.align || next.align === 'right') delete next.align
        if (Object.keys(next).length) cellStyles[key] = next
        else delete cellStyles[key]
      }
    }
  }
  hot.render()
  restoreSelection(hot, ranges)
  scheduleSaveStyles()
}

function measureCellTextWidth(text: string, style?: CellStyle) {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  if (!measureCtx) return 0
  const size = style?.fontSize ?? WORKBOOK_DEFAULT_FONT_SIZE
  const family = style?.fontFamily || WORKBOOK_DEFAULT_FONT_FAMILY
  const weight = style?.bold ? '700' : '400'
  const italic = style?.italic ? 'italic' : 'normal'
  measureCtx.font = `${italic} ${weight} ${size}px ${family}`
  return measureCtx.measureText(
    String(text ?? '').replaceAll('\u2066', '').replaceAll('\u2069', '').replaceAll('\u00A0', ' ')
  ).width
}

function fitColumnsToContent(hot?: Handsontable | null, onlyCols?: number[]) {
  const instance = hot ?? hotRef.value?.hotInstance
  if (!instance || instance.isDestroyed) return
  const mins = defaultStoreColWidths()
  const colCount = instance.countCols()
  const rowCount = instance.countRows()
  const targets = onlyCols?.length
    ? onlyCols.filter(c => c >= 0 && c < colCount)
    : Array.from({ length: colCount }, (_, i) => i)
  const next: number[] = []
  for (let c = 0; c < colCount; c++) next[c] = instance.getColWidth(c) || mins[c] || 96
  for (const c of targets) {
    let maxPx = mins[c] ?? 96
    for (let r = 0; r < rowCount; r++) {
      const raw = instance.getDataAtCell(r, c)
      if (raw == null || raw === '') continue
      const s = String(raw)
      if (
        s === ACTION_EDIT
        || s === ACTION_DELETE
        || s === ACTION_OPS
        || s === ACTION_EDIT_SECTION
        || s === ACTION_DELETE_SECTION
        || s === SECTION_TITLE_MARKER
        || s === SECTION_STATS_MARKER
      ) continue
      maxPx = Math.max(maxPx, Math.ceil(measureCellTextWidth(s, getCellStyle(r, c)) + 28))
    }
    next[c] = Math.min(480, Math.max(Math.ceil(maxPx), mins[c] ?? 96))
  }
  instance.updateSettings({ colWidths: next }, false)
  instance.render()
}

function fitColumnsForSelection() {
  const hot = hotRef.value?.hotInstance
  if (!hot || hot.isDestroyed) return
  const ranges = targetRanges(hot)
  const cols = new Set<number>()
  for (const [, c1, , c2] of ranges) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) cols.add(c)
  }
  fitColumnsToContent(hot, cols.size ? [...cols] : undefined)
  scheduleSaveStyles()
}

function onFontFamilyChange(family: string) {
  fontFamily.value = family
  applyStyleToSelection({ fontFamily: family })
  fitColumnsForSelection()
}
function onFontSizeChange(size: number) {
  const next = Math.max(8, Math.min(72, Math.round(size)))
  fontSize.value = next
  applyStyleToSelection({ fontSize: next })
  fitColumnsForSelection()
}
function bumpFontSize(delta: number) {
  const sizes: number[] = [...FONT_SIZES]
  let idx = sizes.indexOf(fontSize.value)
  if (idx < 0) idx = sizes.findIndex(s => s > fontSize.value)
  if (idx < 0) idx = sizes.length - 1
  else idx = Math.max(0, Math.min(sizes.length - 1, idx + (delta < 0 ? (sizes.includes(fontSize.value) ? delta : -1) : delta)))
  if (!sizes.includes(fontSize.value) && delta < 0) {
    const found = sizes.findIndex(s => s > fontSize.value)
    idx = Math.max(0, (found < 0 ? sizes.length : found) - 1)
  }
  onFontSizeChange(sizes[idx]!)
}
function toggleBold() {
  isBold.value = !isBold.value
  applyStyleToSelection({ bold: isBold.value })
}
function toggleItalic() {
  isItalic.value = !isItalic.value
  applyStyleToSelection({ italic: isItalic.value })
}
function onAlignChange(align: TextAlign) {
  textAlign.value = align
  applyStyleToSelection({ align })
}
function onTextColorChange(color: string) {
  textColor.value = color
  applyStyleToSelection({ color })
}
function onBgColorChange(color: string) {
  bgColor.value = color
  applyStyleToSelection({ backgroundColor: color })
}
function setZoom(percent: number) {
  zoomPercent.value = Math.min(200, Math.max(50, Math.round(percent)))
  scheduleSaveStyles()
  queueMicrotask(() => hotRef.value?.hotInstance?.refreshDimensions())
}
function bumpZoom(delta: number) {
  const levels = ZOOM_LEVELS as unknown as number[]
  let idx = levels.indexOf(zoomPercent.value)
  if (idx < 0) {
    idx = levels.findIndex(z => z > zoomPercent.value)
    if (idx < 0) idx = levels.length - 1
    else if (delta < 0) idx = Math.max(0, idx - 1)
  } else {
    idx = Math.max(0, Math.min(levels.length - 1, idx + delta))
  }
  setZoom(levels[idx]!)
}

function selectAllCells() {
  const hot = hotRef.value?.hotInstance
  if (!hot) return
  const full: [number, number, number, number] = [0, 0, hot.countRows() - 1, hot.countCols() - 1]
  hot.selectCells([full])
  lastSelection = [full]
}

function scheduleSaveStyles() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void persistStyles()
  }, 350)
}

async function persistStyles() {
  const hot = hotRef.value?.hotInstance
  try {
    const widths: number[] = []
    if (hot && !hot.isDestroyed) {
      for (let c = 0; c < hot.countCols(); c++) widths[c] = hot.getColWidth(c)
    }
    const prev = (prefs.styles.value || {}) as Record<string, unknown>
    const prevSheets = (prev.sheets || {}) as Record<string, unknown>
    const prevUnified = (prevSheets[STORE_SHEET_KEY] as Record<string, unknown> | undefined) || {}
    const plainCellStyles = JSON.parse(JSON.stringify(cellStyles)) as Record<string, CellStyle>
    await prefs.save({
      ...prev,
      sheets: {
        ...prevSheets,
        [STORE_SHEET_KEY]: {
          ...prevUnified,
          ...(widths.length ? { colWidths: widths } : {}),
          cellStyles: plainCellStyles,
          zoom: zoomPercent.value
        }
      }
    })
  } catch (e) {
    console.warn('[WarehouseDetailWorkbook] style save failed', e)
  }
}

function actionSvg(kind: 'edit' | 'delete') {
  const icons = {
    delete: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 7h12v2H6V7zm2 3h8l-1 9H9L8 10zm3-5h2l1 1h4v2H6V6h4l1-1z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.82-1.84z"/></svg>'
  }
  return icons[kind]
}

function isActionToken(raw: string) {
  return (
    raw === ACTION_EDIT
    || raw === ACTION_DELETE
    || raw === ACTION_OPS
    || raw === ACTION_EDIT_SECTION
    || raw === ACTION_DELETE_SECTION
  )
}

function paintOpsCell(td: HTMLTableCellElement) {
  td.classList.add('wb-action-cell', 'htCenter')
  td.style.textAlign = 'center'
  td.innerHTML
    = `<span class="wb-action-group"><button type="button" class="wb-action-btn wb-action-edit" title="تعديل" tabindex="-1">${actionSvg('edit')}</button><button type="button" class="wb-action-btn wb-action-delete" title="حذف" tabindex="-1">${actionSvg('delete')}</button></span>`
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function applyCellChrome(td: HTMLTableCellElement, row: number, col: number) {
  td.classList.remove('htDimmed')
  const style = getCellStyle(row, col)
  td.style.fontFamily = style?.fontFamily || ''
  if (style?.fontSize) td.style.setProperty('font-size', `${style.fontSize}px`)
  else td.style.removeProperty('font-size')
  td.style.fontWeight = style?.bold ? '700' : ''
  td.style.fontStyle = style?.italic ? 'italic' : ''
  if (style?.color) td.style.setProperty('color', style.color, 'important')
  else td.style.removeProperty('color')
  if (style?.backgroundColor && style.backgroundColor !== 'transparent') {
    td.style.setProperty('background-color', style.backgroundColor, 'important')
  } else {
    td.style.removeProperty('background-color')
  }
  const align = style?.align || 'right'
  td.style.textAlign = align
  td.classList.remove('htLeft', 'htCenter', 'htRight')
  td.classList.add(
    align === 'left' ? 'htLeft' : align === 'center' ? 'htCenter' : 'htRight'
  )
  td.style.whiteSpace = 'nowrap'
}

function paintRobSectionTitle(td: HTMLTableCellElement, sectionIndex: number) {
  const sec = props.sections[sectionIndex]
  const name = sec?.section_name || ''
  td.classList.add('wb-section', 'wb-section-title')
  td.innerHTML = [
    '<span class="wb-section-title-row">',
    `<span class="wb-section-label">${escapeHtml(name)}</span>`,
    `<button type="button" class="wb-action-btn wb-action-edit" title="تعديل الخانة" tabindex="-1">${actionSvg('edit')}</button>`,
    `<button type="button" class="wb-action-btn wb-action-delete" title="حذف الخانة" tabindex="-1">${actionSvg('delete')}</button>`,
    '</span>'
  ].join('')
}

function paintRobSectionStats(td: HTMLTableCellElement, sectionIndex: number) {
  const sec = props.sections[sectionIndex]
  const kgIn = formatNumber(Number(sec?.kg_in || 0))
  const kgOut = formatNumber(Number(sec?.kg_out || 0))
  td.classList.add('wb-section', 'wb-section-stats-cell')
  td.innerHTML
    = `<span class="wb-section-stats" dir="rtl">وارد <b dir="ltr">${escapeHtml(kgIn)}</b> · منصرف <b dir="ltr">${escapeHtml(kgOut)}</b></span>`
}

function styledRenderer(
  this: unknown,
  _instance: Handsontable.Core,
  td: HTMLTableCellElement,
  row: number,
  col: number,
  _prop: string | number,
  value: CellValue,
  _cellProperties: Handsontable.CellProperties
) {
  const region = regionAt(row, col)
  const raw = String(value ?? '')

  if (region?.kind === 'robSection') {
    const local = regionLocalCol(region, col)
    if (local === 0 && (raw === SECTION_TITLE_MARKER || raw.startsWith('__'))) {
      td.replaceChildren()
      paintRobSectionTitle(td, region.sectionIndex ?? -1)
      applyCellChrome(td, row, col)
      return
    }
    if (local === 1 && (raw === SECTION_STATS_MARKER || raw.startsWith('__'))) {
      td.replaceChildren()
      paintRobSectionStats(td, region.sectionIndex ?? -1)
      applyCellChrome(td, row, col)
      return
    }
  }

  Handsontable.renderers.TextRenderer.apply(
    this,
    arguments as unknown as [
      Handsontable.Core,
      HTMLTableCellElement,
      number,
      number,
      string | number,
      CellValue,
      Handsontable.CellProperties
    ]
  )
  applyCellChrome(td, row, col)
  const style = getCellStyle(row, col)

  if (region?.kind === 'kpi') td.classList.add('wb-kpi')
  if (region?.kind === 'totalSection' || region?.kind === 'robSection') td.classList.add('wb-section')
  if (region?.kind === 'totalHeader' || region?.kind === 'robHeader') td.classList.add('wb-col-header')
  if (region?.kind === 'totalTotal' || region?.kind === 'robTotal') td.classList.add('wb-total')

  if (raw === ACTION_OPS) {
    td.replaceChildren()
    paintOpsCell(td)
  } else if (isActionToken(raw)) {
    td.innerHTML = ''
    td.classList.add('wb-action-cell', 'htCenter')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'wb-action-btn'
    if (raw === ACTION_EDIT || raw === ACTION_EDIT_SECTION) {
      btn.classList.add('wb-action-edit')
      btn.innerHTML = actionSvg('edit')
      btn.title = raw === ACTION_EDIT_SECTION ? 'تعديل الخانة' : 'تعديل'
    } else {
      btn.classList.add('wb-action-delete')
      btn.innerHTML = actionSvg('delete')
      btn.title = raw === ACTION_DELETE_SECTION ? 'حذف الخانة' : 'حذف'
    }
    td.appendChild(btn)
  } else if (raw === 'وارد') {
    if (!style?.color) td.style.setProperty('color', '#059669')
    if (!style?.bold) td.style.fontWeight = '600'
  } else if (raw === 'منصرف') {
    if (!style?.color) td.style.setProperty('color', '#2563eb')
    if (!style?.bold) td.style.fontWeight = '600'
  }

  if (/جنيه/.test(raw) || /^\u2066?[\d,]+\.\d{2}/.test(raw)) {
    td.style.direction = 'ltr'
    td.style.unicodeBidi = 'isolate'
  } else {
    td.style.direction = ''
    td.style.unicodeBidi = ''
  }
}

function clickActionKind(event?: MouseEvent): 'delete' | 'edit' | null {
  const el = event?.target as HTMLElement | null
  const btn = el?.closest?.('.wb-action-btn') as HTMLElement | null
  if (!btn) return null
  if (btn.classList.contains('wb-action-delete')) return 'delete'
  if (btn.classList.contains('wb-action-edit')) return 'edit'
  return null
}

async function handleCellClick(row: number, col: number, event?: MouseEvent) {
  const region = regionAt(row, col)
  if (!region) return
  const action = clickActionKind(event)
  const key = `${region.kind}:${row}:${col}:${action || 'cell'}`
  if (key === lastActionKey) return
  lastActionKey = key
  setTimeout(() => {
    if (lastActionKey === key) lastActionKey = ''
  }, 400)

  if (region.kind === 'robSection') {
    const si = region.sectionIndex ?? -1
    if (si < 0 || !action) return
    if (action === 'edit') props.openEditSection(si)
    else if (action === 'delete') await props.deleteSection(si)
    return
  }

  if (region.kind === 'totalMovement') {
    const dataIndex = region.dataIndex ?? -1
    if (dataIndex < 0 || !action) return
    if (action === 'edit') props.openEditMovement('total', dataIndex)
    else if (action === 'delete') await props.deleteMovement('total', dataIndex)
    return
  }

  if (region.kind === 'robMovement') {
    const dataIndex = region.dataIndex ?? -1
    const si = region.sectionIndex ?? -1
    if (dataIndex < 0 || si < 0 || !action) return
    if (action === 'edit') props.openEditMovement('section', dataIndex, si)
    else if (action === 'delete') await props.deleteMovement('section', dataIndex, si)
  }
}

function syncTableHeight() {
  const el = hostRef.value
  if (!el) return
  const h = el.clientHeight
  if (h > 120) tableHeight.value = h
}

function refreshHotData() {
  const hot = hotRef.value?.hotInstance
  if (!hot) return
  applyingData.value = true
  try {
    hot.loadData(sheetData.value)
  } finally {
    queueMicrotask(() => {
      applyingData.value = false
      fitColumnsToContent(hot)
    })
  }
}

const hotSettings = computed((): GridSettings => {
  const widths = savedColWidths()
  return {
    data: sheetData.value,
    layoutDirection: 'rtl',
    language: 'en-US',
    themeName: 'ht-theme-main',
    licenseKey: 'non-commercial-and-evaluation',
    height: tableHeight.value,
    width: '100%',
    stretchH: 'none',
    rowHeaders: true,
    colHeaders: true,
    fixedRowsTop: 0,
    manualColumnResize: true,
    contextMenu: false,
    copyPaste: true,
    outsideClickDeselects: false,
    wordWrap: false,
    autoColumnSize: { useHeaders: true, syncLimit: '100%' },
    readOnlyCellClassName: '',
    ...(widths ? { colWidths: widths } : {}),
    modifyColWidth(width, column) {
      if (column == null || column < 0) return width
      return Math.max(width, minWidthForStoreCol(column))
    },
    cells(row, col) {
      const region = regionAt(row, col)
      const style = getCellStyle(row, col)
      const align = style?.align || 'right'
      const alignClass
        = align === 'left' ? 'htLeft' : align === 'center' ? 'htCenter' : 'htRight'
      return {
        renderer: styledRenderer,
        readOnly: isStoreReadOnly(region, col),
        readOnlyCellClassName: '',
        wordWrap: false,
        className: alignClass
      }
    },
    afterOnCellMouseDown(event, coords) {
      if (!mounted.value || applyingData.value) return
      if (coords.row < 0 || coords.col < 0) return
      void handleCellClick(coords.row, coords.col, event as MouseEvent)
    },
    afterSelection() {
      rememberSelection()
    },
    afterColumnResize() {
      scheduleSaveStyles()
    }
  }
})

watch(sheetData, () => {
  if (mounted.value) refreshHotData()
})

onMounted(async () => {
  mounted.value = true
  await prefs.load()
  loadCellStylesFromPrefs()
  await nextTick()
  syncTableHeight()
  fitColumnsToContent()
  hotRef.value?.hotInstance?.render()
  if (hostRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => syncTableHeight())
    resizeObserver.observe(hostRef.value)
  }
})

watch(
  () => prefs.styles.value,
  () => {
    if (!mounted.value || prefs.saving.value) return
    loadCellStylesFromPrefs()
  }
)

onBeforeUnmount(() => {
  mounted.value = false
  resizeObserver?.disconnect()
  resizeObserver = null
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  void persistStyles()
})
</script>

<template>
  <div dir="rtl" class="workbook-sheet store-workbook relative flex h-full min-h-0 w-full flex-col overflow-visible rounded-lg border-2 border-default bg-default">
    <WorkbookStyleToolbar
      :font-family="fontFamily"
      :font-size="fontSize"
      :bold="isBold"
      :italic="isItalic"
      :text-align="textAlign"
      :text-color="textColor"
      :bg-color="bgColor"
      :zoom-percent="zoomPercent"
      @select-all="selectAllCells"
      @preserve-selection="rememberSelection()"
      @font-family="onFontFamilyChange"
      @font-size="onFontSizeChange"
      @bump-font-size="bumpFontSize"
      @toggle-bold="toggleBold"
      @toggle-italic="toggleItalic"
      @align="onAlignChange"
      @text-color="onTextColorChange"
      @bg-color="onBgColorChange"
      @zoom="setZoom"
      @bump-zoom="bumpZoom"
    />

    <div
      ref="hostRef"
      class="store-hot relative z-0 min-h-0 flex-1 overflow-auto rounded-b-lg p-1"
    >
      <div
        class="store-hot-zoom h-full origin-top-right"
        :style="{ zoom: zoomPercent / 100 }"
      >
        <HotTable
          ref="hotRef"
          class="store-hot-table ht-theme-main h-full"
          :settings="hotSettings"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.store-workbook :deep(.wb-kpi) {
  font-weight: 600;
  background: color-mix(in oklab, var(--ui-elevated) 80%, transparent);
}
.store-workbook :deep(.wb-section) {
  font-weight: 700;
}
.store-workbook :deep(.wb-section-title-row) {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 100%;
}
.store-workbook :deep(.wb-section-label) {
  font-weight: 700;
}
.store-workbook :deep(.wb-section-stats-cell) {
  font-weight: 600;
}
.store-workbook :deep(.wb-section-stats) {
  font-weight: 600;
  color: color-mix(in oklab, var(--ui-text) 72%, transparent);
  white-space: nowrap;
}
.store-workbook :deep(.wb-section-stats b) {
  font-weight: 700;
  color: var(--ui-text);
}
.store-workbook :deep(.wb-col-header) {
  font-weight: 600;
  background: color-mix(in oklab, var(--ui-elevated) 70%, transparent);
}
.store-workbook :deep(.wb-total) {
  font-weight: 700;
  background: color-mix(in oklab, var(--ui-warning) 10%, transparent);
}
.store-workbook :deep(.handsontable td.htDimmed) {
  color: inherit !important;
  background: inherit !important;
  opacity: 1;
  filter: none;
}
</style>
