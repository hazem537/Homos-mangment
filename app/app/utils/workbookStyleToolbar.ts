/** Shared workbook style ribbon constants (suppliers, warehouses, …). */

export type WorkbookTextAlign = 'right' | 'center' | 'left'

export const WORKBOOK_FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Cairo', value: '"Cairo", "Segoe UI", sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' }
] as const

export const WORKBOOK_FONT_SIZES = [
  8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36
] as const

export const WORKBOOK_ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200] as const

/** Excel-like theme row + standard palette for the color popover */
export const WORKBOOK_THEME_COLORS = [
  '#000000', '#FFFFFF', '#EE0000', '#FFC000', '#FFFF00',
  '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060'
]

export const WORKBOOK_STANDARD_COLORS = [
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050',
  '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
  '#F4B183', '#FFE699', '#C6EFCE', '#BDD7EE', '#D9D2E9',
  '#F8CBAD', '#FFF2CC', '#E2EFDA', '#DEEBF7', '#E2D5F1',
  '#C65911', '#BF8F00', '#548235', '#2F5496', '#7030A0',
  '#833C0C', '#7F6000', '#375623', '#1F4E79', '#5B2C6F'
]

export const WORKBOOK_DEFAULT_FONT_FAMILY = WORKBOOK_FONT_FAMILIES[1]!.value
export const WORKBOOK_DEFAULT_FONT_SIZE = 13
