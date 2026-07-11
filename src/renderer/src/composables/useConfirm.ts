import { ref } from 'vue'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive styling on the confirm action */
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((value: boolean) => void) | null
}

const state = ref<ConfirmState>({
  open: false,
  message: '',
  title: 'Confirm',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  danger: true,
  resolve: null
})

/**
 * Promise-based confirm — await requestConfirm({ message: '…' })
 * Pair with <ConfirmDialog /> mounted once in App.vue
 */
export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Resolve any previous pending prompt as cancel
    state.value.resolve?.(false)
    state.value = {
      open: true,
      title: options.title ?? 'Confirm',
      message: options.message,
      confirmLabel: options.confirmLabel ?? (options.danger !== false ? 'Delete' : 'Confirm'),
      cancelLabel: options.cancelLabel ?? 'Cancel',
      danger: options.danger !== false,
      resolve
    }
  })
}

export function useConfirmDialog() {
  function close(result: boolean): void {
    const resolve = state.value.resolve
    state.value.open = false
    state.value.resolve = null
    resolve?.(result)
  }

  function confirm(): void {
    close(true)
  }

  function cancel(): void {
    close(false)
  }

  return {
    state,
    confirm,
    cancel
  }
}
