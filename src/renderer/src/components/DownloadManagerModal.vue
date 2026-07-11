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
    <Transition name="aui-downloads">
      <div
        v-if="open"
        class="aui-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm titlebar-no-drag sm:p-5"
      >
        <div
          class="aui-dialog-surface downloads-surface flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-foreground/10 md:max-h-[86vh]"
        >
          <header
            class="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-4 sm:px-6"
          >
            <div class="flex min-w-0 items-center gap-3">
              <div
                class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/30 text-muted-foreground"
              >
                <Download class="h-4 w-4" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="truncate text-sm font-semibold tracking-tight">Download Manager</h2>
                  <span
                    v-if="activeDownloads.length"
                    class="aui-status-badge inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    <span class="size-1.5 rounded-full bg-foreground/70"></span>
                    {{ activeDownloads.length }} active
                  </span>
                </div>
                <p class="mt-0.5 text-[11px] text-muted-foreground">
                  {{ downloads.length }} {{ downloads.length === 1 ? 'transfer' : 'transfers' }}
                </p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                class="inline-flex h-8 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                :disabled="downloads.length === 0"
                @click="clearCompleted"
              >
                <Trash2 class="h-3.5 w-3.5" />
                <span class="hidden sm:inline">Clear finished</span>
              </button>
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                @click="emit('close')"
                aria-label="Close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </header>

          <div class="flex-1 overflow-y-auto p-3 sm:p-5">
            <div
              v-if="downloads.length === 0"
              class="rounded-xl border border-dashed border-border bg-muted/10 px-6 py-10 text-center text-sm text-muted-foreground"
            >
              <div
                class="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-sm"
              >
                <Download class="h-5 w-5" />
              </div>
              <p class="font-medium text-foreground">No downloads yet</p>
              <p class="mt-1 text-xs text-muted-foreground">
                Start a model or backend download to track it here.
              </p>
            </div>

            <div
              v-else
              class="overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm"
            >
              <article
                v-for="task in downloads"
                :key="task.id"
                class="border-b border-border/70 p-4 last:border-b-0 sm:px-5"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center gap-2">
                      <Loader2
                        v-if="task.status === 'downloading'"
                        class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                      />
                      <XCircle
                        v-else-if="task.status === 'failed' || task.status === 'cancelled'"
                        class="h-3.5 w-3.5 shrink-0 text-destructive"
                      />
                      <Download
                        v-else
                        class="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      />
                      <h3 class="truncate text-sm font-medium">{{ task.label }}</h3>
                      <span
                        class="aui-status-badge shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize"
                        :class="{
                          'border-border bg-muted/50 text-foreground':
                            task.status === 'downloading',
                          'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400':
                            task.status === 'completed',
                          'border-destructive/20 bg-destructive/5 text-destructive':
                            task.status === 'failed' || task.status === 'cancelled'
                        }"
                      >
                        {{ task.status }}
                      </span>
                    </div>
                    <p
                      class="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                      :title="task.targetPath"
                    >
                      {{ task.targetPath }}
                    </p>
                  </div>

                  <button
                    v-if="task.status === 'downloading'"
                    type="button"
                    class="inline-flex h-7 shrink-0 items-center justify-center rounded-lg border border-input bg-background px-2.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    @click="cancelDownload(task.id)"
                  >
                    Cancel
                  </button>
                </div>

                <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-foreground/75 transition-all duration-300"
                    :class="
                      !task.totalBytes && task.status === 'downloading' ? 'w-1/3 animate-pulse' : ''
                    "
                    :style="task.totalBytes ? { width: progressPercent(task) + '%' } : undefined"
                  ></div>
                </div>

                <div
                  class="mt-2 flex items-center justify-between gap-3 text-[10px] font-medium text-muted-foreground"
                >
                  <span>
                    {{ formatBytes(task.receivedBytes)
                    }}<template v-if="task.totalBytes">
                      / {{ formatBytes(task.totalBytes) }}</template
                    >
                  </span>
                  <span v-if="task.totalBytes">{{ progressPercent(task).toFixed(0) }}%</span>
                  <span v-else>Size unknown</span>
                </div>

                <p
                  v-if="task.error"
                  class="aui-alert mt-3 rounded-lg border border-destructive/20 border-l-2 border-l-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive"
                >
                  {{ task.error }}
                </p>
              </article>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.aui-downloads-enter-active,
.aui-downloads-leave-active,
.aui-downloads-enter-active .downloads-surface,
.aui-downloads-leave-active .downloads-surface {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.aui-downloads-enter-from,
.aui-downloads-leave-to {
  opacity: 0;
}

.aui-downloads-enter-from .downloads-surface,
.aui-downloads-leave-to .downloads-surface {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>
