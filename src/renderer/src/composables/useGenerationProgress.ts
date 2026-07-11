import { ref } from 'vue'
import { getApiBase } from '@/services/api'

export interface ProgressSnapshot {
  current: number
  total: number
  itPerSec: number
  etaSeconds: number
  label: string
  isActive: boolean
  hasSteps: boolean
}

const current = ref(0)
const total = ref(0)
const itPerSec = ref(0)
const etaSeconds = ref(0)
const label = ref('')
const isActive = ref(false)
const hasSteps = ref(false)

let eventSource: EventSource | null = null
let startedAt = 0
let emaStepMs = 0

const EMA_ALPHA = 0.3

function computeETA(): void {
  if (total.value <= 0 || current.value < 0) return
  const remaining = Math.max(0, total.value - current.value)
  if (remaining === 0) {
    etaSeconds.value = 0
    return
  }
  // Prefer CLI-reported it/s when available (more accurate for video long runs)
  if (itPerSec.value > 0) {
    etaSeconds.value = remaining / itPerSec.value
    return
  }
  if (current.value <= 0 || startedAt <= 0) return
  const elapsed = Date.now() - startedAt
  const msPerStep = elapsed / current.value
  emaStepMs = emaStepMs > 0 ? emaStepMs + EMA_ALPHA * (msPerStep - emaStepMs) : msPerStep
  etaSeconds.value = Math.max(0, (remaining * emaStepMs) / 1000)
}

function reset(): void {
  current.value = 0
  total.value = 0
  itPerSec.value = 0
  etaSeconds.value = 0
  label.value = ''
  emaStepMs = 0
  hasSteps.value = false
}

function cleanup(): void {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  isActive.value = false
  reset()
}

function start(): void {
  cleanup()
  isActive.value = true
  const url = `${getApiBase()}/api/generation/progress`

  const connect = (): void => {
    eventSource = new EventSource(url)

    eventSource.addEventListener('hello', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.progress && data.progress.total > 0) {
          current.value = data.progress.current
          total.value = data.progress.total
          itPerSec.value = data.progress.itPerSec || 0
          label.value = data.progress.label || ''
          startedAt = data.progress.startedAt || Date.now()
          emaStepMs = 0
          hasSteps.value = true
          computeETA()
        }
      } catch { /* ignore */ }
    })

    eventSource.addEventListener('start', (e) => {
      try {
        const data = JSON.parse(e.data)
        label.value = data.label || ''
        startedAt = data.startedAt || Date.now()
        reset()
        isActive.value = true
      } catch { /* ignore */ }
    })

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.total && data.total > 0) {
          current.value = data.current
          total.value = data.total
          itPerSec.value = data.itPerSec || 0
          label.value = data.label || ''
          hasSteps.value = true
          computeETA()
        }
      } catch { /* ignore */ }
    })

    eventSource.addEventListener('end', () => {
      isActive.value = false
    })

    eventSource.onerror = () => {
      const shouldReconnect = isActive.value
      cleanup()
      if (shouldReconnect) {
        isActive.value = true
        setTimeout(connect, 1000)
      }
    }
  }

  connect()
}

function stop(): void {
  isActive.value = false
  cleanup()
}

export function useGenerationProgress() {
  return {
    current,
    total,
    itPerSec,
    etaSeconds,
    label,
    isActive,
    hasSteps,
    start,
    stop
  }
}
