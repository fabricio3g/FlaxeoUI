import { computed, ref } from 'vue'
import { apiGet, isRemoteBrowser } from '@/services/api'

const sdServerRunning = ref(false)
const backendVersion = ref('Loading...')
const backendValid = ref(false)
const logs = ref<string[]>([])
const isRuntimeStatusLoading = ref(false)
let pollInterval: number | null = null
let consumers = 0

interface BackendConfigResponse {
  activeVersion?: string
  activeBackendValid?: boolean
}

interface RuntimeStatusResponse {
  running?: boolean
  logs?: string[]
}

async function fetchRuntimeStatus(): Promise<void> {
  isRuntimeStatusLoading.value = true
  try {
    if (isRemoteBrowser()) {
      const remoteData = await apiGet<RuntimeStatusResponse & BackendConfigResponse>(
        '/api/remote/status'
      )
      backendVersion.value = remoteData.activeVersion || 'Installed'
      backendValid.value = remoteData.activeBackendValid === true
      sdServerRunning.value = remoteData.running === true
      logs.value = []
      return
    }
    const configData = await apiGet<BackendConfigResponse>('/api/backend/config')
    backendVersion.value = configData.activeVersion || 'Not set'
    backendValid.value = configData.activeBackendValid || false

    const statusData = await apiGet<RuntimeStatusResponse>('/api/status')
    sdServerRunning.value = statusData.running || false
    if (statusData.logs) {
      logs.value = statusData.logs
    }
  } catch {
    backendVersion.value = 'Error'
    backendValid.value = false
    sdServerRunning.value = false
  } finally {
    isRuntimeStatusLoading.value = false
  }
}

function startRuntimeStatusPolling(): void {
  consumers += 1
  fetchRuntimeStatus()
  if (pollInterval) return

  pollInterval = window.setInterval(() => {
    fetchRuntimeStatus()
  }, 2000)
}

function stopRuntimeStatusPolling(): void {
  consumers = Math.max(0, consumers - 1)
  if (consumers > 0 || !pollInterval) return

  clearInterval(pollInterval)
  pollInterval = null
}

export function useRuntimeStatus() {
  const runtimeState = computed<'online' | 'offline' | 'invalid'>(() => {
    if (!backendValid.value) return 'invalid'
    return sdServerRunning.value ? 'online' : 'offline'
  })

  const runtimeLabel = computed(() => {
    if (!backendValid.value) return 'Backend error'
    return sdServerRunning.value ? 'Server online' : 'Server offline'
  })

  return {
    sdServerRunning,
    backendVersion,
    backendValid,
    logs,
    isRuntimeStatusLoading,
    runtimeState,
    runtimeLabel,
    fetchRuntimeStatus,
    startRuntimeStatusPolling,
    stopRuntimeStatusPolling
  }
}
