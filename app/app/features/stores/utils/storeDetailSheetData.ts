import { formatNumber } from '~/utils/formatNumber'

export type CellValue = string | number | boolean | null

export const ACTION_EDIT = '__edit__'
export const ACTION_DELETE = '__delete__'
export const ACTION_OPS = '__ops__'
export const ACTION_EDIT_SECTION = '__edit_sec__'
export const ACTION_DELETE_SECTION = '__del_sec__'

export const STORE_SHEET_KEY = 'unified-v3' as const

export type StoreSheetMovement = {
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

export type StoreSheetSection = {
  key: string
  section_name: string
  status_name: string | null
  product_name: string | null
  kg_in: number
  kg_out: number
  kg_remaining: number
  movements: StoreSheetMovement[]
}

/** إجمالي حركات المخزن */
export const TOTAL_HEADERS = [
  'النوع',
  'التاريخ',
  'الخانة',
  'الطرف',
  'الحالة',
  'قبل',
  'كجم',
  'بعد',
  'إجراء',
  ''
] as const

/** حركة على الخانة (بدون عمود الخانة) */
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

/** Token stored in خانة title cell; workbook paints name + actions inline. */
export const SECTION_TITLE_MARKER = '__rob_title__'
/** Token in the column next to خانة name; workbook paints وارد/منصرف totals. */
export const SECTION_STATS_MARKER = '__rob_stats__'

export const STORE_KPI_ROWS = 2

export type StoreWorkbookStats = {
  slotsCount: number
  kgIn: number
  kgOut: number
  kgRemaining: number
}

export type StoreRegionKind =
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

export type StoreRegion = {
  kind: StoreRegionKind
  /** Absolute column start of this table block. */
  colStart?: number
  /** Index in warehouse total movements. */
  dataIndex?: number
  /** Index in sections[] for ربع blocks. */
  sectionIndex?: number
}

export type StoreWorkbookPack = {
  matrix: CellValue[][]
  regions: StoreRegion[][]
  colCount: number
}

export const STORE_BLOCKS = {
  total: { start: 0, count: TOTAL_HEADERS.length },
  section: { start: TOTAL_HEADERS.length, count: SECTION_HEADERS.length }
} as const

export const STORE_COL_COUNT = STORE_BLOCKS.section.start + STORE_BLOCKS.section.count

export function matrixForHot(matrix: CellValue[][]): (string | number | boolean)[][] {
  return matrix.map(row =>
    row.map((v) => {
      if (v === null || v === undefined) return ''
      return v as string | number | boolean
    })
  )
}

function blankRow(width = STORE_COL_COUNT): CellValue[] {
  return Array.from({ length: width }, () => '')
}

function blankRegions(width = STORE_COL_COUNT): StoreRegion[] {
  return Array.from({ length: width }, () => ({ kind: 'spacer' as const }))
}

function paintBlock(
  row: CellValue[],
  regions: StoreRegion[],
  start: number,
  cells: CellValue[],
  region: StoreRegion
) {
  for (let i = 0; i < cells.length; i++) {
    row[start + i] = cells[i] ?? ''
    regions[start + i] = { ...region, colStart: start }
  }
}

function dirLabel(dir: 'in' | 'out') {
  return dir === 'in' ? 'وارد' : 'منصرف'
}

function totalBlockRows(movements: StoreSheetMovement[]) {
  // title + header + body (+ empty line if no rows)
  const body = Math.max(movements.length, 1)
  return 2 + body
}

function sectionBlockRows(sec: StoreSheetSection) {
  // title + header + body(+empty)
  const body = Math.max(sec.movements.length, 1)
  return 2 + body
}

/** Store KPI band: labels row + values row (fits both 10-col blocks). */
export function buildStoreKpiRows(stats: StoreWorkbookStats): CellValue[][] {
  return [
    ['الخانات', 'وارد', 'منصرف', 'الرصيد', '', '', '', '', '', ''],
    [
      formatNumber(stats.slotsCount),
      formatNumber(stats.kgIn),
      formatNumber(stats.kgOut),
      formatNumber(stats.kgRemaining),
      '',
      '',
      '',
      '',
      '',
      ''
    ]
  ]
}

/**
 * One sheet: إجمالي حركات المخزن | الخانات (stacked vertically).
 * KPI band of the store sits above both tables.
 */
export function buildStoreWorkbook(input: {
  movements: StoreSheetMovement[]
  sections: StoreSheetSection[]
  stats: StoreWorkbookStats
}): StoreWorkbookPack {
  const { total: tBlock, section: sBlock } = STORE_BLOCKS
  const matrix: CellValue[][] = []
  const regions: StoreRegion[][] = []
  const colCount = STORE_COL_COUNT
  const kpi = STORE_KPI_ROWS

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

  // Full-width KPI band above إجمالي + الخانات (same pattern as supplier sheet)
  const kpiRows = buildStoreKpiRows(input.stats)
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
    title[0] = 'إجمالي حركات المخزن'
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
        ['لا توجد خانات', '', '', '', '', '', '', '', '', ''],
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

export function regionLocalCol(region: StoreRegion | undefined, absCol: number) {
  if (!region || region.colStart == null) return absCol
  return absCol - region.colStart
}

export function isStoreHeaderRegion(kind: StoreRegionKind) {
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

export function isStoreReadOnly(region: StoreRegion | undefined, _absCol: number) {
  if (!region) return true
  if (isStoreHeaderRegion(region.kind)) return true
  return true
}

export function defaultStoreColWidths(): number[] {
  const widths = Array.from({ length: STORE_COL_COUNT }, () => 100)
  const t = STORE_BLOCKS.total.start
  const s = STORE_BLOCKS.section.start
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

export function minWidthForStoreCol(col: number) {
  return defaultStoreColWidths()[col] ?? 96
}
