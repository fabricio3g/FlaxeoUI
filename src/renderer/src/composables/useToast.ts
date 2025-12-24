import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

const toasts = ref<Toast[]>([])
let nextId = 0

interface UseToastReturn {
  toasts: typeof toasts
  show: (message: string, type?: Toast['type'], duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  remove: (id: number) => void
}

export function useToast(): UseToastReturn {
  function show(message: string, type: Toast['type'] = 'info', duration = 4000): void {
    const id = nextId++
    toasts.value.push({ id, message, type, duration })
    
    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
  }

  function success(message: string, duration?: number): void {
    show(message, 'success', duration)
  }

  function error(message: string, duration?: number): void {
    show(message, 'error', duration ?? 6000)
  }

  function warning(message: string, duration?: number): void {
    show(message, 'warning', duration)
  }

  function info(message: string, duration?: number): void {
    show(message, 'info', duration)
  }

  function remove(id: number): void {
    const index = toasts.value.findIndex(t => t.id === id)
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
