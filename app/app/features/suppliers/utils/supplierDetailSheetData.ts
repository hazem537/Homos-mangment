import { formatMoney, formatNumber } from '~/utils/formatNumber'
import type { TransferKind } from '~/types/database.types'
import type {
  SupplierDelivery,
  SupplierPurchase,
  SupplierTransfer
} from './supplierDetailBundle'

export type CellValue = string | number | boolean | null | undefined

export const SHEET_IDS = {
  summary: 'summary',
  purchases: 'purchases',
  transfers: 'transfers',
  deliveries: 'deliveries'
} as const

export type DetailSheetId = (typeof SHEET_IDS)[keyof typeof SHEET_IDS]

/** In-cell action markers — rendered as icon buttons (not plain Arabic labels). */
export const ACTION_DELETE = '__del__'
export const ACTION_ADD = '__add__'
export const ACTION_EDIT = '__edit__'
/** Purchase/transfer row: edit + delete icon buttons in one cell. */
export const ACTION_OPS = '__ops__'

export const PURCHASE_HEADERS = [
  'التاريخ',
  'كجم',
  'أردب',
  'سعر',
  'متوسط',
  'الإجمالي',
  ''
]
export const PURCHASE_READ_ONLY = [2, 4, 5, 6]
export const PURCHASE_HEADER_ROWS = 1
export const PURCHASE_ACTION_COL = 6

export const TRANSFER_HEADERS = ['التاريخ', 'النوع', 'المبلغ', '']
export const TRANSFER_READ_ONLY = [3]
export const TRANSFER_HEADER_ROWS = 1
export const TRANSFER_ACTION_COL = 3

export const DELIVERY_HEADERS = [
  'التاريخ',
  'الوجهة',
  'الكميه',
  'المستلم',
  'الباقي',
  'نولون',
  'مدفوع منا',
  'نولون طرف المورد',
  'الباقي',
  'نثريات',
  'مدفوع منا',
  'نثريات طرف المورد',
  'الباقي',
  'تعديل',
  ''
]
export const DELIVERY_EDIT_COL = 13
export const DELIVERY_ACTION_COL = 14
/** Editable: date, المستلم, نولون, نثريات */
export const DELIVERY_READ_ONLY = [1, 2, 4, 6, 7, 8, 10, 11, 12, 13, 14]
export const DELIVERY_HEADER_ROWS = 1

export const SUMMARY_HEADER_ROWS = 2

export function colCountForSheet(sheetId: DetailSheetId) {
  if (sheetId === SHEET_IDS.purchases) return PURCHASE_HEADERS.length
  if (sheetId === SHEET_IDS.transfers) return TRANSFER_HEADERS.length
  if (sheetId === SHEET_IDS.deliveries) return DELIVERY_HEADERS.length
  return 11
}

/** Normalize matrix cells for Handsontable (null → ''). */
export function matrixForHot(matrix: CellValue[][]): (string | number | boolean)[][] {
  return matrix.map(row =>
    row.map((v) => {
      if (v === null || v === undefined) return ''
      return v as string | number | boolean
    })
  )
}

export function buildSummaryMatrix(input: {
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
}): CellValue[][] {
  return [
    [
      'مشترى',
      'مستلم',
      'متبقي',
      'أردب',
      'متوسط الأردب',
      'آخر سعر',
      'التكلفة',
      'إجمالي المدفوع',
      'مستحق المورد',
      'مستحق نولون/نثريات',
      'الإجمالي المستحق'
    ],
    [
      formatNumber(input.stats.kg),
      formatNumber(input.deliveredKg),
      formatNumber(input.remainingKg),
      formatNumber(input.stats.ardab),
      formatMoney(input.stats.avgPrice),
      formatMoney(input.stats.lastPrice),
      formatMoney(input.stats.costTotal),
      formatMoney(input.stats.paidTotal),
      formatMoney(input.stats.supplierDue),
      formatMoney(input.stats.deliveryCostsDue),
      formatMoney(input.stats.grandDue)
    ]
  ]
}

export function buildPurchaseMatrix(
  rows: SupplierPurchase[],
  runningAvgOf: (id: string) => number,
  trailingEmpty = 1
): CellValue[][] {
  const body = rows.map(row => [
    row.purchase_date || '',
    formatNumber(row.quantity_kg),
    formatNumber(row.ardab),
    formatMoney(row.price_per_ardab),
    formatMoney(runningAvgOf(row.id!)),
    formatMoney(row.total_price),
    ACTION_OPS
  ])
  const empty = Array.from({ length: trailingEmpty }, () => {
    const row = PURCHASE_HEADERS.map(() => '')
    row[PURCHASE_ACTION_COL] = ACTION_ADD
    return row
  })
  return [PURCHASE_HEADERS, ...body, ...empty]
}

export function buildTransferMatrix(
  rows: SupplierTransfer[],
  transferKindLabel: (kind: TransferKind | string) => string,
  trailingEmpty = 1
): CellValue[][] {
  const body = rows.map(row => [
    row.transfer_date || '',
    transferKindLabel(row.kind),
    formatMoney(row.amount),
    ACTION_OPS
  ])
  const empty = Array.from({ length: trailingEmpty }, () => {
    const row = TRANSFER_HEADERS.map(() => '')
    row[TRANSFER_ACTION_COL] = ACTION_ADD
    return row
  })
  return [TRANSFER_HEADERS, ...body, ...empty]
}

export function buildDeliveryMatrix(
  rows: SupplierDelivery[],
  destinationLabel: (row: SupplierDelivery) => string,
  nolonPaidOf: (row: SupplierDelivery) => number,
  nolonSupplierPaidOf: (row: SupplierDelivery) => number,
  nolonRestOf: (row: SupplierDelivery) => number,
  nathriyatPaidOf: (row: SupplierDelivery) => number,
  nathriyatSupplierPaidOf: (row: SupplierDelivery) => number,
  nathriyatRestOf: (row: SupplierDelivery) => number,
  trailingEmpty = 1
): CellValue[][] {
  const body = rows.map(row => [
    row.delivery_date || '',
    destinationLabel(row),
    formatNumber(row.kg_before),
    formatNumber(row.quantity_kg),
    formatNumber(row.kg_after),
    formatMoney(row.nolon_total),
    formatMoney(nolonPaidOf(row)),
    formatMoney(nolonSupplierPaidOf(row)),
    formatMoney(nolonRestOf(row)),
    formatMoney(row.nathriyat_total),
    formatMoney(nathriyatPaidOf(row)),
    formatMoney(nathriyatSupplierPaidOf(row)),
    formatMoney(nathriyatRestOf(row)),
    ACTION_EDIT,
    ACTION_DELETE
  ])
  const empty = Array.from({ length: trailingEmpty }, () => {
    const row = DELIVERY_HEADERS.map(() => '')
    row[DELIVERY_ACTION_COL] = ACTION_ADD
    return row
  })
  return [DELIVERY_HEADERS, ...body, ...empty]
}

/** Prefs bucket for the single horizontal workbook. */
export const UNIFIED_SHEET_KEY = 'unified' as const
export const UNIFIED_KPI_ROWS = SUMMARY_HEADER_ROWS

/** Column blocks side-by-side with no separator columns (RTL → purchases on the right). */
export const UNIFIED_BLOCKS = {
  purchase: { start: 0, count: PURCHASE_HEADERS.length },
  transfer: {
    start: PURCHASE_HEADERS.length,
    count: TRANSFER_HEADERS.length
  },
  delivery: {
    start: PURCHASE_HEADERS.length + TRANSFER_HEADERS.length,
    count: DELIVERY_HEADERS.length
  }
} as const

export const UNIFIED_COL_COUNT
  = UNIFIED_BLOCKS.delivery.start + UNIFIED_BLOCKS.delivery.count

export const UNIFIED_SECTION_ROW = UNIFIED_KPI_ROWS
export const UNIFIED_HEADER_ROW = UNIFIED_KPI_ROWS + 1
export const UNIFIED_DATA_START_ROW = UNIFIED_KPI_ROWS + 2

export type WorkbookRegionKind
  = 'kpi'
    | 'spacer'
    | 'section'
    | 'purchaseHeader'
    | 'purchase'
    | 'purchaseTotal'
    | 'transferHeader'
    | 'transfer'
    | 'transferTotal'
    | 'deliveryHeader'
    | 'delivery'
    | 'deliveryTotal'

export type WorkbookTableTotals = {
  purchase: { kg: number, ardab: number, avgPrice: number, price: number }
  transfer: { count: number, amount: number }
  delivery: {
    kg: number
    remainingKg: number
    nolon: number
    nolonPaid: number
    nolonSupplierPaid: number
    nolonRest: number
    nathriyat: number
    nathriyatPaid: number
    nathriyatSupplierPaid: number
    nathriyatRest: number
  }
}

export type WorkbookRegion = {
  kind: WorkbookRegionKind
  /** Absolute column start of this table block (for localCol = col - colStart). */
  colStart?: number
  /** Entity index within purchases/transfers/deliveries (empty trailing row = length). */
  dataIndex?: number
}

export type WorkbookPack = {
  matrix: CellValue[][]
  /** regions[row][col] — each cell maps to its block for edit/click routing. */
  regions: WorkbookRegion[][]
  colCount: number
}

function blankRow(width = UNIFIED_COL_COUNT): CellValue[] {
  return Array.from({ length: width }, () => '')
}

function blankRegions(width = UNIFIED_COL_COUNT): WorkbookRegion[] {
  return Array.from({ length: width }, () => ({ kind: 'spacer' as const }))
}

function paintBlock(
  row: CellValue[],
  regions: WorkbookRegion[],
  start: number,
  cells: CellValue[],
  region: WorkbookRegion
) {
  for (let i = 0; i < cells.length; i++) {
    row[start + i] = cells[i] ?? ''
    regions[start + i] = { ...region, colStart: start }
  }
}

/**
 * One matrix: KPIs on top; purchases / transfers / deliveries side-by-side below.
 */
export function buildUnifiedWorkbook(input: {
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
  destinationLabel: (row: SupplierDelivery) => string
  nolonPaidOf: (row: SupplierDelivery) => number
  nolonSupplierPaidOf: (row: SupplierDelivery) => number
  nolonRestOf: (row: SupplierDelivery) => number
  nathriyatPaidOf: (row: SupplierDelivery) => number
  nathriyatSupplierPaidOf: (row: SupplierDelivery) => number
  nathriyatRestOf: (row: SupplierDelivery) => number
  totals: WorkbookTableTotals
  trailingEmpty?: number
}): WorkbookPack {
  const trailing = input.trailingEmpty ?? 1
  const matrix: CellValue[][] = []
  const regions: WorkbookRegion[][] = []
  const colCount = UNIFIED_COL_COUNT
  const { purchase: pBlock, transfer: tBlock, delivery: dBlock } = UNIFIED_BLOCKS
  const { purchase: pTot, transfer: tTot, delivery: dTot } = input.totals

  const pushRow = (row: CellValue[], regs: WorkbookRegion[]) => {
    matrix.push(row)
    regions.push(regs)
  }

  const summary = buildSummaryMatrix({
    stats: input.stats,
    deliveredKg: input.deliveredKg,
    remainingKg: input.remainingKg
  })
  for (const summaryRow of summary) {
    const row = blankRow(colCount)
    const regs = blankRegions(colCount)
    for (let c = 0; c < summaryRow.length; c++) {
      row[c] = summaryRow[c] ?? ''
      regs[c] = { kind: 'kpi' }
    }
    pushRow(row, regs)
  }

  // Section titles — title in first col; + button rendered beside it in the workbook
  {
    const row = blankRow(colCount)
    const regs = blankRegions(colCount)
    const pCells = PURCHASE_HEADERS.map(() => '')
    pCells[0] = 'المشتريات'
    paintBlock(row, regs, pBlock.start, pCells, { kind: 'section', colStart: pBlock.start })

    const tCells = TRANSFER_HEADERS.map(() => '')
    tCells[0] = 'التحويلات'
    paintBlock(row, regs, tBlock.start, tCells, { kind: 'section', colStart: tBlock.start })

    const dCells = DELIVERY_HEADERS.map(() => '')
    dCells[0] = 'التسليمات'
    paintBlock(row, regs, dBlock.start, dCells, { kind: 'section', colStart: dBlock.start })
    pushRow(row, regs)
  }

  // Column headers — same horizontal level
  {
    const row = blankRow(colCount)
    const regs = blankRegions(colCount)
    paintBlock(row, regs, pBlock.start, [...PURCHASE_HEADERS], {
      kind: 'purchaseHeader',
      colStart: pBlock.start
    })
    paintBlock(row, regs, tBlock.start, [...TRANSFER_HEADERS], {
      kind: 'transferHeader',
      colStart: tBlock.start
    })
    paintBlock(row, regs, dBlock.start, [...DELIVERY_HEADERS], {
      kind: 'deliveryHeader',
      colStart: dBlock.start
    })
    pushRow(row, regs)
  }

  // Each table: data → 1 blank → its own إجمالي (not one shared totals row).
  const purchaseFooterStart = input.purchases.length
  const transferFooterStart = input.transfers.length
  const deliveryFooterStart = input.deliveries.length
  const bodyRows = Math.max(
    purchaseFooterStart + 2 + trailing,
    transferFooterStart + 2 + trailing,
    deliveryFooterStart + 2 + trailing
  )

  for (let i = 0; i < bodyRows; i++) {
    const row = blankRow(colCount)
    const regs = blankRegions(colCount)

    if (i < input.purchases.length) {
      const item = input.purchases[i]!
      paintBlock(
        row,
        regs,
        pBlock.start,
        [
          item.purchase_date || '',
          formatNumber(item.quantity_kg),
          formatNumber(item.ardab),
          formatMoney(item.price_per_ardab),
          formatMoney(input.runningAvgOf(item.id!)),
          formatMoney(item.total_price),
          ACTION_OPS
        ],
        { kind: 'purchase', dataIndex: i, colStart: pBlock.start }
      )
    }
    else if (i === purchaseFooterStart) {
      paintBlock(
        row,
        regs,
        pBlock.start,
        PURCHASE_HEADERS.map(() => ''),
        { kind: 'spacer', colStart: pBlock.start }
      )
    }
    else if (i === purchaseFooterStart + 1) {
      paintBlock(
        row,
        regs,
        pBlock.start,
        [
          'الإجمالي',
          formatNumber(pTot.kg),
          formatNumber(pTot.ardab),
          '',
          formatMoney(pTot.avgPrice),
          formatMoney(pTot.price),
          ''
        ],
        { kind: 'purchaseTotal', colStart: pBlock.start }
      )
    }
    else if (trailing > 0 && i >= purchaseFooterStart + 2 && i < purchaseFooterStart + 2 + trailing) {
      const pEmpty = PURCHASE_HEADERS.map(() => '')
      pEmpty[PURCHASE_ACTION_COL] = ACTION_ADD
      paintBlock(row, regs, pBlock.start, pEmpty, {
        kind: 'purchase',
        dataIndex: input.purchases.length + (i - purchaseFooterStart - 2),
        colStart: pBlock.start
      })
    }

    if (i < input.transfers.length) {
      const item = input.transfers[i]!
      paintBlock(
        row,
        regs,
        tBlock.start,
        [
          item.transfer_date || '',
          input.transferKindLabel(item.kind),
          formatMoney(item.amount),
          ACTION_OPS
        ],
        { kind: 'transfer', dataIndex: i, colStart: tBlock.start }
      )
    }
    else if (i === transferFooterStart) {
      paintBlock(
        row,
        regs,
        tBlock.start,
        TRANSFER_HEADERS.map(() => ''),
        { kind: 'spacer', colStart: tBlock.start }
      )
    }
    else if (i === transferFooterStart + 1) {
      paintBlock(
        row,
        regs,
        tBlock.start,
        [
          'الإجمالي',
          String(tTot.count),
          formatMoney(tTot.amount),
          ''
        ],
        { kind: 'transferTotal', colStart: tBlock.start }
      )
    }
    else if (trailing > 0 && i >= transferFooterStart + 2 && i < transferFooterStart + 2 + trailing) {
      const tEmpty = TRANSFER_HEADERS.map(() => '')
      tEmpty[TRANSFER_ACTION_COL] = ACTION_ADD
      paintBlock(row, regs, tBlock.start, tEmpty, {
        kind: 'transfer',
        dataIndex: input.transfers.length + (i - transferFooterStart - 2),
        colStart: tBlock.start
      })
    }

    if (i < input.deliveries.length) {
      const item = input.deliveries[i]!
      paintBlock(
        row,
        regs,
        dBlock.start,
        [
          item.delivery_date || '',
          input.destinationLabel(item),
          formatNumber(item.kg_before),
          formatNumber(item.quantity_kg),
          formatNumber(item.kg_after),
          formatMoney(item.nolon_total),
          formatMoney(input.nolonPaidOf(item)),
          formatMoney(input.nolonSupplierPaidOf(item)),
          formatMoney(input.nolonRestOf(item)),
          formatMoney(item.nathriyat_total),
          formatMoney(input.nathriyatPaidOf(item)),
          formatMoney(input.nathriyatSupplierPaidOf(item)),
          formatMoney(input.nathriyatRestOf(item)),
          ACTION_EDIT,
          ACTION_DELETE
        ],
        { kind: 'delivery', dataIndex: i, colStart: dBlock.start }
      )
    }
    else if (i === deliveryFooterStart) {
      paintBlock(
        row,
        regs,
        dBlock.start,
        DELIVERY_HEADERS.map(() => ''),
        { kind: 'spacer', colStart: dBlock.start }
      )
    }
    else if (i === deliveryFooterStart + 1) {
      paintBlock(
        row,
        regs,
        dBlock.start,
        [
          'الإجمالي',
          '',
          formatNumber(dTot.kg + dTot.remainingKg),
          formatNumber(dTot.kg),
          formatNumber(dTot.remainingKg),
          formatMoney(dTot.nolon),
          formatMoney(dTot.nolonPaid),
          formatMoney(dTot.nolonSupplierPaid),
          formatMoney(dTot.nolonRest),
          formatMoney(dTot.nathriyat),
          formatMoney(dTot.nathriyatPaid),
          formatMoney(dTot.nathriyatSupplierPaid),
          formatMoney(dTot.nathriyatRest),
          '',
          ''
        ],
        { kind: 'deliveryTotal', colStart: dBlock.start }
      )
    }
    else if (trailing > 0 && i >= deliveryFooterStart + 2 && i < deliveryFooterStart + 2 + trailing) {
      const dEmpty = DELIVERY_HEADERS.map(() => '')
      dEmpty[DELIVERY_ACTION_COL] = ACTION_ADD
      paintBlock(row, regs, dBlock.start, dEmpty, {
        kind: 'delivery',
        dataIndex: input.deliveries.length + (i - deliveryFooterStart - 2),
        colStart: dBlock.start
      })
    }

    pushRow(row, regs)
  }

  return { matrix, regions, colCount }
}

export function regionLocalCol(region: WorkbookRegion | undefined, absCol: number) {
  if (!region || region.colStart == null) return absCol
  return absCol - region.colStart
}

export function isUnifiedHeaderRegion(kind: WorkbookRegionKind) {
  return (
    kind === 'kpi'
    || kind === 'spacer'
    || kind === 'section'
    || kind === 'purchaseHeader'
    || kind === 'transferHeader'
    || kind === 'deliveryHeader'
    || kind === 'purchaseTotal'
    || kind === 'transferTotal'
    || kind === 'deliveryTotal'
  )
}

/** `col` is the absolute Handsontable column; local index is derived from the region block. */
export function isUnifiedReadOnly(region: WorkbookRegion | undefined, absCol: number) {
  if (!region) return true
  if (isUnifiedHeaderRegion(region.kind)) return true
  // Purchases / transfers are Excel preview only — add/edit via modal
  if (region.kind === 'purchase' || region.kind === 'transfer') return true
  const col = regionLocalCol(region, absCol)
  if (region.kind === 'delivery') return DELIVERY_READ_ONLY.includes(col)
  return true
}

/** Minimum widths so delivery cols (from Excel col N/P onward) stay readable. */
export function defaultUnifiedColWidths(): number[] {
  const widths = Array.from({ length: UNIFIED_COL_COUNT }, () => 100)
  const p = UNIFIED_BLOCKS.purchase.start
  const t = UNIFIED_BLOCKS.transfer.start
  const d = UNIFIED_BLOCKS.delivery.start

  widths[p + 0] = 150 // عنوان القسم + تاريخ
  widths[p + 5] = 120 // إجمالي
  widths[p + 6] = 72 // إجراءات

  widths[t + 0] = 150
  widths[t + 1] = 110
  widths[t + 2] = 120 // مبلغ
  widths[t + 3] = 72 // إجراءات

  // Delivery block — headers like متبقي نولون need real width (Excel col N+)
  widths[d + 0] = 150 // عنوان القسم + تاريخ
  widths[d + 1] = 170 // وجهة
  widths[d + 2] = 110 // الكميه (كجم قبل)
  widths[d + 3] = 100 // المستلم
  widths[d + 4] = 100 // الباقي (كمية)
  widths[d + 5] = 110 // نولون
  widths[d + 6] = 110 // مدفوع منا
  widths[d + 7] = 140 // نولون طرف المورد
  widths[d + 8] = 100 // الباقي نولون
  widths[d + 9] = 110 // نثريات
  widths[d + 10] = 110 // مدفوع منا
  widths[d + 11] = 140 // نثريات طرف المورد
  widths[d + 12] = 100 // الباقي نثريات
  widths[d + 13] = 72 // تعديل
  widths[d + 14] = 72 // حذف
  return widths
}

export function minWidthForUnifiedCol(col: number) {
  const mins = defaultUnifiedColWidths()
  return mins[col] ?? 96
}
