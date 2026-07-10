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
const { logs, total, isStreaming, refreshLogs, startServerLogStream, stopServerLogStream, clearServerLogs } = useServerLogs()

const panelRef = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)

const { x, y, style } = useDraggable(panelRef, {
  initialValue: { x: 200, y: 80 },
  handle: dragHandleRef,
  preventDefault: true,
  stopPropagation: true,
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
  <div
    v-if="modelValue"
    ref="panelRef"
    :style="style"
    class="fixed z-[10001] flex h-[400px] w-[600px] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
  >
    <!-- Drag Handle / Title Bar -->
    <div
      ref="dragHandleRef"
      class="flex cursor-move select-none items-center justify-between border-b border-border px-3 py-2"
    >
      <div class="flex items-center gap-2">
        <GripHorizontal class="h-4 w-4 text-muted-foreground" />
        <Terminal class="h-4 w-4 text-muted-foreground" />
        <span class="text-sm font-medium">Server Logs</span>
        <span class="text-xs text-muted-foreground">({{ total }} entries)</span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Auto-scroll toggle -->
        <label class="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            v-model="autoScroll"
            class="size-3 rounded border-border bg-background text-foreground focus:ring-1 focus:ring-ring/40"
          />
          Auto-scroll
        </label>

        <!-- Polling toggle -->
        <button
          type="button"
          @click="togglePolling"
          class="inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          :class="
            isPolling
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          "
          :title="isPolling ? 'Pause realtime stream' : 'Resume realtime stream'"
          aria-label="Toggle log streaming"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isStreaming }" />
        </button>

        <!-- Clear logs -->
        <button
          type="button"
          @click="clearLogs"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          title="Clear logs"
          aria-label="Clear logs"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>

        <!-- Close -->
        <button
          type="button"
          @click="close"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          title="Close"
          aria-label="Close"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Logs content -->
    <div
      ref="logsContainer"
      class="flex-1 select-text overflow-auto bg-foreground/95 p-2 font-mono text-xs text-emerald-300 dark:text-emerald-300"
    >
      <div v-if="logs.length === 0" class="italic text-muted-foreground">
        No logs yet. Start a generation to see output.
      </div>

      <div
        v-for="(log, index) in logs"
        :key="index"
        class="whitespace-pre-wrap break-all leading-relaxed hover:bg-background/10"
        :class="{
          'text-red-400': log.includes('error') || log.includes('ERROR') || log.includes('[ERR]'),
          'text-yellow-300': log.includes('warning') || log.includes('WARN'),
          'text-blue-300': log.includes('EXIT:'),
          'text-cyan-300': log.includes('[SD]') || log.includes('[CLI]')
        }"
      >
        {{ log }}
      </div>
    </div>
  </div>
</template>
