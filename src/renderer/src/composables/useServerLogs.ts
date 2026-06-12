import { ref } from 'vue'
import { apiGet, apiPost, getApiBase } from '@/services/api'

const logs = ref<string[]>([])
const total = ref(0)
const isStreaming = ref(false)

let eventSource: EventSource | null = null
let consumers = 0

async function refreshLogs(): Promise<void> {
  const result = await apiGet<{ logs: string[]; total: number }>('/api/logs')
  logs.value = result.logs || []
  total.value = result.total || logs.value.length
}

function openStream(): void {
  if (eventSource) return

  isStreaming.value = true
  eventSource = new EventSource(`${getApiBase()}/api/logs/stream?since=${total.value}`)

  eventSource.addEventListener('hello', (event) => {
    try {
      const data = JSON.parse(event.data)
      if (Array.isArray(data.logs) && data.logs.length > 0) {
        logs.value = [...logs.value, ...data.logs]
      }
      total.value = data.total || logs.value.length
    } catch {
      // Ignore malformed stream frames.
    }
  })

  eventSource.addEventListener('log', (event) => {
    try {
      const data = JSON.parse(event.data)
      if (typeof data.line === 'string') logs.value = [...logs.value, data.line]
      total.value = data.total || logs.value.length
    } catch {
      // Ignore malformed stream frames.
    }
  })

  eventSource.addEventListener('clear', () => {
    logs.value = []
    total.value = 0
  })

  eventSource.onerror = () => {
    closeStream()
    if (consumers > 0) {
      window.setTimeout(() => {
        if (consumers > 0) openStream()
      }, 1000)
    }
  }
}

function closeStream(): void {
  eventSource?.close()
  eventSource = null
  isStreaming.value = false
}

async function startServerLogStream(): Promise<void> {
  consumers += 1
  await refreshLogs()
  openStream()
}

function stopServerLogStream(): void {
  consumers = Math.max(0, consumers - 1)
  if (consumers === 0) closeStream()
}

async function clearServerLogs(): Promise<void> {
  await apiPost('/api/logs/clear', {})
  logs.value = []
  total.value = 0
}

export function useServerLogs() {
  return {
    logs,
    total,
    isStreaming,
    refreshLogs,
    startServerLogStream,
    stopServerLogStream,
    clearServerLogs
  }
}
