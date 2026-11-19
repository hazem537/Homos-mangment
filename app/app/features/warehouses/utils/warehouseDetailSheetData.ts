import { formatMoney, formatNumber } from '~/utils/formatNumber'

export type CellValue = string | number | boolean | null

export const ACTION_EDIT = '__edit__'
export const ACTION_DELETE = '__delete__'
export const ACTION_OPS = '__ops__'
export const ACTION_EDIT_SECTION = '__edit_sec__'
export const ACTION_DELETE_SECTION = '__del_sec__'

export const WH_SHEET_KEY = 'unified-v3' as const

export type WarehouseSheetMovement = {
  id: string
  dir: 'in' | 'out'
  date: string
  party: string
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  section_name?: string
  /** Outbound rows only: false for waste (delete-only). */
  can_edit?: boolean
}

export type WarehouseSheetSection = {
  key: string
  section_name: string
  status_name: string | null
  product_name: string | null
  kg_in: number
  kg_out: number
  kg_remaining: number
  movements: WarehouseSheetMovement[]
}

/** إجمالي حركات الشونة */
export const TOTAL_HEADERS = [
  'النوع',
  'التاريخ',
  'الربع',
  'الطرف',
  'الحالة',
  'قبل',
  'كجم',
  'بعد',
  'إجراء',
  ''
] as const

/** حركة على الربع (بدون عمود الربع) */
export const SECTION_HEADERS = [
  'النوع',
  'التاريخ',
  'الطرف',
  'الحالة',
  'قبل',
  'كجم',
  'بعد',
  'إجراء',
  '',
  ''
] as const

export const TOTAL_EDIT_COL = 8
export const TOTAL_ACTION_COL = 9
/** Movement row action cols */
export const SECTION_EDIT_COL = 7
export const SECTION_ACTION_COL = 8
export const SECTION_META_COL = 9

/** Token stored in ربع title cell; workbook paints name + actions inline. */
export const SECTION_TITLE_MARKER = '__rob_title__'
/** Token in the column next to ربع name; workbook paints وارد/منصرف totals. */
export const SECTION_STATS_MARKER = '__rob_stats__'

export const WH_KPI_ROWS = 2

export type WarehouseWorkbookStats = {
  sectionsCount: number
  kgIn: number
  kgOut: number
  kgRemaining: number
  wasteRatio: number
  expensesTotal: number
}

export type WhRegionKind =
  | 'kpi'
  | 'spacer'
  | 'totalSection'
  | 'totalHeader'
  | 'totalMovement'
  | 'totalTotal'
  | 'robSection'
  | 'robHeader'
  | 'robMovement'
  | 'robTotal'
  | 'robEmpty'
  | 'empty'

export type WhRegion = {
  kind: WhRegionKind
  /** Absolute column start of this table block. */
  colStart?: number
  /** Index in warehouse total movements. */
  dataIndex?: number
  /** Index in sections[] for ربع blocks. */
  sectionIndex?: number
}

export type WhWorkbookPack = {
  matrix: CellValue[][]
  regions: WhRegion[][]
  colCount: number
}

export const WH_BLOCKS = {
  total: { start: 0, count: TOTAL_HEADERS.length },
  section: { start: TOTAL_HEADERS.length, count: SECTION_HEADERS.length }
} as const

export const WH_COL_COUNT = WH_BLOCKS.section.start + WH_BLOCKS.section.count

export function matrixForHot(matrix: CellValue[][]): (string | number | boolean)[][] {
  return matrix.map(row =>
    row.map((v) => {
      if (v === null || v === undefined) return ''
      return v as string | number | boolean
    })
  )
}

function blankRow(width = WH_COL_COUNT): CellValue[] {
  return Array.from({ length: width }, () => '')
}

function blankRegions(width = WH_COL_COUNT): WhRegion[] {
  return Array.from({ length: width }, () => ({ kind: 'spacer' as const }))
}

function paintBlock(
  row: CellValue[],
  regions: WhRegion[],
  start: number,
  cells: CellValue[],
  region: WhRegion
) {
  for (let i = 0; i < cells.length; i++) {
    row[start + i] = cells[i] ?? ''
    regions[start + i] = { ...region, colStart: start }
  }
}

function dirLabel(dir: 'in' | 'out') {
  return dir === 'in' ? 'وارد' : 'منصرف'
}

function totalBlockRows(movements: WarehouseSheetMovement[]) {
  // title + header + body (+ empty line if no rows)
  const body = Math.max(movements.length, 1)
  return 2 + body
}

function sectionBlockRows(sec: WarehouseSheetSection) {
  // title + header + body(+empty)
  const body = Math.max(sec.movements.length, 1)
  return 2 + body
}

/** Warehouse KPI band: labels row + values row (fits both 10-col blocks). */
export function buildWarehouseKpiRows(stats: WarehouseWorkbookStats): CellValue[][] {
  const remainingPct = stats.wasteRatio * 100
  return [
    ['الأرباع', 'وارد', 'منصرف', 'الرصيد', 'نسبة المتبقي %', 'مصروفات', '', '', '', ''],
    [
      formatNumber(stats.sectionsCount),
      formatNumber(stats.kgIn),
      formatNumber(stats.kgOut),
      formatNumber(stats.kgRemaining),
      formatNumber(remainingPct),
      formatMoney(stats.expensesTotal),
      '',
      '',
      '',
      ''
    ]
  ]
}

/**
 * One sheet: إجمالي حركات الشونة | الأرباع (stacked vertically).
 * KPI band of the warehouse sits above both tables.
 */
export function buildWarehouseWorkbook(input: {
  movements: WarehouseSheetMovement[]
  sections: WarehouseSheetSection[]
  stats: WarehouseWorkbookStats
}): WhWorkbookPack {
  const { total: tBlock, section: sBlock } = WH_BLOCKS
  const matrix: CellValue[][] = []
  const regions: WhRegion[][] = []
  const colCount = WH_COL_COUNT
  const kpi = WH_KPI_ROWS

  const totalRowsNeeded = kpi + totalBlockRows(input.movements)
  const sectionRowsNeeded = kpi + (
    input.sections.length
      ? input.sections.reduce((sum, s) => sum + sectionBlockRows(s) + 1, 0)
      : 3
  )
  const rowCount = Math.max(totalRowsNeeded, sectionRowsNeeded)

  for (let i = 0; i < rowCount; i++) {
    matrix.push(blankRow(colCount))
    regions.push(blankRegions(colCount))
  }

  // Full-width KPI band above إجمالي + الأرباع (same pattern as supplier sheet)
  const kpiRows = buildWarehouseKpiRows(input.stats)
  for (let i = 0; i < kpi; i++) {
    const cells = kpiRows[i] ?? TOTAL_HEADERS.map(() => '')
    const row = matrix[i]!
    const regs = regions[i]!
    for (let c = 0; c < colCount; c++) {
      row[c] = cells[c] ?? ''
      regs[c] = { kind: 'kpi' }
    }
  }

  // —— Total block ——
  {
    const titleR = kpi
    const headerR = kpi + 1
    const bodyStart = kpi + 2

    const title = TOTAL_HEADERS.map(() => '') as CellValue[]
    title[0] = 'إجمالي حركات الشونة'
    paintBlock(matrix[titleR]!, regions[titleR]!, tBlock.start, title, {
      kind: 'totalSection',
      colStart: tBlock.start
    })

    paintBlock(matrix[headerR]!, regions[headerR]!, tBlock.start, [...TOTAL_HEADERS], {
      kind: 'totalHeader',
      colStart: tBlock.start
    })

    const rows = input.movements
    if (!rows.length) {
      paintBlock(
        matrix[bodyStart]!,
        regions[bodyStart]!,
        tBlock.start,
        ['لا توجد حركات', '', '', '', '', '', '', '', '', ''],
        { kind: 'empty', colStart: tBlock.start }
      )
    } else {
      for (let i = 0; i < rows.length; i++) {
        const m = rows[i]!
        const isOut = m.dir === 'out'
        const r = bodyStart + i
        const action = !isOut
          ? ''
          : m.can_edit === false
            ? ACTION_DELETE
            : ACTION_OPS
        paintBlock(
          matrix[r]!,
          regions[r]!,
          tBlock.start,
          [
            dirLabel(m.dir),
            m.date || '',
            m.section_name || '',
            m.party || '',
            m.status_name || '—',
            formatNumber(m.qty_before),
            formatNumber(m.quantity_kg),
            formatNumber(m.qty_after),
            action,
            ''
          ],
          { kind: 'totalMovement', dataIndex: i, colStart: tBlock.start }
        )
      }
    }

  }

  // —— Sections stacked in the right block ——
  {
    let r = kpi
    if (!input.sections.length) {
      paintBlock(
        matrix[r]!,
        regions[r]!,
        sBlock.start,
        ['لا توجد أرباع', '', '', '', '', '', '', '', '', ''],
        { kind: 'robEmpty', colStart: sBlock.start }
      )
    } else {
      for (let si = 0; si < input.sections.length; si++) {
        const sec = input.sections[si]!
        if (r >= rowCount) break

        const title = SECTION_HEADERS.map(() => '') as CellValue[]
        title[0] = SECTION_TITLE_MARKER
        title[1] = SECTION_STATS_MARKER
        paintBlock(matrix[r]!, regions[r]!, sBlock.start, title, {
          kind: 'robSection',
          sectionIndex: si,
          colStart: sBlock.start
        })
        r++

        if (r >= rowCount) break
        paintBlock(matrix[r]!, regions[r]!, sBlock.start, [...SECTION_HEADERS], {
          kind: 'robHeader',
          sectionIndex: si,
          colStart: sBlock.start
        })
        r++

        const moves = sec.movements
        if (!moves.length) {
          if (r >= rowCount) break
          paintBlock(
            matrix[r]!,
            regions[r]!,
            sBlock.start,
            ['لا توجد حركات', '', '', '', '', '', '', '', '', ''],
            { kind: 'robEmpty', sectionIndex: si, colStart: sBlock.start }
          )
          r++
        } else {
          for (let mi = 0; mi < moves.length; mi++) {
            if (r >= rowCount) break
            const m = moves[mi]!
            const isOut = m.dir === 'out'
            const action = !isOut
              ? ''
              : m.can_edit === false
                ? ACTION_DELETE
                : ACTION_OPS
            paintBlock(
              matrix[r]!,
              regions[r]!,
              sBlock.start,
              [
                dirLabel(m.dir),
                m.date || '',
                m.party || '',
                m.status_name || '—',
                formatNumber(m.qty_before),
                formatNumber(m.quantity_kg),
                formatNumber(m.qty_after),
                action,
                '',
                ''
              ],
              {
                kind: 'robMovement',
                sectionIndex: si,
                dataIndex: mi,
                colStart: sBlock.start
              }
            )
            r++
          }
        }

        // gap between sections
        if (si < input.sections.length - 1 && r < rowCount) {
          paintBlock(
            matrix[r]!,
            regions[r]!,
            sBlock.start,
            SECTION_HEADERS.map(() => ''),
            { kind: 'spacer', colStart: sBlock.start }
          )
          r++
        }
      }
    }
  }

  return { matrix, regions, colCount }
}

export function regionLocalCol(region: WhRegion | undefined, absCol: number) {
  if (!region || region.colStart == null) return absCol
  return absCol - region.colStart
}

export function isWhHeaderRegion(kind: WhRegionKind) {
  return (
    kind === 'kpi'
    || kind === 'spacer'
    || kind === 'totalSection'
    || kind === 'totalHeader'
    || kind === 'totalTotal'
    || kind === 'robSection'
    || kind === 'robHeader'
    || kind === 'robTotal'
    || kind === 'robEmpty'
    || kind === 'empty'
  )
}

export function isWhReadOnly(region: WhRegion | undefined, _absCol: number) {
  if (!region) return true
  if (isWhHeaderRegion(region.kind)) return true
  return true
}

export function defaultWhColWidths(): number[] {
  const widths = Array.from({ length: WH_COL_COUNT }, () => 100)
  const t = WH_BLOCKS.total.start
  const s = WH_BLOCKS.section.start
  widths[t + 0] = 90
  widths[t + 1] = 120
  widths[t + 2] = 130
  widths[t + 3] = 160
  widths[t + 4] = 110
  widths[t + 5] = 100
  widths[t + 6] = 100
  widths[t + 7] = 100
  widths[t + 8] = 88
  widths[t + 9] = 40
  widths[s + 0] = 220
  widths[s + 1] = 200
  widths[s + 2] = 160
  widths[s + 3] = 110
  widths[s + 4] = 100
  widths[s + 5] = 100
  widths[s + 6] = 100
  widths[s + 7] = 88
  widths[s + 8] = 40
  widths[s + 9] = 40
  return widths
}

export function minWidthForWhCol(col: number) {
  return defaultWhColWidths()[col] ?? 96
}
