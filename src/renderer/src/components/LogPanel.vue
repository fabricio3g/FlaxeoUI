<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Terminal, Trash2, RefreshCw } from '@/lib/icons'
import { useServerLogs } from '@/composables/useServerLogs'

const autoScroll = ref(true)
const isPolling = ref(true)
const logsContainer = ref<HTMLElement | null>(null)
const { logs, total, isStreaming, refreshLogs, startServerLogStream, stopServerLogStream, clearServerLogs } = useServerLogs()

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
  <div class="flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
      <div class="flex items-center gap-2">
        <Terminal class="w-4 h-4 text-muted-foreground" />
        <span class="text-sm font-medium">Server Logs</span>
        <span class="text-xs text-muted-foreground">({{ total }} entries)</span>
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
          :title="isPolling ? 'Pause realtime stream' : 'Resume realtime stream'"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isStreaming }" />
        </button>

        <!-- Clear logs -->
        <button
          @click="clearLogs"
          class="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Clear logs"
        >
          <Trash2 class="w-3.5 h-3.5" />
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
