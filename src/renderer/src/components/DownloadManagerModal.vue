<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const downloads = ref<DownloadTask[]>([])
let pollInterval: ReturnType<typeof setInterval> | null = null

const activeDownloads = computed(() =>
  downloads.value.filter((task) => task.status === 'downloading')
)

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
  try {
    const result = await apiGet<{ downloads: DownloadTask[] }>('/api/downloads')
    downloads.value = result.downloads || []
  } catch {
    /* ignore poll errors while closed/opening */
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

function startPolling(): void {
  if (pollInterval) return
  pollInterval = setInterval(fetchDownloads, 1000)
}

function stopPolling(): void {
  if (!pollInterval) return
  clearInterval(pollInterval)
  pollInterval = null
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      fetchDownloads()
      startPolling()
    } else {
      stopPolling()
    }
  }
)

onMounted(() => {
  if (props.open) {
    fetchDownloads()
    startPolling()
  }
})

onUnmounted(stopPolling)
</script>

<template>
  <Teleport to="body">
    <!-- click-away layer (no dim/blur) -->
    <div
      v-if="open"
      class="fixed inset-0 z-[100] titlebar-no-drag"
      aria-hidden="true"
      @pointerdown="emit('close')"
    />
    <Transition name="float-panel">
      <div
        v-if="open"
        role="dialog"
        aria-label="Downloads"
        class="aui-float-panel fixed right-2 top-11 z-[110] flex max-h-[min(70vh,28rem)] w-[min(calc(100vw-1rem),22rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground titlebar-no-drag sm:right-3"
        @pointerdown.stop
      >
        <header
          class="aui-scroll-header aui-scroll-header--popover aui-scroll-header--compact flex items-center justify-between gap-2 bg-popover px-3 py-2.5"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-xs font-semibold tracking-tight">Downloads</h2>
              <span
                v-if="activeDownloads.length"
                class="text-[10px] tabular-nums text-muted-foreground"
              >
                {{ activeDownloads.length }} active
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              :disabled="downloads.length === 0"
              @click="clearCompleted"
            >
              <Trash2 class="size-3" />
              Clear
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="size-3.5" />
            </button>
          </div>
          <div class="aui-scroll-header__fade" aria-hidden="true" />
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <div
            v-if="downloads.length === 0"
            class="px-3 py-8 text-center text-[11px] text-muted-foreground"
          >
            No downloads yet
          </div>

          <ul v-else class="space-y-1">
            <li
              v-for="task in downloads"
              :key="task.id"
              class="rounded-lg border border-border/50 bg-background/80 px-2.5 py-2"
            >
              <div class="flex items-start gap-2">
                <Loader2
                  v-if="task.status === 'downloading'"
                  class="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground"
                />
                <XCircle
                  v-else-if="task.status === 'failed' || task.status === 'cancelled'"
                  class="mt-0.5 size-3.5 shrink-0 text-destructive"
                />
                <Download
                  v-else
                  class="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <p class="min-w-0 truncate text-[11px] font-medium">{{ task.label }}</p>
                    <span class="shrink-0 text-[9px] capitalize text-muted-foreground">{{
                      task.status
                    }}</span>
                  </div>
                  <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full bg-foreground/70 transition-all duration-300"
                      :class="
                        !task.totalBytes && task.status === 'downloading'
                          ? 'w-1/3 animate-pulse'
                          : ''
                      "
                      :style="
                        task.totalBytes ? { width: progressPercent(task) + '%' } : undefined
                      "
                    />
                  </div>
                  <p class="mt-1 text-[9px] tabular-nums text-muted-foreground">
                    {{ formatBytes(task.receivedBytes)
                    }}<template v-if="task.totalBytes">
                      / {{ formatBytes(task.totalBytes) }}</template
                    >
                  </p>
                  <p v-if="task.error" class="mt-1 text-[10px] text-destructive">{{ task.error }}</p>
                </div>
                <button
                  v-if="task.status === 'downloading'"
                  type="button"
                  class="shrink-0 text-[10px] text-muted-foreground hover:text-destructive"
                  @click="cancelDownload(task.id)"
                >
                  Cancel
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
