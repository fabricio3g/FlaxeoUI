import { ref } from 'vue'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  action?: ToastAction
}

const toasts = ref<Toast[]>([])
let nextId = 0

interface ShowOptions {
  duration?: number
  action?: ToastAction
}

interface UseToastReturn {
  toasts: typeof toasts
  show: (message: string, type?: Toast['type'], durationOrOptions?: number | ShowOptions) => void
  success: (message: string, durationOrOptions?: number | ShowOptions) => void
  error: (message: string, durationOrOptions?: number | ShowOptions) => void
  warning: (message: string, durationOrOptions?: number | ShowOptions) => void
  info: (message: string, durationOrOptions?: number | ShowOptions) => void
  remove: (id: number) => void
}

export function useToast(): UseToastReturn {
  function show(
    message: string,
    type: Toast['type'] = 'info',
    durationOrOptions?: number | ShowOptions
  ): void {
    const defaults = type === 'error' ? 6000 : 4000
    const opts =
      durationOrOptions === undefined
        ? { duration: defaults }
        : typeof durationOrOptions === 'number'
          ? { duration: durationOrOptions }
          : {
              duration: durationOrOptions.duration ?? defaults,
              action: durationOrOptions.action
            }

    const id = nextId++
    toasts.value.push({
      id,
      message,
      type,
      duration: opts.duration,
      action: opts.action
    })

    if (opts.duration > 0) {
      setTimeout(() => remove(id), opts.duration)
    }
  }

  function success(message: string, durationOrOptions?: number | ShowOptions): void {
    show(message, 'success', durationOrOptions)
  }

  function error(message: string, durationOrOptions?: number | ShowOptions): void {
    show(message, 'error', durationOrOptions ?? { duration: 6000 })
  }

  function warning(message: string, durationOrOptions?: number | ShowOptions): void {
    show(message, 'warning', durationOrOptions)
  }

  function info(message: string, durationOrOptions?: number | ShowOptions): void {
    show(message, 'info', durationOrOptions)
  }

  function remove(id: number): void {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  return {
    toasts,
    show,
    success,
    error,
    warning,
    info,
    remove
  }
}
