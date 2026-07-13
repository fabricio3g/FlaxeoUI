import { computed, ref } from 'vue'
import { getApiBase, getDesktopApiToken } from '@/services/api'

export interface ProgressSnapshot {
  current: number
  total: number
  itPerSec: number
  etaSeconds: number
  elapsedSeconds: number
  label: string
  phase: string
  phaseLabel: string
  isActive: boolean
  hasSteps: boolean
}

const current = ref(0)
const total = ref(0)
const itPerSec = ref(0)
const etaSeconds = ref(0)
const elapsedSeconds = ref(0)
const label = ref('')
const phase = ref('starting')
const phaseLabel = ref('Starting')
const isActive = ref(false)
const hasSteps = ref(false)

let eventSource: EventSource | null = null
let startedAtMs = 0
let emaStepMs = 0
let tickTimer: ReturnType<typeof setInterval> | null = null

const EMA_ALPHA = 0.3

/** Format seconds as m:ss or h:mm:ss */
export function formatProgressTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatItPerSec(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value >= 10) return `${value.toFixed(1)} it/s`
  if (value >= 1) return `${value.toFixed(2)} it/s`
  // slow: show s/it
  const sPerIt = 1 / value
  return `${sPerIt.toFixed(sPerIt >= 10 ? 1 : 2)} s/it`
}

function tickElapsed(): void {
  if (startedAtMs > 0) {
    elapsedSeconds.value = Math.max(0, (Date.now() - startedAtMs) / 1000)
  } else {
    elapsedSeconds.value = 0
  }
}

function ensureTick(): void {
  if (tickTimer != null) return
  tickElapsed()
  tickTimer = setInterval(tickElapsed, 500)
}

function stopTick(): void {
  if (tickTimer != null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function applyPayload(data: Record<string, unknown>): void {
  if (typeof data.current === 'number') current.value = data.current
  if (typeof data.total === 'number' && data.total > 0) {
    total.value = data.total
    hasSteps.value = true
  }
  if (typeof data.itPerSec === 'number') itPerSec.value = data.itPerSec
  if (typeof data.label === 'string' && data.label) label.value = data.label
  if (typeof data.phase === 'string' && data.phase) phase.value = data.phase
  if (typeof data.phaseLabel === 'string' && data.phaseLabel) {
    phaseLabel.value = data.phaseLabel
  }
  if (typeof data.startedAt === 'number' && data.startedAt > 0) {
    startedAtMs = data.startedAt
    ensureTick()
  }
  computeETA()
  tickElapsed()
}

function computeETA(): void {
  if (total.value <= 0 || current.value < 0) return
  const remaining = Math.max(0, total.value - current.value)
  if (remaining === 0) {
    etaSeconds.value = 0
    return
  }
  if (itPerSec.value > 0) {
    etaSeconds.value = remaining / itPerSec.value
    return
  }
  if (current.value <= 0 || startedAtMs <= 0) return
  const elapsed = Date.now() - startedAtMs
  const msPerStep = elapsed / current.value
  emaStepMs = emaStepMs > 0 ? emaStepMs + EMA_ALPHA * (msPerStep - emaStepMs) : msPerStep
  etaSeconds.value = Math.max(0, (remaining * emaStepMs) / 1000)
}

function reset(): void {
  current.value = 0
  total.value = 0
  itPerSec.value = 0
  etaSeconds.value = 0
  elapsedSeconds.value = 0
  label.value = ''
  phase.value = 'starting'
  phaseLabel.value = 'Starting'
  emaStepMs = 0
  hasSteps.value = false
  startedAtMs = 0
}

function cleanup(): void {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  stopTick()
  isActive.value = false
  reset()
}

function start(): void {
  cleanup()
  isActive.value = true
  startedAtMs = Date.now()
  ensureTick()
  const query = new URLSearchParams()
  const desktopToken = getDesktopApiToken()
  if (desktopToken) query.set('desktopToken', desktopToken)
  const url = `${getApiBase()}/api/generation/progress${query.size ? `?${query}` : ''}`

  const connect = (): void => {
    eventSource = new EventSource(url, { withCredentials: true })

    eventSource.addEventListener('hello', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.progress) applyPayload(data.progress)
      } catch {
        /* ignore */
      }
    })

    eventSource.addEventListener('start', (e) => {
      try {
        const data = JSON.parse(e.data)
        reset()
        isActive.value = true
        startedAtMs = typeof data.startedAt === 'number' ? data.startedAt : Date.now()
        ensureTick()
        applyPayload(data)
      } catch {
        /* ignore */
      }
    })

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data)
        applyPayload(data)
      } catch {
        /* ignore */
      }
    })

    eventSource.addEventListener('end', () => {
      isActive.value = false
      stopTick()
    })

    eventSource.onerror = () => {
      const shouldReconnect = isActive.value
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
      if (shouldReconnect) {
        isActive.value = true
        setTimeout(connect, 1000)
      } else {
        stopTick()
        isActive.value = false
        reset()
      }
    }
  }

  connect()
}

function stop(): void {
  isActive.value = false
  cleanup()
}

const percent = computed(() =>
  total.value > 0 ? Math.min(100, (current.value / total.value) * 100) : 0
)

export function useGenerationProgress() {
  return {
    current,
    total,
    itPerSec,
    etaSeconds,
    elapsedSeconds,
    label,
    phase,
    phaseLabel,
    isActive,
    hasSteps,
    percent,
    start,
    stop
  }
}
