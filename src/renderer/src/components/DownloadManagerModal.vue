<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { Download, Trash2, X, XCircle } from '@/lib/icons'
import { useDownloads, type DownloadTask } from '@/composables/useDownloads'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const {
  downloads,
  activeDownloads,
  fetchDownloads,
  subscribeDownloads,
  cancelDownload,
  clearCompleted
} = useDownloads()

let unsubscribe: (() => void) | null = null

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

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) void fetchDownloads()
  }
)

onMounted(() => {
  unsubscribe = subscribeDownloads()
  if (props.open) void fetchDownloads()
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})
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

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="open"
        class="fixed right-3 top-12 z-[110] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/15 titlebar-no-drag dark:shadow-black/40"
        role="dialog"
        aria-label="Download manager"
        @pointerdown.stop
      >
        <div class="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
          <div class="flex items-center gap-2 min-w-0">
            <Download class="size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0">
              <p class="text-sm font-medium">Downloads</p>
              <p class="text-xs text-muted-foreground">
                <template v-if="activeDownloads.length">
                  {{ activeDownloads.length }} active
                </template>
                <template v-else>Model &amp; package transfers</template>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Clear completed"
              aria-label="Clear completed downloads"
              @click="clearCompleted"
            >
              <Trash2 class="size-3.5" />
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close downloads"
              @click="emit('close')"
            >
              <X class="size-3.5" />
            </button>
          </div>
        </div>

        <div class="max-h-[min(22rem,50vh)] overflow-y-auto p-2">
          <p v-if="!downloads.length" class="px-2 py-6 text-center text-xs text-muted-foreground">
            No downloads yet. Use Model Hub or Settings → Backend.
          </p>

          <ul v-else class="space-y-1.5">
            <li
              v-for="task in downloads"
              :key="task.id"
              class="rounded-lg border border-border/60 bg-background/50 px-2.5 py-2"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium text-foreground" :title="task.label">
                    {{ task.label }}
                  </p>
                  <p
                    class="mt-0.5 truncate text-xs text-muted-foreground"
                    :title="task.targetPath"
                  >
                    {{ task.targetPath }}
                  </p>
                </div>
                <button
                  v-if="task.status === 'downloading'"
                  type="button"
                  class="aui-icon-button inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Cancel download"
                  @click="cancelDownload(task.id)"
                >
                  <XCircle class="size-3.5" />
                </button>
              </div>

              <div v-if="task.status === 'downloading'" class="mt-1.5">
                <div class="h-1 overflow-hidden rounded-sm bg-muted">
                  <div
                    class="h-full rounded-sm bg-foreground/70 transition-all duration-300"
                    :style="{ width: `${progressPercent(task)}%` }"
                  />
                </div>
                <p class="mt-1 text-xs tabular-nums text-muted-foreground">
                  {{ formatBytes(task.receivedBytes)
                  }}<template v-if="task.totalBytes">
                    / {{ formatBytes(task.totalBytes) }}</template
                  >
                </p>
              </div>

              <p
                v-else
                class="mt-1 text-xs font-medium"
                :class="{
                  'text-emerald-600 dark:text-emerald-400': task.status === 'completed',
                  'text-destructive': task.status === 'failed',
                  'text-muted-foreground': task.status === 'cancelled'
                }"
              >
                {{
                  task.status === 'completed'
                    ? 'Completed'
                    : task.status === 'failed'
                      ? task.error || 'Failed'
                      : 'Cancelled'
                }}
              </p>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
