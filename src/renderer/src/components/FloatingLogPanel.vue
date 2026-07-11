<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useDraggable } from '@vueuse/core'
import { Terminal, Trash2, RefreshCw, GripHorizontal, X } from '@/lib/icons'
import { useServerLogs } from '@/composables/useServerLogs'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const autoScroll = ref(true)
const isPolling = ref(true)
const logsContainer = ref<HTMLElement | null>(null)
const {
  logs,
  total,
  isStreaming,
  refreshLogs,
  startServerLogStream,
  stopServerLogStream,
  clearServerLogs
} = useServerLogs()

const panelRef = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)

const { x, y, style } = useDraggable(panelRef, {
  initialValue: { x: 200, y: 80 },
  handle: dragHandleRef,
  preventDefault: true,
  stopPropagation: true
})

/**
 * fetchLogs() - Fetch latest logs from server
 */
async function fetchLogs(): Promise<void> {
  try {
    await refreshLogs()

    if (autoScroll.value) {
      await nextTick()
      scrollToBottom()
    }
  } catch (e) {
    console.error('Failed to fetch logs:', e)
  }
}

/**
 * clearLogs() - Clear all logs on server
 */
async function clearLogs(): Promise<void> {
  try {
    await clearServerLogs()
  } catch (e) {
    console.error('Failed to clear logs:', e)
  }
}

/**
 * scrollToBottom() - Auto-scroll to latest log entry
 */
function scrollToBottom(): void {
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight
  }
}

/**
 * togglePolling() - Toggle auto-refresh
 */
function togglePolling(): void {
  isPolling.value = !isPolling.value
  if (isPolling.value) {
    startPolling()
  } else {
    stopPolling()
  }
}

function startPolling(): void {
  startServerLogStream().then(() => {
    if (autoScroll.value) {
      nextTick(scrollToBottom)
    }
  })
}

function stopPolling(): void {
  stopServerLogStream()
}

function close(): void {
  emit('update:modelValue', false)
}

onMounted(() => {
  fetchLogs()
  startPolling()
})

watch(
  () => logs.value.length,
  async () => {
    if (!autoScroll.value) return
    await nextTick()
    scrollToBottom()
  }
)

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <Transition name="floating-log">
    <div
      v-if="modelValue"
      ref="panelRef"
      :style="style"
      class="aui-dialog-surface fixed z-[10001] flex h-[min(400px,calc(100vh-1.5rem))] w-[600px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/15 dark:shadow-black/40"
    >
      <!-- Drag Handle / Title Bar — fade instead of border under title -->
      <div
        ref="dragHandleRef"
        class="aui-scroll-header aui-scroll-header--popover aui-scroll-header--compact flex min-h-11 cursor-move select-none items-center justify-between gap-3 bg-popover px-3"
      >
        <div class="flex min-w-0 items-center gap-2">
          <GripHorizontal class="h-4 w-4 shrink-0 text-muted-foreground/70" />
          <Terminal class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="truncate text-xs font-semibold">Server Logs</span>
          <span class="hidden text-[10px] text-muted-foreground sm:inline"
            >{{ total }} entries</span
          >
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <!-- Auto-scroll toggle -->
          <label
            class="mr-1 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <input
              v-model="autoScroll"
              type="checkbox"
              class="size-3 rounded border-border bg-background text-foreground focus:ring-1 focus:ring-ring/40"
            />
            <span class="hidden sm:inline">Auto-scroll</span>
          </label>

          <!-- Polling toggle -->
          <button
            type="button"
            class="aui-status-badge inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-[10px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            :class="
              isPolling
                ? 'border-border bg-background text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
            "
            :title="isPolling ? 'Pause realtime stream' : 'Resume realtime stream'"
            aria-label="Toggle log streaming"
            @click="togglePolling"
          >
            <RefreshCw class="h-3 w-3" :class="{ 'animate-spin': isStreaming }" />
            <span class="hidden sm:inline">{{ isPolling ? 'Live' : 'Paused' }}</span>
          </button>

          <!-- Clear logs -->
          <button
            type="button"
            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-destructive/5 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Clear logs"
            aria-label="Clear logs"
            @click="clearLogs"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>

          <!-- Close -->
          <button
            type="button"
            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Close"
            aria-label="Close"
            @click="close"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="aui-scroll-header__fade" aria-hidden="true" />
      </div>

      <!-- Logs content -->
      <div
        ref="logsContainer"
        role="log"
        aria-live="polite"
        class="flex-1 select-text overflow-auto bg-muted/20 p-2 font-mono text-[11px] text-foreground/75"
      >
        <div
          v-if="logs.length === 0"
          class="flex h-full items-center justify-center px-4 text-center font-sans text-xs text-muted-foreground"
        >
          No logs yet. Start a generation to see output.
        </div>

        <div
          v-for="(log, index) in logs"
          :key="index"
          class="border-l-2 border-transparent px-2 py-0.5 whitespace-pre-wrap break-all leading-relaxed transition-colors duration-150 hover:bg-muted/60"
          :class="{
            'border-l-destructive/50 text-destructive':
              log.includes('error') || log.includes('ERROR') || log.includes('[ERR]'),
            'border-l-amber-500/50 text-amber-700 dark:text-amber-300':
              log.includes('warning') || log.includes('WARN'),
            'text-blue-700 dark:text-blue-300': log.includes('EXIT:'),
            'text-cyan-700 dark:text-cyan-300': log.includes('[SD]') || log.includes('[CLI]')
          }"
        >
          {{ log }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.floating-log-enter-active,
.floating-log-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.floating-log-enter-from,
.floating-log-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>
