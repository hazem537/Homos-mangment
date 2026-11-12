/**
 * Shrink font-size so single-line text fits its container width.
 * Starts at maxPx and steps down to minPx while scrollWidth > clientWidth.
 */
export function useFitText(opts?: {
  maxPx?: number
  minPx?: number
  /** Extra deps that should re-trigger fitting (e.g. displayed value). */
  watchSource?: () => unknown
}) {
  const maxPx = opts?.maxPx ?? 30
  const minPx = opts?.minPx ?? 14
  const el = ref<HTMLElement | null>(null)

  const fit = () => {
    const node = el.value
    if (!node || !import.meta.client) return

    node.style.fontSize = `${maxPx}px`
    let size = maxPx
    // Allow layout to settle at max before measuring
    while (size > minPx && node.scrollWidth > node.clientWidth + 0.5) {
      size -= 1
      node.style.fontSize = `${size}px`
    }
  }

  let ro: ResizeObserver | null = null

  onMounted(() => {
    fit()
    if (!el.value || typeof ResizeObserver === 'undefined') return
    ro = new ResizeObserver(() => fit())
    ro.observe(el.value)
  })

  onBeforeUnmount(() => {
    ro?.disconnect()
    ro = null
  })

  watch(
    () => [el.value, opts?.watchSource?.()] as const,
    async () => {
      await nextTick()
      fit()
    }
  )

  return { el, fit }
}
