import { computed, ref } from 'vue'
import { apiPost } from '@/services/api'
import { useDownloads } from '@/composables/useDownloads'
import { useModels } from '@/composables/useModels'
import type { HubFile } from '@/lib/starterPacks'

/** Per-file progress text, keyed by `category/filename` — shared across views. */
const fileStatus = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})
const queue = ref<string[]>([])
const running = ref(false)

export function downloadKey(file: Pick<HubFile, 'category' | 'filename'>): string {
  return `${file.category}/${file.filename}`
}

async function waitForTask(id: string, key: string): Promise<void> {
  const { fetchDownloads, downloads } = useDownloads()
  const deadline = Date.now() + 6 * 60 * 60 * 1000 // multi-GB video models on slow links
  while (Date.now() < deadline) {
    await fetchDownloads()
    const task = downloads.value.find((d) => d.id === id)
    if (task?.status === 'completed') return
    if (task?.status === 'failed') throw new Error(task.error || 'Download failed')
    if (task?.status === 'cancelled') throw new Error('Download cancelled')
    if (task?.totalBytes) {
      const pct = Math.min(99, Math.round((task.receivedBytes / task.totalBytes) * 100))
      fileStatus.value[key] = `${pct}%`
    } else if (task?.receivedBytes) {
      fileStatus.value[key] = `${(task.receivedBytes / 1048576).toFixed(0)} MB`
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('Download timed out')
}

async function downloadOne(file: HubFile): Promise<boolean> {
  const key = downloadKey(file)
  fileStatus.value[key] = 'Starting…'
  failed.value[key] = false
  try {
    const result = await apiPost<{ id?: string; error?: string }>('/api/models/download', {
      url: file.url,
      category: file.category,
      filename: file.filename,
      label: file.label
    })
    if (!result?.id) throw new Error(result?.error || 'Download did not start')
    await waitForTask(result.id, key)
    fileStatus.value[key] = 'Done'
    return true
  } catch (error) {
    fileStatus.value[key] = error instanceof Error ? error.message : 'Download failed'
    failed.value[key] = true
    return false
  }
}

export function useModelDownloads() {
  const { fetchModels } = useModels()

  /** Queue files (one transfer at a time); resolves when this batch is done. */
  async function downloadFiles(files: HubFile[]): Promise<{ ok: number; failed: number }> {
    const batch = files.filter((f) => !queue.value.includes(downloadKey(f)))
    batch.forEach((f) => {
      queue.value.push(downloadKey(f))
      fileStatus.value[downloadKey(f)] = 'Queued'
    })
    // Another batch is running: wait until our files leave the queue
    while (running.value) await new Promise((r) => setTimeout(r, 500))
    running.value = true
    let ok = 0
    let bad = 0
    try {
      for (const file of batch) {
        if (await downloadOne(file)) ok++
        else bad++
        queue.value = queue.value.filter((k) => k !== downloadKey(file))
      }
    } finally {
      running.value = false
      await fetchModels({ force: true })
    }
    return { ok, failed: bad }
  }

  return {
    fileStatus,
    failed,
    busy: computed(() => running.value || queue.value.length > 0),
    isQueued: (file: HubFile) => queue.value.includes(downloadKey(file)),
    downloadFiles
  }
}
