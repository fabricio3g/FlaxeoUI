<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Download, Loader2, Trash2, X, XCircle } from '@/lib/icons'
import { apiGet, apiPost } from '@/services/api'

interface DownloadTask {
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

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const downloads = ref<DownloadTask[]>([])
let pollInterval: ReturnType<typeof setInterval> | null = null

const activeDownloads = computed(() => downloads.value.filter((task) => task.status === 'downloading'))

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function progressPercent(task: DownloadTask): number {
  if (!task.totalBytes || task.totalBytes <= 0) return 0
  return Math.min(100, Math.max(0, (task.receivedBytes / task.totalBytes) * 100))
}

async function fetchDownloads(): Promise<void> {
  const result = await apiGet<{ downloads: DownloadTask[] }>('/api/downloads')
  downloads.value = result.downloads || []
}

async function cancelDownload(id: string): Promise<void> {
  await apiPost(`/api/downloads/${id}/cancel`, {})
  await fetchDownloads()
}

async function clearCompleted(): Promise<void> {
  await apiPost('/api/downloads/clear-completed', {})
  await fetchDownloads()
}

function startPolling(): void {
  if (pollInterval) return
  pollInterval = setInterval(fetchDownloads, 1000)
}

function stopPolling(): void {
  if (!pollInterval) return
  clearInterval(pollInterval)
  pollInterval = null
}

onMounted(() => {
  fetchDownloads()
  startPolling()
})

onUnmounted(stopPolling)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 backdrop-blur-md titlebar-no-drag md:p-4"
    >
      <div class="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
        <header class="flex items-center justify-between gap-3 border-b border-border p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Download class="h-4 w-4" />
            </div>
            <div class="min-w-0">
              <h2 class="text-base font-semibold">Download Manager</h2>
              <p class="text-xs text-muted-foreground">
                {{ activeDownloads.length }} active · {{ downloads.length }} total
              </p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :disabled="downloads.length === 0"
              @click="clearCompleted"
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Clear Finished</span>
            </button>
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              @click="emit('close')"
              aria-label="Close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </header>

        <div class="flex-1 overflow-y-auto p-3 md:p-4">
          <div
            v-if="downloads.length === 0"
            class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
          >
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Download class="h-5 w-5" />
            </div>
            <p class="font-semibold text-foreground">No downloads yet</p>
            <p class="mt-1 text-xs text-muted-foreground">
              Start a model or backend download to track it here.
            </p>
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="task in downloads"
              :key="task.id"
              class="rounded-lg border border-border bg-card p-4 shadow-xs"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <Loader2 v-if="task.status === 'downloading'" class="h-4 w-4 animate-spin text-primary" />
                    <XCircle v-else-if="task.status === 'failed' || task.status === 'cancelled'" class="h-4 w-4 text-destructive" />
                    <Download v-else class="h-4 w-4 text-emerald-600" />
                    <h3 class="truncate text-sm font-semibold">{{ task.label }}</h3>
                    <span
                      class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      :class="{
                        'bg-primary/10 text-primary': task.status === 'downloading',
                        'bg-emerald-500/10 text-emerald-600': task.status === 'completed',
                        'bg-destructive/10 text-destructive': task.status === 'failed' || task.status === 'cancelled'
                      }"
                    >
                      {{ task.status }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-[11px] text-muted-foreground" :title="task.targetPath">
                    {{ task.targetPath }}
                  </p>
                </div>

                <button
                  v-if="task.status === 'downloading'"
                  type="button"
                  class="inline-flex h-7 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  @click="cancelDownload(task.id)"
                >
                  Stop
                </button>
              </div>

              <div class="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-300"
                  :class="!task.totalBytes && task.status === 'downloading' ? 'w-1/3 animate-pulse' : ''"
                  :style="task.totalBytes ? { width: progressPercent(task) + '%' } : undefined"
                ></div>
              </div>

              <div class="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>
                  {{ formatBytes(task.receivedBytes) }}<template v-if="task.totalBytes"> / {{ formatBytes(task.totalBytes) }}</template>
                </span>
                <span v-if="task.totalBytes">{{ progressPercent(task).toFixed(0) }}%</span>
                <span v-else>Size unknown</span>
              </div>

              <p v-if="task.error" class="mt-2 text-xs text-destructive">{{ task.error }}</p>
            </article>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
