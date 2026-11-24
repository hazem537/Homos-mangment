import { formatNumber } from '~/utils/formatNumber'

export type CellValue = string | number | boolean | null

export const ACTION_EDIT = '__edit__'
export const ACTION_DELETE = '__delete__'
export const ACTION_OPS = '__ops__'

export const MEKLA_SHEET_KEY = 'unified-v1' as const

export type MeklaSheetMovement = {
  id: string
  dir: 'in' | 'out'
  date: string
  party: string
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  /** Outbound rows only: false for delete-only. */
  can_edit?: boolean
}

/** إجمالي حركات المقلى */
export const TOTAL_HEADERS = [
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

export const TOTAL_EDIT_COL = 7
export const TOTAL_ACTION_COL = 8

export const MEKLA_KPI_ROWS = 2

export type MeklaWorkbookStats = {
  kgIn: number
  kgOut: number
  kgRemaining: number
}

export type MeklaRegionKind =
  | 'kpi'
  | 'spacer'
  | 'totalSection'
  | 'totalHeader'
  | 'totalMovement'
  | 'empty'

export type MeklaRegion = {
  kind: MeklaRegionKind
  colStart?: number
  dataIndex?: number
}

export type MeklaWorkbookPack = {
  matrix: CellValue[][]
  regions: MeklaRegion[][]
  colCount: number
}

export const MEKLA_COL_COUNT = TOTAL_HEADERS.length

export function matrixForHot(matrix: CellValue[][]): (string | number | boolean)[][] {
  return matrix.map(row =>
    row.map((v) => {
      if (v === null || v === undefined) return ''
      return v as string | number | boolean
    })
  )
}

function blankRow(width = MEKLA_COL_COUNT): CellValue[] {
  return Array.from({ length: width }, () => '')
}

function blankRegions(width = MEKLA_COL_COUNT): MeklaRegion[] {
  return Array.from({ length: width }, () => ({ kind: 'spacer' as const }))
}

function paintBlock(
  row: CellValue[],
  regions: MeklaRegion[],
  start: number,
  cells: CellValue[],
  region: MeklaRegion
) {
  for (let i = 0; i < cells.length; i++) {
    row[start + i] = cells[i] ?? ''
    regions[start + i] = { ...region, colStart: start }
  }
}

function dirLabel(dir: 'in' | 'out') {
  return dir === 'in' ? 'وارد' : 'منصرف'
}

function totalBlockRows(movements: MeklaSheetMovement[]) {
  const body = Math.max(movements.length, 1)
  return 2 + body
}

/** Mekla KPI band: وارد / منصرف / الرصيد (no نسبة المتبقي). */
export function buildMeklaKpiRows(stats: MeklaWorkbookStats): CellValue[][] {
  return [
    ['وارد', 'منصرف', 'الرصيد', '', '', '', '', '', '', ''],
    [
      formatNumber(stats.kgIn),
      formatNumber(stats.kgOut),
      formatNumber(stats.kgRemaining),
      '',
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
 * One sheet: KPI band + إجمالي حركات المقلى.
 */
export function buildMeklaWorkbook(input: {
  movements: MeklaSheetMovement[]
  stats: MeklaWorkbookStats
}): MeklaWorkbookPack {
  const matrix: CellValue[][] = []
  const regions: MeklaRegion[][] = []
  const colCount = MEKLA_COL_COUNT
  const kpi = MEKLA_KPI_ROWS
  const rowCount = kpi + totalBlockRows(input.movements)

  for (let i = 0; i < rowCount; i++) {
    matrix.push(blankRow(colCount))
    regions.push(blankRegions(colCount))
  }

  const kpiRows = buildMeklaKpiRows(input.stats)
  for (let i = 0; i < kpi; i++) {
    const cells = kpiRows[i] ?? TOTAL_HEADERS.map(() => '')
    const row = matrix[i]!
    const regs = regions[i]!
    for (let c = 0; c < colCount; c++) {
      row[c] = cells[c] ?? ''
      regs[c] = { kind: 'kpi' }
    }
  }

  const titleR = kpi
  const headerR = kpi + 1
  const bodyStart = kpi + 2

  const title = TOTAL_HEADERS.map(() => '') as CellValue[]
  title[0] = 'إجمالي حركات المقلى'
  paintBlock(matrix[titleR]!, regions[titleR]!, 0, title, {
    kind: 'totalSection',
    colStart: 0
  })

  paintBlock(matrix[headerR]!, regions[headerR]!, 0, [...TOTAL_HEADERS], {
    kind: 'totalHeader',
    colStart: 0
  })

  const rows = input.movements
  if (!rows.length) {
    paintBlock(
      matrix[bodyStart]!,
      regions[bodyStart]!,
      0,
      ['لا توجد حركات', '', '', '', '', '', '', '', '', ''],
      { kind: 'empty', colStart: 0 }
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
        0,
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
        { kind: 'totalMovement', dataIndex: i, colStart: 0 }
      )
    }
  }

  return { matrix, regions, colCount }
}

export function isMeklaHeaderRegion(kind: MeklaRegionKind) {
  return (
    kind === 'kpi'
    || kind === 'spacer'
    || kind === 'totalSection'
    || kind === 'totalHeader'
    || kind === 'empty'
  )
}

export function isMeklaReadOnly(region: MeklaRegion | undefined, _absCol: number) {
  if (!region) return true
  if (isMeklaHeaderRegion(region.kind)) return true
  return true
}

export function defaultMeklaColWidths(): number[] {
  const widths = Array.from({ length: MEKLA_COL_COUNT }, () => 100)
  widths[0] = 90
  widths[1] = 120
  widths[2] = 180
  widths[3] = 110
  widths[4] = 100
  widths[5] = 100
  widths[6] = 100
  widths[7] = 88
  widths[8] = 40
  widths[9] = 40
  return widths
}

export function minWidthForMeklaCol(col: number) {
  return defaultMeklaColWidths()[col] ?? 96
}
