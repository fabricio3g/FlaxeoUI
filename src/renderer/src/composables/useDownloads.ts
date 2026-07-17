import { computed, ref } from 'vue'
import { apiGet, apiPost, isRemoteBrowser } from '@/services/api'

export interface DownloadTask {
  id: string
  label: string
  targetPath: string
  url: string
  status: 'downloading' | 'completed' | 'failed' | 'cancelled'
  receivedBytes: number
  totalBytes: number | null
  startedAt: number
  updatedAt: number
  error?: string
}

/** Shared download list so titlebar badge updates while the manager is closed. */
const downloads = ref<DownloadTask[]>([])
const isFetching = ref(false)
let pollInterval: ReturnType<typeof setInterval> | null = null
let pollSubscribers = 0

const activeDownloads = computed(() =>
  downloads.value.filter((task) => task.status === 'downloading')
)

const activeCount = computed(() => activeDownloads.value.length)

async function fetchDownloads(): Promise<void> {
  if (isRemoteBrowser()) return
  if (isFetching.value) return
  isFetching.value = true
  try {
    const result = await apiGet<{ downloads: DownloadTask[] }>('/api/downloads')
    downloads.value = result.downloads || []
  } catch {
    /* ignore poll errors */
  } finally {
    isFetching.value = false
  }
}

function ensurePolling(): void {
  if (pollInterval || isRemoteBrowser()) return
  pollInterval = setInterval(() => {
    void fetchDownloads()
  }, 1000)
}

function stopPollingIfIdle(): void {
  if (pollSubscribers > 0) return
  if (!pollInterval) return
  clearInterval(pollInterval)
  pollInterval = null
}

/**
 * Subscribe to background download polling (titlebar badge, modal).
 * Call the returned disposer on unmount.
 */
function subscribeDownloads(): () => void {
  if (isRemoteBrowser()) return () => undefined
  pollSubscribers += 1
  void fetchDownloads()
  ensurePolling()
  return () => {
    pollSubscribers = Math.max(0, pollSubscribers - 1)
    stopPollingIfIdle()
  }
}

async function cancelDownload(id: string): Promise<void> {
  await apiPost(`/api/downloads/${id}/cancel`, {})
  await fetchDownloads()
}

async function clearCompleted(): Promise<void> {
  await apiPost('/api/downloads/clear-completed', {})
  await fetchDownloads()
}

/**
 * useDownloads() — shared model/package download queue state.
 */
export function useDownloads() {
  return {
    downloads,
    activeDownloads,
    activeCount,
    isFetching,
    fetchDownloads,
    subscribeDownloads,
    cancelDownload,
    clearCompleted
  }
}
