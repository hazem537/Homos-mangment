export type ConfirmDialogOptions = {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: 'error' | 'primary' | 'warning' | 'neutral' | 'success' | 'info' | 'secondary'
}

type ConfirmDialogState = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  confirmColor: NonNullable<ConfirmDialogOptions['confirmColor']>
}

let resolveConfirm: ((value: boolean) => void) | null = null

export function useConfirmDialog() {
  const state = useState<ConfirmDialogState>('confirm-dialog-state', () => ({
    open: false,
    title: 'تأكيد الحذف',
    description: '',
    confirmLabel: 'حذف',
    cancelLabel: 'إلغاء',
    confirmColor: 'error'
  }))

  const confirm = (options: string | ConfirmDialogOptions): Promise<boolean> => {
    const opts = typeof options === 'string' ? { description: options } : options
    state.value = {
      open: true,
      title: opts.title ?? 'تأكيد الحذف',
      description: opts.description,
      confirmLabel: opts.confirmLabel ?? 'حذف',
      cancelLabel: opts.cancelLabel ?? 'إلغاء',
      confirmColor: opts.confirmColor ?? 'error'
    }
    return new Promise((resolve) => {
      resolveConfirm = resolve
    })
  }

  const settle = (value: boolean) => {
    const resolve = resolveConfirm
    resolveConfirm = null
    if (state.value.open) {
      state.value.open = false
    }
    resolve?.(value)
  }

  return {
    state,
    confirm,
    settle
  }
}
