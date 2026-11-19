<script setup lang="ts">
/**
 * Supplier detail workbook via Handsontable (single sheet):
 * KPIs on top; المشتريات | التحويلات | التسليمات side-by-side. RTL (column A on the right).
 */
import Handsontable from 'handsontable'
import { registerAllModules } from 'handsontable/registry'
import { HotTable } from '@handsontable/vue3'
import type { CellChange, ChangeSource } from 'handsontable/common'
import type { GridSettings } from 'handsontable/settings'
import { parseDecimal } from '~/utils/formatNumber'
import {
  WORKBOOK_DEFAULT_FONT_FAMILY,
  WORKBOOK_DEFAULT_FONT_SIZE,
  WORKBOOK_FONT_SIZES,
  WORKBOOK_ZOOM_LEVELS,
  type WorkbookTextAlign
} from '~/utils/workbookStyleToolbar'
import { suppliersDetailWorkbookKey } from '~/composables/tableKeys'
import type { TransferKind } from '~/types/database.types'
import type {
  SupplierDelivery,
  SupplierPurchase,
  SupplierTransfer
} from '../utils/supplierDetailBundle'
import {
  ACTION_ADD,
  ACTION_DELETE,
  ACTION_EDIT,
  ACTION_OPS,
  buildUnifiedWorkbook,
  defaultUnifiedColWidths,
  DELIVERY_ACTION_COL,
  DELIVERY_EDIT_COL,
  isUnifiedReadOnly,
  matrixForHot,
  minWidthForUnifiedCol,
  PURCHASE_ACTION_COL,
  regionLocalCol,
  TRANSFER_ACTION_COL,
  UNIFIED_BLOCKS,
  UNIFIED_KPI_ROWS,
  UNIFIED_SHEET_KEY,
  type CellValue,
  type WorkbookRegion
} from '../utils/supplierDetailSheetData'
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
  supplierId: string
  stats: {
    kg: number
    ardab: number
    avgPrice: number
    lastPrice: number
    costTotal: number
    paidTotal: number
    supplierDue: number
    deliveryCostsDue: number
    grandDue: number
  }
  deliveredKg: number
  remainingKg: number
  purchases: SupplierPurchase[]
  transfers: SupplierTransfer[]
  deliveries: SupplierDelivery[]
  runningAvgOf: (id: string) => number
  transferKindLabel: (kind: TransferKind | string) => string
  transferKindOptions: { label: string, value: TransferKind }[]
  destinationLabel: (row: SupplierDelivery) => string
  nolonPaidOf: (row: SupplierDelivery) => number
  nolonSupplierPaidOf: (row: SupplierDelivery) => number
  nolonRestOf: (row: SupplierDelivery) => number
  nathriyatPaidOf: (row: SupplierDelivery) => number
  nathriyatSupplierPaidOf: (row: SupplierDelivery) => number
  nathriyatRestOf: (row: SupplierDelivery) => number
  purchaseTotals: { kg: number, ardab: number, avgPrice: number, price: number }
  transferTotals: { count: number, amount: number }
  deliveryTotals: {
    kg: number
    nolon: number
    nolonPaid: number
    nolonSupplierPaid: number
    nolonRest: number
    nathriyat: number
    nathriyatPaid: number
    nathriyatSupplierPaid: number
    nathriyatRest: number
  }
  commitPurchaseSheet: (
    row: SupplierPurchase | null,
    fields: {
      purchase_date: string
      quantity_kg: number
      price_per_ardab: number
    }
  ) => Promise<boolean>
  commitTransferSheet: (
    row: SupplierTransfer | null,
    fields: {
      transfer_date: string
      kind: TransferKind
      amount: number
    }
  ) => Promise<boolean>
  commitDeliverySheet: (
    row: SupplierDelivery,
    fields: Partial<{
      delivery_date: string
      quantity_kg: number
      nolon_total: number
      nathriyat_total: number
    }>
  ) => Promise<boolean>
  softDeletePurchase: (row: SupplierPurchase) => Promise<void>
  softDeleteTransfer: (row: SupplierTransfer) => Promise<void>
  softDeleteDelivery: (row: SupplierDelivery) => Promise<void>
  openPurchaseCreate: () => void
  openPurchaseEdit: (row: SupplierPurchase) => void
  openTransferCreate: () => void
  openTransferEdit: (row: SupplierTransfer) => void
  openDeliveryEdit: (row: SupplierDelivery) => void | Promise<void>
  openDeliveryCreate: () => void
}>()

const prefs = useTablePrefs(() => suppliersDetailWorkbookKey(props.supplierId))
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
/** Single-sheet cell styles (unified stacked workbook). */
const cellStyles = reactive<Record<string, CellStyle>>({})
const cellRegions = shallowRef<WorkbookRegion[][]>([])
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastActionKey = ''
let resizeObserver: ResizeObserver | null = null
/** Last cell selection — kept when clicking the Excel-like toolbar */
let lastSelection: Array<[number, number, number, number]> = []

function styleKey(row: number, col: number) {
  return `${row}:${col}`
}

function getCellStyle(row: number, col: number): CellStyle | undefined {
  return cellStyles[styleKey(row, col)]
}

function regionAt(row: number, col: number): WorkbookRegion | undefined {
  return cellRegions.value[row]?.[col]
}

function rememberSelection(hot?: Handsontable | null) {
  const instance = hot ?? hotRef.value?.hotInstance
  if (!instance) return
  const live = selectedRanges(instance)
  if (live.length) {
    lastSelection = live.map(([r1, c1, r2, c2]) => [r1, c1, r2, c2])
  }
}

function targetRanges(hot: Handsontable): Array<[number, number, number, number]> {
  const live = selectedRanges(hot)
  if (live.length) return live
  return lastSelection
}

function restoreSelection(hot: Handsontable, ranges: Array<[number, number, number, number]>) {
  if (!ranges.length) return
  // selectCells keeps multi-range highlight like Excel
  hot.selectCells(ranges)
}

function syncTableHeight() {
  const el = hostRef.value
  if (!el) return
  const next = Math.max(240, Math.floor(el.clientHeight))
  if (next === tableHeight.value) return
  tableHeight.value = next
  const hot = hotRef.value?.hotInstance
  if (hot) {
    hot.updateSettings({ height: next }, false)
    hot.refreshDimensions()
  }
}

function loadCellStylesFromPrefs() {
  const sheets = prefs.styles.value?.sheets as
    | Record<string, {
      cellStyles?: Record<string, CellStyle>
      zoom?: number
    }>
    | undefined
  const bucket = sheets?.[UNIFIED_SHEET_KEY]
  const next = bucket?.cellStyles || {}
  for (const key of Object.keys(cellStyles)) delete cellStyles[key]
  Object.assign(cellStyles, next)
  const z = Number(bucket?.zoom)
  if (Number.isFinite(z) && z > 0) {
    zoomPercent.value = Math.min(200, Math.max(50, Math.round(z)))
  }
  // Re-paint so font / color / fill / align from Supabase show immediately
  hotRef.value?.hotInstance?.render()
  applyZoom()
}

function applyZoom() {
  const hot = hotRef.value?.hotInstance
  if (hot && !hot.isDestroyed) {
    queueMicrotask(() => {
      hot.refreshDimensions()
      hot.render()
    })
  }
}

function setZoom(percent: number) {
  const next = Math.min(200, Math.max(50, Math.round(percent)))
  zoomPercent.value = next
  applyZoom()
  scheduleSaveStyles()
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

/**
 * Normalize Handsontable selection coords.
 * Select-all / header clicks use -1 — clamp into every data cell so styles
 * apply to the whole sheet (headers + body + read-only cells).
 */
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

  // -1 = row/col header or "select all" corner → cover the full sheet axis
  if (rowStart < 0) rowStart = 0
  if (colStart < 0) colStart = 0
  if (rowEnd < 0) rowEnd = maxRow
  if (colEnd < 0) colEnd = maxCol

  rowStart = Math.max(0, Math.min(rowStart, maxRow))
  rowEnd = Math.max(0, Math.min(rowEnd, maxRow))
  colStart = Math.max(0, Math.min(colStart, maxCol))
  colEnd = Math.max(0, Math.min(colEnd, maxCol))

  return [rowStart, colStart, rowEnd, colEnd]
}

function selectedRanges(hot: Handsontable): Array<[number, number, number, number]> {
  const raw = hot.getSelected() || []
  const out: Array<[number, number, number, number]> = []
  for (const range of raw) {
    const normalized = normalizeRange(hot, range)
    if (normalized) out.push(normalized)
  }
  return out
}

/** Apply style to every cell in the current (or last) selection — no cell skipped. */
function applyStyleToSelection(patch: CellStyle) {
  const hot = hotRef.value?.hotInstance
  if (!hot) return
  rememberSelection(hot)
  const ranges = targetRanges(hot)
  if (!ranges.length) return

  for (const [rowStart, colStart, rowEnd, colEnd] of ranges) {
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
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

/** Select the entire sheet (all cells), then styles from the ribbon apply to all. */
function selectAllCells() {
  const hot = hotRef.value?.hotInstance
  if (!hot) return
  const maxRow = hot.countRows() - 1
  const maxCol = hot.countCols() - 1
  if (maxRow < 0 || maxCol < 0) return
  const full: [number, number, number, number] = [0, 0, maxRow, maxCol]
  hot.selectCells([full])
  lastSelection = [full]
  syncToolbarFromSelection()
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
  const sizes = FONT_SIZES as unknown as number[]
  let idx = sizes.indexOf(fontSize.value)
  if (idx < 0) {
    idx = sizes.findIndex(s => s > fontSize.value)
    if (idx < 0) idx = sizes.length - 1
    else if (delta < 0) idx = Math.max(0, idx - 1)
  } else {
    idx = Math.max(0, Math.min(sizes.length - 1, idx + delta))
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

function syncToolbarFromSelection() {
  const hot = hotRef.value?.hotInstance
  if (!hot) return
  rememberSelection(hot)
  const ranges = targetRanges(hot)
  if (!ranges.length) return
  const [r1, c1] = ranges[0]!
  const style = getCellStyle(r1, c1)
  fontFamily.value = style?.fontFamily ?? WORKBOOK_DEFAULT_FONT_FAMILY
  fontSize.value = style?.fontSize ?? WORKBOOK_DEFAULT_FONT_SIZE
  isBold.value = !!style?.bold
  isItalic.value = !!style?.italic
  textAlign.value = style?.align ?? 'right'
  textColor.value = style?.color ?? '#111827'
  bgColor.value = style?.backgroundColor ?? 'transparent'
}

function actionButtonHtml(
  kind: 'delete' | 'add' | 'pay' | 'edit',
  title: string
) {
  const icons: Record<typeof kind, string> = {
    delete: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6 7h12v2H6V7zm2 3h8l-1 9H9L8 10zm3-5h2l1 1h4v2H6V6h4l1-1z"/></svg>',
    add: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>',
    pay: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 6h18v12H3V6zm2 2v2h14V8H5zm0 8h6v-2H5v2z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.82-1.84z"/></svg>'
  }
  return `<button type="button" class="wb-action-btn wb-action-${kind}" title="${title}" tabindex="-1">${icons[kind]}</button>`
}

function paintActionCell(
  td: HTMLTableCellElement,
  kind: 'delete' | 'add' | 'pay' | 'edit',
  title: string
) {
  td.classList.add('wb-action-cell', 'htCenter')
  td.style.textAlign = 'center'
  td.innerHTML = actionButtonHtml(kind, title)
}

function paintOpsCell(td: HTMLTableCellElement) {
  td.classList.add('wb-action-cell', 'htCenter')
  td.style.textAlign = 'center'
  td.innerHTML
    = `<span class="wb-action-group">${actionButtonHtml('edit', 'تعديل')}${actionButtonHtml('delete', 'حذف')}</span>`
}

function paintSectionTitle(td: HTMLTableCellElement, title: string) {
  td.classList.add('wb-section', 'wb-section-title')
  td.style.textAlign = 'right'
  const safe = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  td.innerHTML
    = `<span class="wb-section-title-row"><span class="wb-section-label">${safe}</span>${actionButtonHtml('add', 'إضافة')}</span>`
}

function styledRenderer(
  this: unknown,
  instance: Handsontable,
  td: HTMLTableCellElement,
  row: number,
  col: number,
  prop: string | number,
  value: unknown,
  cellProperties: { type?: string }
) {
  const marker = String(value ?? '')
  const region = regionAt(row, col)
  // Section title + add button side by side
  if (
    region?.kind === 'section'
    && regionLocalCol(region, col) === 0
    && marker
    && !marker.startsWith('__')
  ) {
    td.replaceChildren()
    td.classList.remove('htDimmed')
    paintSectionTitle(td, marker)
    return
  }
  if (
    marker === ACTION_DELETE
    || marker === ACTION_ADD
    || marker === ACTION_EDIT
    || marker === ACTION_OPS
  ) {
    td.replaceChildren()
    td.classList.remove('htDimmed')
    if (marker === ACTION_OPS) paintOpsCell(td)
    else if (marker === ACTION_DELETE) paintActionCell(td, 'delete', 'حذف')
    else if (marker === ACTION_ADD) paintActionCell(td, 'add', 'إضافة')
    else paintActionCell(td, 'edit', 'تعديل')
    return
  }

  const base
    = cellProperties.type === 'dropdown'
      ? Handsontable.renderers.DropdownRenderer
      : Handsontable.renderers.TextRenderer
  base.call(this, instance, td, row, col, prop, value, cellProperties as never)
  // Handsontable adds htDimmed on read-only cells with color/background !important —
  // strip it so ribbon formatting can show, and paint with !important to win theme CSS.
  td.classList.remove('htDimmed')
  td.classList.remove('wb-action-cell')
  const style = getCellStyle(row, col)
  td.style.fontFamily = style?.fontFamily || ''
  td.style.fontSize = style?.fontSize ? `${style.fontSize}px` : ''
  td.style.fontWeight = style?.bold ? '700' : ''
  td.style.fontStyle = style?.italic ? 'italic' : ''
  if (style?.color) {
    td.style.setProperty('color', style.color, 'important')
  } else {
    td.style.removeProperty('color')
  }
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
  // Keep money/numbers from visually flipping inside the RTL sheet
  const raw = String(value ?? '')
  if (/جنيه/.test(raw) || /^\u2066?[\d,]+\.\d{2}/.test(raw)) {
    td.style.direction = 'ltr'
    td.style.unicodeBidi = 'isolate'
    td.classList.add('wb-num')
  } else {
    td.style.direction = ''
    td.style.unicodeBidi = ''
    td.classList.remove('wb-num')
  }
}

function resolveKind(raw: string, fallback: TransferKind): TransferKind {
  const t = raw.trim()
  const byValue = props.transferKindOptions.find(o => o.value === t)
  if (byValue) return byValue.value
  const byLabel = props.transferKindOptions.find(o => o.label === t)
  if (byLabel) return byLabel.value
  return fallback
}

function buildWorkbook() {
  return buildUnifiedWorkbook({
    stats: props.stats,
    deliveredKg: props.deliveredKg,
    remainingKg: props.remainingKg,
    purchases: props.purchases,
    transfers: props.transfers,
    deliveries: props.deliveries,
    runningAvgOf: props.runningAvgOf,
    transferKindLabel: props.transferKindLabel,
    destinationLabel: props.destinationLabel,
    nolonPaidOf: props.nolonPaidOf,
    nolonSupplierPaidOf: props.nolonSupplierPaidOf,
    nolonRestOf: props.nolonRestOf,
    nathriyatPaidOf: props.nathriyatPaidOf,
    nathriyatSupplierPaidOf: props.nathriyatSupplierPaidOf,
    nathriyatRestOf: props.nathriyatRestOf,
    totals: {
      purchase: props.purchaseTotals,
      transfer: props.transferTotals,
      delivery: {
        kg: props.deliveryTotals.kg,
        remainingKg: props.remainingKg,
        nolon: props.deliveryTotals.nolon,
        nolonPaid: props.deliveryTotals.nolonPaid,
        nolonSupplierPaid: props.deliveryTotals.nolonSupplierPaid,
        nolonRest: props.deliveryTotals.nolonRest,
        nathriyat: props.deliveryTotals.nathriyat,
        nathriyatPaid: props.deliveryTotals.nathriyatPaid,
        nathriyatSupplierPaid: props.deliveryTotals.nathriyatSupplierPaid,
        nathriyatRest: props.deliveryTotals.nathriyatRest
      }
    },
    trailingEmpty: 0
  })
}

function savedColWidths(): number[] | undefined {
  const sheets = prefs.styles.value?.sheets as
    | Record<string, { colWidths?: number[] }>
    | undefined
  const saved = sheets?.[UNIFIED_SHEET_KEY]?.colWidths
  const mins = defaultUnifiedColWidths()
  if (!saved?.length || saved.length !== mins.length) return undefined
  // Never let old prefs squash delivery columns below readable mins
  return saved.map((w, i) => Math.max(Number(w) || 0, mins[i] ?? 96))
}

/** Canvas text measure — respects per-cell font size/family (HOT autoColumnSize does not). */
let measureCtx: CanvasRenderingContext2D | null = null
function measureCellTextWidth(text: string, style?: CellStyle) {
  if (!measureCtx) {
    const canvas = document.createElement('canvas')
    measureCtx = canvas.getContext('2d')
  }
  if (!measureCtx) return 0
  const size = style?.fontSize ?? WORKBOOK_DEFAULT_FONT_SIZE
  const family = style?.fontFamily || WORKBOOK_DEFAULT_FONT_FAMILY
  const weight = style?.bold ? '700' : '400'
  const italic = style?.italic ? 'italic' : 'normal'
  measureCtx.font = `${italic} ${weight} ${size}px ${family}`
  const plain = String(text ?? '')
    .replaceAll('\u2066', '')
    .replaceAll('\u2069', '')
    .replaceAll('\u00A0', ' ')
  return measureCtx.measureText(plain).width
}

const COL_FIT_PAD = 28
const COL_FIT_MAX = 520

function fitColumnsToContent(hot?: Handsontable | null, onlyCols?: number[]) {
  const instance = hot ?? hotRef.value?.hotInstance
  if (!instance || instance.isDestroyed) return
  const mins = defaultUnifiedColWidths()
  const colCount = instance.countCols()
  const rowCount = instance.countRows()
  const targets = onlyCols?.length
    ? onlyCols.filter(c => c >= 0 && c < colCount)
    : Array.from({ length: colCount }, (_, i) => i)

  const next: number[] = []
  for (let c = 0; c < colCount; c++) {
    next[c] = instance.getColWidth(c) || mins[c] || 96
  }

  for (const c of targets) {
    let maxPx = mins[c] ?? 96
    const header = instance.getColHeader(c)
    if (header != null && header !== false) {
      maxPx = Math.max(
        maxPx,
        Math.ceil(measureCellTextWidth(String(header), { fontSize: 13, bold: true }) + COL_FIT_PAD)
      )
    }
    for (let r = 0; r < rowCount; r++) {
      const raw = instance.getDataAtCell(r, c)
      if (raw == null || raw === '') continue
      const s = String(raw)
      // Action glyphs are fixed-width buttons, not plain text
      if (
        s === ACTION_ADD
        || s === ACTION_EDIT
        || s === ACTION_DELETE
        || s === ACTION_OPS
      ) continue
      const w = measureCellTextWidth(s, getCellStyle(r, c)) + COL_FIT_PAD
      if (w > maxPx) maxPx = w
    }
    next[c] = Math.min(COL_FIT_MAX, Math.max(Math.ceil(maxPx), mins[c] ?? 96))
  }

  instance.updateSettings({ colWidths: next }, false)
  instance.render()
}

/** After font size/family changes — refit only columns in the current selection. */
function fitColumnsForSelection() {
  const hot = hotRef.value?.hotInstance
  if (!hot || hot.isDestroyed) return
  const ranges = targetRanges(hot)
  const cols = new Set<number>()
  for (const [, c1, , c2] of ranges) {
    const a = Math.min(c1, c2)
    const b = Math.max(c1, c2)
    for (let c = a; c <= b; c++) cols.add(c)
  }
  fitColumnsToContent(hot, cols.size ? [...cols] : undefined)
  scheduleSaveStyles()
}

function scheduleSaveStyles() {
  if (saveTimer) clearTimeout(saveTimer)
  // Debounce ribbon bursts; still flush quickly so Supabase stays in sync
  saveTimer = setTimeout(() => {
    void persistStyles()
  }, 350)
}

/**
 * Persist cell formatting to Supabase `table_view_prefs.workbook_styles`:
 * fontFamily, fontSize, bold, italic, color, backgroundColor, align + col widths.
 */
async function persistStyles() {
  const hot = hotRef.value?.hotInstance
  try {
    const widths: number[] = []
    if (hot && !hot.isDestroyed) {
      const cols = hot.countCols()
      for (let c = 0; c < cols; c++) widths[c] = hot.getColWidth(c)
    }
    const prev = (prefs.styles.value || {}) as Record<string, unknown>
    const prevSheets = (prev.sheets || {}) as Record<string, unknown>
    const prevUnified
      = (prevSheets[UNIFIED_SHEET_KEY] as Record<string, unknown> | undefined) || {}
    // Plain clone — avoids Vue proxy / non-enumerable issues in jsonb
    const plainCellStyles = JSON.parse(JSON.stringify(cellStyles)) as Record<string, CellStyle>
    const ok = await prefs.save({
      ...prev,
      sheets: {
        ...prevSheets,
        [UNIFIED_SHEET_KEY]: {
          ...prevUnified,
          ...(widths.length ? { colWidths: widths } : {}),
          cellStyles: plainCellStyles,
          zoom: zoomPercent.value
        }
      }
    })
    if (!ok) {
      console.warn(
        '[SupplierDetailWorkbook] style save to Supabase failed',
        prefs.lastError?.value
      )
    }
  } catch (e) {
    console.warn('[SupplierDetailWorkbook] style save failed', e)
  }
}

async function onPurchaseCommit(dataRow: number, col: number, value: CellValue) {
  const isNew = dataRow >= props.purchases.length
  const existing = isNew ? null : (props.purchases[dataRow] ?? null)
  if (!isNew && !existing) return

  let purchase_date = existing?.purchase_date || ''
  let quantity_kg = Number(existing?.quantity_kg || 0)
  let price_per_ardab = Number(existing?.price_per_ardab || 0)

  if (col === 0) purchase_date = String(value ?? '').trim()
  else if (col === 1) quantity_kg = parseDecimal(String(value ?? ''))
  else if (col === 3) price_per_ardab = parseDecimal(String(value ?? ''))
  else return

  if (isNew && (!purchase_date || !(quantity_kg > 0) || !(price_per_ardab > 0))) return
  await props.commitPurchaseSheet(existing, {
    purchase_date,
    quantity_kg,
    price_per_ardab
  })
}

async function onTransferCommit(dataRow: number, col: number, value: CellValue) {
  const isNew = dataRow >= props.transfers.length
  const existing = isNew ? null : (props.transfers[dataRow] ?? null)
  if (!isNew && !existing) return

  let transfer_date = existing?.transfer_date || ''
  let kind: TransferKind = (existing?.kind as TransferKind) || 'transfer'
  let amount = Number(existing?.amount || 0)

  if (col === 0) transfer_date = String(value ?? '').trim()
  else if (col === 1) kind = resolveKind(String(value ?? ''), kind)
  else if (col === 2) amount = parseDecimal(String(value ?? ''))
  else return

  if (isNew && (!transfer_date || !(amount > 0))) return
  await props.commitTransferSheet(existing, {
    transfer_date,
    kind,
    amount
  })
}

async function onDeliveryCommit(dataRow: number, col: number, value: CellValue) {
  if (dataRow >= props.deliveries.length) return
  const row = props.deliveries[dataRow]
  if (!row) return
  const patch: Parameters<typeof props.commitDeliverySheet>[1] = {}
  if (col === 0) patch.delivery_date = String(value ?? '').trim()
  else if (col === 3) patch.quantity_kg = parseDecimal(String(value ?? ''))
  else if (col === 5) patch.nolon_total = parseDecimal(String(value ?? ''))
  else if (col === 9) patch.nathriyat_total = parseDecimal(String(value ?? ''))
  else return
  await props.commitDeliverySheet(row, patch)
}

function clickActionKind(event?: MouseEvent): 'delete' | 'add' | 'pay' | 'edit' | null {
  const el = event?.target as HTMLElement | null
  const btn = el?.closest?.('.wb-action-btn') as HTMLElement | null
  if (!btn) return null
  if (btn.classList.contains('wb-action-delete')) return 'delete'
  if (btn.classList.contains('wb-action-add')) return 'add'
  if (btn.classList.contains('wb-action-pay')) return 'pay'
  if (btn.classList.contains('wb-action-edit')) return 'edit'
  return null
}

async function onPurchaseClick(
  dataRow: number,
  col: number,
  action: 'delete' | 'add' | 'pay' | 'edit' | null
) {
  if (col !== PURCHASE_ACTION_COL) return
  if (dataRow < 0) return
  if (dataRow >= props.purchases.length || action === 'add') {
    props.openPurchaseCreate()
    return
  }
  const row = props.purchases[dataRow]
  if (!row) return
  if (action === 'edit') props.openPurchaseEdit(row)
  else await props.softDeletePurchase(row)
}

async function onTransferClick(
  dataRow: number,
  col: number,
  action: 'delete' | 'add' | 'pay' | 'edit' | null
) {
  if (col !== TRANSFER_ACTION_COL) return
  if (dataRow < 0) return
  if (dataRow >= props.transfers.length || action === 'add') {
    props.openTransferCreate()
    return
  }
  const row = props.transfers[dataRow]
  if (!row) return
  if (action === 'edit') props.openTransferEdit(row)
  else await props.softDeleteTransfer(row)
}

async function onDeliveryClick(dataRow: number, col: number) {
  if (dataRow < 0) return
  if (dataRow >= props.deliveries.length) {
    if (col === DELIVERY_ACTION_COL || col === 0) props.openDeliveryCreate()
    return
  }
  const row = props.deliveries[dataRow]
  if (!row) return
  if (col === DELIVERY_EDIT_COL) await props.openDeliveryEdit(row)
  else if (col === DELIVERY_ACTION_COL) await props.softDeleteDelivery(row)
}

async function onSectionAddClick(
  region: WorkbookRegion,
  absCol: number,
  action: 'delete' | 'add' | 'pay' | 'edit' | null
) {
  if (region.colStart === undefined) return
  const local = regionLocalCol(region, absCol)
  // + is beside the title (local col 0), or legacy action-col clicks
  const isTitleAdd = local === 0 && (action === 'add' || action == null)
  if (!isTitleAdd && action !== 'add') return

  if (region.colStart === UNIFIED_BLOCKS.purchase.start) {
    props.openPurchaseCreate()
    return
  }
  if (region.colStart === UNIFIED_BLOCKS.transfer.start) {
    props.openTransferCreate()
    return
  }
  if (region.colStart === UNIFIED_BLOCKS.delivery.start) {
    props.openDeliveryCreate()
  }
}

const workbookPack = computed(() => buildWorkbook())

const sheetData = computed(() => matrixForHot(workbookPack.value.matrix))

watch(
  workbookPack,
  (pack) => {
    cellRegions.value = pack.regions
  },
  { immediate: true }
)

const hotSettings = computed((): GridSettings => {
  const widths = savedColWidths()
  const transferLabels = props.transferKindOptions.map(o => o.label)

  return {
    data: sheetData.value,
    layoutDirection: 'rtl',
    language: 'en-US',
    themeName: 'ht-theme-main',
    licenseKey: 'non-commercial-and-evaluation',
    // Pixel height required — percent height collapses to 0 inside flex parents
    height: tableHeight.value,
    width: '100%',
    // Don't compress columns — keep content-based widths (single line)
    stretchH: 'none',
    rowHeaders: true,
    colHeaders: true,
    // Pin KPI rows at the top while the side-by-side tables scroll
    fixedRowsTop: UNIFIED_KPI_ROWS,
    manualColumnResize: true,
    contextMenu: false,
    copyPaste: true,
    // Excel-like: clicking the style ribbon must not clear the active selection
    outsideClickDeselects: false,
    autoWrapRow: true,
    autoWrapCol: true,
    // Keep cell text on one line; columns grow to fit instead of wrapping
    wordWrap: false,
    autoColumnSize: {
      useHeaders: true,
      syncLimit: '100%'
    },
    // Default htDimmed uses !important gray color/fill and hides ribbon styles
    readOnlyCellClassName: '',
    ...(widths ? { colWidths: widths } : {}),
    modifyColWidth(width, column) {
      if (column == null || column < 0) return width
      return Math.max(width, minWidthForUnifiedCol(column))
    },
    cells(row, col) {
      const region = regionAt(row, col)
      const style = getCellStyle(row, col)
      const align = style?.align || 'right'
      const alignClass
        = align === 'left' ? 'htLeft' : align === 'center' ? 'htCenter' : 'htRight'
      const cell: {
        readOnly?: boolean
        className?: string
        readOnlyCellClassName?: string
        type?: string
        source?: string[]
        renderer?: typeof styledRenderer
        wordWrap?: boolean
      } = {
        renderer: styledRenderer,
        readOnlyCellClassName: '',
        wordWrap: false
      }
      if (isUnifiedReadOnly(region, col)) cell.readOnly = true
      const extras: string[] = [alignClass]
      if (region?.kind === 'kpi') extras.push('wb-kpi')
      if (region?.kind === 'section') extras.push('wb-section')
      if (
        region?.kind === 'purchaseHeader'
        || region?.kind === 'transferHeader'
        || region?.kind === 'deliveryHeader'
      ) {
        extras.push('wb-col-header')
      }
      if (
        region?.kind === 'purchaseTotal'
        || region?.kind === 'transferTotal'
        || region?.kind === 'deliveryTotal'
      ) {
        extras.push('wb-total')
      }
      cell.className = extras.join(' ')
      const local = regionLocalCol(region, col)
      if (
        region?.kind === 'transfer'
        && local === 1
        && !isUnifiedReadOnly(region, col)
      ) {
        cell.type = 'dropdown'
        cell.source = transferLabels
      }
      return cell
    },
    afterChange(changes: CellChange[] | null, source: ChangeSource) {
      if (!changes || applyingData.value || !mounted.value) return
      if (source === 'loadData' || source === 'external') return
      void handleChanges(changes)
    },
    afterOnCellMouseDown(event, coords) {
      if (!mounted.value || applyingData.value) return
      if (coords.row < 0 || coords.col < 0) return
      void handleCellClick(coords.row, coords.col, event as MouseEvent)
    },
    afterSelection() {
      rememberSelection()
    },
    afterSelectionEnd() {
      syncToolbarFromSelection()
    },
    afterColumnResize() {
      scheduleSaveStyles()
    }
  }
})

async function handleChanges(changes: CellChange[]) {
  for (const [row, col, _oldVal, newVal] of changes) {
    const region = regionAt(row, col)
    // Purchases/transfers are modal-only; revert any sheet edits
    if (
      !region
      || isUnifiedReadOnly(region, col)
      || region.kind === 'purchase'
      || region.kind === 'transfer'
    ) {
      refreshHotData()
      continue
    }
    const dataRow = region.dataIndex ?? -1
    if (dataRow < 0) {
      refreshHotData()
      continue
    }
    const local = regionLocalCol(region, col)
    const value = newVal as CellValue
    if (region.kind === 'delivery') await onDeliveryCommit(dataRow, local, value)
    else refreshHotData()
  }
  scheduleSaveStyles()
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

  if (region.kind === 'section') {
    await onSectionAddClick(region, col, action)
    return
  }
  if (
    region.kind !== 'purchase'
    && region.kind !== 'transfer'
    && region.kind !== 'delivery'
  ) {
    return
  }
  const dataRow = region.dataIndex ?? -1
  const local = regionLocalCol(region, col)

  if (region.kind === 'purchase') await onPurchaseClick(dataRow, local, action)
  else if (region.kind === 'transfer') await onTransferClick(dataRow, local, action)
  else if (region.kind === 'delivery') await onDeliveryClick(dataRow, local)
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

watch(
  sheetData,
  () => {
    if (mounted.value) refreshHotData()
  }
)

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
    // Avoid clobbering in-memory edits while an upsert is in flight
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
  <div
    dir="rtl"
    class="workbook-sheet relative flex h-full min-h-0 w-full flex-col overflow-visible rounded-lg border-2 border-default bg-default"
  >
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
      class="supplier-hot relative z-0 min-h-0 flex-1 overflow-auto rounded-b-lg p-1"
    >
      <div
        class="supplier-hot-zoom origin-top-right"
        :style="{ zoom: zoomPercent / 100 }"
      >
        <HotTable
          ref="hotRef"
          class="ht-theme-main"
          :settings="hotSettings"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.supplier-hot {
  min-height: 240px;
}

.supplier-hot :deep(.handsontable) {
  font-size: 13px;
}

.supplier-hot :deep(.handsontable td),
.supplier-hot :deep(.handsontable th) {
  white-space: nowrap;
}

.supplier-hot :deep(td.wb-num) {
  direction: ltr;
  unicode-bidi: isolate;
}

/* Neutralize Handsontable read-only !important gray so custom cell styles show */
.supplier-hot :deep(.handsontable .htDimmed) {
  color: inherit !important;
  background-color: transparent !important;
  opacity: 1;
  filter: none;
}

.supplier-hot :deep(td.wb-kpi) {
  font-weight: 600;
}

.supplier-hot :deep(td.wb-section) {
  font-weight: 700;
  background-color: var(--ui-bg-elevated, #f1f5f9) !important;
}

.supplier-hot :deep(.wb-section-title-row) {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
}

.supplier-hot :deep(.wb-section-label) {
  font-weight: 700;
}

.supplier-hot :deep(td.wb-col-header) {
  font-weight: 600;
  background-color: var(--ui-bg-elevated, #e2e8f0) !important;
}

.supplier-hot :deep(td.wb-total) {
  font-weight: 700;
  background-color: var(--ui-bg-elevated, #e2e8f0) !important;
  border-top: 2px solid var(--ui-border, #94a3b8) !important;
}

</style>
