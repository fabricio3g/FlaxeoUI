import { computed, ref } from 'vue'
import { apiGet, initializeApi, isRemoteBrowser } from '@/services/api'

/**
 * One source of truth for "can this window work?":
 * - app: the local Flaxeo service (Express) this window talks to
 * - engine: the installed stable-diffusion.cpp binaries (sd-cli)
 * - loadedModel: "keep the model loaded" (sd-server), decided and run by the service
 */
export type AppState = 'connecting' | 'connected' | 'reconnecting' | 'down'
export type EngineState = 'checking' | 'ready' | 'missing'

const appState = ref<AppState>('connecting')
const appError = ref('')
const engineState = ref<EngineState>('checking')
const engineVersion = ref('')
/** null while the setting is off (or unknown) */
export interface LoadedModelInfo {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  model: string
  error?: string
  unsupported?: boolean
}
const loadedModel = ref<LoadedModelInfo | null>(null)
let pollInterval: number | null = null
let consumers = 0
let unsubscribeShell: (() => void) | null = null
let failures = 0

interface BackendConfigResponse {
  activeVersion?: string
  activeBackendValid?: boolean
  running?: boolean
}

export interface LoadedModelStatus extends LoadedModelInfo {
  enabled?: boolean
}

function loadedModelFrom(status: LoadedModelStatus | null): LoadedModelInfo | null {
  return status?.enabled
    ? {
        status: status.status,
        model: status.model,
        error: status.error,
        unsupported: status.unsupported
      }
    : null
}

/**
 * Bumped by every request and every direct update: a poll answer that was asked for before a
 * newer change (the Engine toggle) must not put the old state back.
 */
let loadedModelVersion = 0

/** Apply the answer of a request that changed the setting (POST /api/loaded-model, /api/stop). */
function setLoadedModel(status: LoadedModelStatus): void {
  loadedModelVersion += 1
  loadedModel.value = loadedModelFrom(status)
}

async function refreshConnection(): Promise<void> {
  const version = ++loadedModelVersion
  try {
    const remote = isRemoteBrowser()
    const backend = await apiGet<BackendConfigResponse>(
      remote ? '/api/remote/status' : '/api/backend/config'
    )
    const status = remote ? null : await apiGet<LoadedModelStatus>('/api/status')
    failures = 0
    appState.value = 'connected'
    appError.value = ''
    engineState.value = backend.activeBackendValid ? 'ready' : 'missing'
    engineVersion.value = backend.activeBackendValid ? backend.activeVersion || 'Installed' : ''
    if (version === loadedModelVersion)
      loadedModel.value = remote
        ? (backend as { loadedModel?: LoadedModelInfo | null }).loadedModel || null
        : loadedModelFrom(status)
  } catch (error) {
    failures += 1
    // One missed poll is a blip; keep the last good state until it repeats.
    if (failures >= 2 || appState.value === 'connecting') {
      appState.value = appState.value === 'connected' ? 'reconnecting' : appState.value
      if (failures >= 5) {
        appState.value = 'down'
        appError.value =
          error instanceof Error ? error.message : 'The local service is not answering.'
      }
    }
  }
}

function listenToShell(): void {
  if (unsubscribeShell || !window.electronAPI?.onServerStatus) return
  unsubscribeShell = window.electronAPI.onServerStatus((status) => {
    if (status.state === 'connected') {
      initializeApi(status.port, status.token)
      void refreshConnection()
    } else if (status.state === 'reconnecting') {
      appState.value = 'reconnecting'
    } else {
      appState.value = 'down'
      appError.value = status.error
    }
  })
}

export function useConnection() {
  function start(): void {
    consumers += 1
    listenToShell()
    void refreshConnection()
    if (!pollInterval) pollInterval = window.setInterval(refreshConnection, 3000)
  }

  function stop(): void {
    consumers = Math.max(0, consumers - 1)
    if (consumers > 0 || !pollInterval) return
    clearInterval(pollInterval)
    pollInterval = null
  }

  const engineReady = computed(() => engineState.value === 'ready')

  /** Plain words for the title bar status and its tooltip. */
  const summary = computed(() => {
    if (appState.value === 'connecting') return 'Connecting…'
    if (appState.value === 'reconnecting') return 'Reconnecting to the local service…'
    if (appState.value === 'down') return appError.value || 'The local service stopped.'
    if (engineState.value === 'checking') return 'Checking the engine…'
    if (engineState.value === 'missing') return 'sd.cpp engine not installed'
    return `Engine ready · ${engineVersion.value}`
  })

  return {
    appState,
    appError,
    engineState,
    engineReady,
    engineVersion,
    loadedModel,
    setLoadedModel,
    summary,
    refreshConnection,
    start,
    stop
  }
}
