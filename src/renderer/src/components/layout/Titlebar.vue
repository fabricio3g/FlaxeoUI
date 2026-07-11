<script setup lang="ts">
import {
  Download,
  Moon,
  Minus,
  Square,
  SlidersHorizontal,
  Sun,
  Terminal,
  Video,
  X
} from '@/lib/icons'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useRuntimeStatus } from '@/composables/useRuntimeStatus'
import { useTheme } from '@/composables/useTheme'
import DownloadManagerModal from '@/components/DownloadManagerModal.vue'
import ModelHubModal from '@/components/ModelHubModal.vue'

const props = defineProps<{
  currentTab: string
  setupNeeded?: boolean
  collapsed?: boolean
}>()

const emit = defineEmits<{
  toggleMobileConfig: []
  toggleLogs: []
  openSetup: []
  toggleSidebar: []
}>()

const isElectron = ref(false)
const showModelHub = ref(false)
const showDownloadManager = ref(false)
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const {
  sdServerRunning,
  backendVersion,
  backendValid,
  runtimeState,
  runtimeLabel,
  startRuntimeStatusPolling,
  stopRuntimeStatusPolling
} = useRuntimeStatus()
const { isDark, toggleTheme } = useTheme()

const statusDotClass = computed(() => {
  if (runtimeState.value === 'online') return 'bg-emerald-500'
  if (runtimeState.value === 'offline') return 'bg-amber-500'
  return 'bg-red-500'
})

const statusHint = computed(() => {
  if (config.value.backendMode === 'server' && backendValid.value && !sdServerRunning.value) {
    return 'Server mode is selected but sd-server is offline.'
  }
  if (!backendValid.value) return 'Backend binary is not valid.'
  return config.value.backendMode === 'server' ? 'Server mode active.' : 'CLI mode active.'
})

const showMobileConfig = computed(() => ['text2image', 'edit', 'video'].includes(props.currentTab))

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showDownloadManager.value) {
    showDownloadManager.value = false
  }
}

onMounted(() => {
  isElectron.value = !!window.electronAPI
  startRuntimeStatusPolling()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  stopRuntimeStatusPolling()
  window.removeEventListener('keydown', handleGlobalKeydown)
})

function handleMinimize(): void {
  window.electronAPI?.minimize()
}

function handleMaximize(): void {
  window.electronAPI?.maximize()
}

function handleClose(): void {
  window.electronAPI?.close()
}

function iconBtnClasses(active = false): string {
  return [
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
    'hover:bg-accent hover:text-accent-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    active ? 'bg-accent text-accent-foreground' : ''
  ].join(' ')
}
</script>

<template>
  <header
    class="relative z-50 flex h-10 shrink-0 select-none items-center justify-between bg-background titlebar-drag"
  >
    <div class="hidden h-full items-center gap-2 px-2 titlebar-no-drag md:flex">
      <div class="group relative flex h-8 items-center justify-center titlebar-no-drag">
        <button
          class="aui-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          type="button"
          :aria-label="runtimeLabel"
        >
          <span class="h-2.5 w-2.5 rounded-full" :class="statusDotClass"></span>
        </button>

        <div
          class="pointer-events-none absolute left-0 top-full z-[60] mt-2 w-64 -translate-y-1 rounded-xl border border-border/80 bg-popover p-3.5 text-xs text-popover-foreground opacity-0 shadow-xl shadow-black/10 transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:shadow-black/30"
        >
          <div class="mb-2.5 flex items-center gap-2 border-b border-border/70 pb-2.5">
            <span class="h-2 w-2 rounded-full" :class="statusDotClass"></span>
            <span class="font-medium">Runtime status</span>
          </div>
          <div class="space-y-1.5 text-muted-foreground">
            <div class="flex items-center justify-between gap-3">
              <span>Server</span>
              <span
                class="font-medium"
                :class="
                  sdServerRunning
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                "
                >{{ sdServerRunning ? 'Online' : 'Offline' }}</span
              >
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Backend</span>
              <span
                class="max-w-36 truncate font-medium"
                :class="backendValid ? 'text-foreground' : 'text-red-500'"
                :title="backendVersion"
                >{{ backendVersion }}</span
              >
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Mode</span>
              <span class="font-medium text-foreground">{{
                config.backendMode.toUpperCase()
              }}</span>
            </div>
          </div>
          <p
            class="mt-2.5 border-t border-border/70 pt-2.5 text-[11px] leading-4 text-muted-foreground"
          >
            {{ statusHint }}
          </p>
        </div>
      </div>
    </div>

    <div
      class="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 titlebar-no-drag md:flex"
    >
      <button
        class="inline-flex h-7 items-center justify-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        type="button"
        @click="showModelHub = true"
      >
        Model Hub
      </button>
    </div>

    <!-- Mobile: empty left drag region (no Flaxeo Image title) -->
    <div class="min-w-0 flex-1 md:hidden" aria-hidden="true" />

    <div class="flex h-full items-center titlebar-no-drag">
      <button
        v-if="showMobileConfig"
        @click="emit('toggleMobileConfig')"
        class="aui-icon-button mr-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
        type="button"
        title="Settings"
        aria-label="Open mobile settings"
      >
        <SlidersHorizontal class="h-4 w-4" />
      </button>

      <button
        v-if="props.setupNeeded"
        class="aui-status-badge mr-0.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 text-xs font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-500/15 dark:text-amber-400 titlebar-no-drag md:hidden"
        type="button"
        @click="emit('openSetup')"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
        Setup
      </button>

      <button
        @click="showDownloadManager = !showDownloadManager"
        class="aui-icon-button mr-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none md:hidden"
        type="button"
        title="Downloads"
        aria-label="Open download manager"
        :class="showDownloadManager ? 'bg-accent text-accent-foreground' : ''"
        :aria-expanded="showDownloadManager"
      >
        <Download class="h-4 w-4" />
      </button>

      <button
        @click="emit('toggleLogs')"
        class="aui-icon-button mr-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
        type="button"
        title="Server Logs"
        aria-label="Open server logs"
      >
        <Terminal class="h-4 w-4" />
      </button>

      <button
        v-if="props.setupNeeded"
        class="aui-status-badge mr-1 hidden h-7 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 text-xs font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-500/15 dark:text-amber-400 titlebar-no-drag md:inline-flex"
        type="button"
        @click="emit('openSetup')"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
        Setup
      </button>

      <Tooltip text="Downloads" position="bottom">
        <button
          @click="showDownloadManager = !showDownloadManager"
          class="aui-icon-button mr-0.5 hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none md:inline-flex"
          type="button"
          aria-label="Open download manager"
          :class="showDownloadManager ? 'bg-accent text-accent-foreground' : ''"
          :aria-expanded="showDownloadManager"
        >
          <Download class="h-4 w-4" />
        </button>
      </Tooltip>

      <Tooltip text="Server Logs" position="bottom">
        <button
          @click="emit('toggleLogs')"
          class="aui-icon-button mr-0.5 hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:inline-flex"
          type="button"
          aria-label="Open server logs"
        >
          <Terminal class="h-4 w-4" />
        </button>
      </Tooltip>

      <Tooltip :text="isDark ? 'Light mode' : 'Dark mode'" position="bottom">
        <button
          @click="toggleTheme"
          class="aui-icon-button mr-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          type="button"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <Sun v-if="isDark" class="h-4 w-4" />
          <Moon v-else class="h-4 w-4" />
        </button>
      </Tooltip>

      <template v-if="isElectron">
        <button
          @click="handleMinimize"
          class="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
          title="Minimize"
        >
          <Minus class="h-3.5 w-3.5" />
        </button>

        <button
          @click="handleMaximize"
          class="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
          title="Maximize"
        >
          <Square class="h-3 w-3" />
        </button>

        <button
          @click="handleClose"
          class="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
          title="Close"
        >
          <X class="h-4 w-4" />
        </button>
      </template>
    </div>
    <ModelHubModal :open="showModelHub" @close="showModelHub = false" />
    <DownloadManagerModal :open="showDownloadManager" @close="showDownloadManager = false" />
  </header>
</template>
