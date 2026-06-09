<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useDraggable } from '@vueuse/core'
import { apiGet, apiPost } from '@/services/api'
import { Terminal, Trash2, RefreshCw, GripHorizontal, X } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const logs = ref<string[]>([])
const isLoading = ref(false)
const autoScroll = ref(true)
const isPolling = ref(true)
const logsContainer = ref<HTMLElement | null>(null)

const panelRef = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)

const { x, y, style } = useDraggable(panelRef, {
  initialValue: { x: 200, y: 80 },
  handle: dragHandleRef,
  preventDefault: true,
  stopPropagation: true,
})

let pollInterval: ReturnType<typeof setInterval> | null = null

/**
 * fetchLogs() - Fetch latest logs from server
 */
async function fetchLogs(): Promise<void> {
  try {
    const result = await apiGet<{ logs: string[]; total: number }>('/api/logs')
    logs.value = result.logs

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
    await apiPost('/api/logs/clear', {})
    logs.value = []
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
  if (pollInterval) return
  pollInterval = setInterval(fetchLogs, 1000)
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

function close(): void {
  emit('update:modelValue', false)
}

onMounted(() => {
  fetchLogs()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    :style="style"
    class="fixed z-[10001] w-[600px] h-[400px] metal-surface rounded-xl flex flex-col overflow-hidden shadow-2xl"
  >
    <!-- Drag Handle / Title Bar -->
    <div
      ref="dragHandleRef"
      class="flex items-center justify-between px-3 py-2 border-b border-border/60 cursor-move select-none"
    >
      <div class="flex items-center gap-2">
        <GripHorizontal class="w-4 h-4 text-muted-foreground" />
        <Terminal class="w-4 h-4 text-muted-foreground" />
        <span class="text-sm font-medium">Server Logs</span>
        <span class="text-xs text-muted-foreground">({{ logs.length }} entries)</span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Auto-scroll toggle -->
        <label class="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" v-model="autoScroll" class="w-3 h-3 rounded border-border" />
          Auto-scroll
        </label>

        <!-- Polling toggle -->
        <button
          @click="togglePolling"
          :class="[
            'p-1.5 rounded-md transition-colors',
            isPolling
              ? 'text-green-500 bg-green-500/10'
              : 'text-muted-foreground hover:text-foreground'
          ]"
          :title="isPolling ? 'Pause auto-refresh' : 'Resume auto-refresh'"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isPolling }" />
        </button>

        <!-- Clear logs -->
        <button
          @click="clearLogs"
          class="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Clear logs"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>

        <!-- Close -->
        <button
          @click="close"
          class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Close"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Logs content -->
    <div
      ref="logsContainer"
      class="flex-1 overflow-auto font-mono text-xs p-2 bg-black/90 text-green-400 select-text"
    >
      <div v-if="logs.length === 0" class="text-muted-foreground italic">
        No logs yet. Start a generation to see output.
      </div>

      <div
        v-for="(log, index) in logs"
        :key="index"
        class="whitespace-pre-wrap break-all leading-relaxed hover:bg-white/5"
        :class="{
          'text-red-400': log.includes('error') || log.includes('ERROR') || log.includes('[ERR]'),
          'text-yellow-400': log.includes('warning') || log.includes('WARN'),
          'text-blue-400': log.includes('EXIT:'),
          'text-cyan-400': log.includes('[SD]') || log.includes('[CLI]')
        }"
      >
        {{ log }}
      </div>
    </div>
  </div>
</template>
