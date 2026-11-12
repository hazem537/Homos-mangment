export type ChartBar = {
  key: string
  label: string
  value: number
  color: string
  hint?: string
}

export type PieSlice = ChartBar & {
  percent: number
  startAngle: number
  endAngle: number
  path: string
}

export function round2(n: number) {
  return Number(n.toFixed(2))
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  }
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) {
  const start = polar(cx, cy, r, startAngle)
  const end = polar(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`,
    'Z'
  ].join(' ')
}

/** Build SVG pie slices from chart bars (values ≤ 0.005 are ignored). */
export function buildPieSlices(
  bars: ChartBar[],
  opts?: { cx?: number, cy?: number, r?: number }
): { slices: PieSlice[], total: number } {
  const cx = opts?.cx ?? 120
  const cy = opts?.cy ?? 120
  const r = opts?.r ?? 100

  const active = bars.filter(b => b.value > 0.005)
  const total = round2(active.reduce((s, b) => s + Math.max(0, b.value), 0))
  if (!active.length || !(total > 0.005)) return { slices: [], total: 0 }

  if (active.length === 1) {
    const only = active[0]!
    return {
      total,
      slices: [{
        ...only,
        percent: 100,
        startAngle: 0,
        endAngle: 360,
        path: [
          `M ${cx} ${cy - r}`,
          `A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`,
          'Z'
        ].join(' ')
      }]
    }
  }

  let angle = 0
  const slices = active.map((bar) => {
    const share = bar.value / total
    const sweep = share * 360
    const startAngle = angle
    const endAngle = angle + sweep
    angle = endAngle
    return {
      ...bar,
      percent: round2(share * 100),
      startAngle,
      endAngle,
      path: slicePath(cx, cy, r, startAngle, endAngle)
    }
  })

  return { slices, total }
}

export function barPercentOfMax(value: number, max: number) {
  const pct = (value / Math.max(max, 0.001)) * 100
  if (!(pct > 0)) return 0
  return Math.min(100, Math.max(2, pct))
}
