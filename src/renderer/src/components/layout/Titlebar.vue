<script setup lang="ts">
import {
  Download,
  Moon,
  Minus,
  Square,
  SlidersHorizontal,
  Sun,
  Terminal,
  X
} from '@/lib/icons'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useRuntimeStatus } from '@/composables/useRuntimeStatus'
import { useTheme } from '@/composables/useTheme'
import { useRemoteSession } from '@/composables/useRemoteSession'
import { useJobQueue } from '@/composables/useJobQueue'
import { useDownloads } from '@/composables/useDownloads'
import DownloadManagerModal from '@/components/DownloadManagerModal.vue'
import ModelHubModal from '@/components/ModelHubModal.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

export type PanelAnchor = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
}

const props = defineProps<{
  currentTab: string
  setupNeeded?: boolean
  collapsed?: boolean
  queueOpen?: boolean
}>()

const emit = defineEmits<{
  toggleMobileConfig: []
  toggleLogs: []
  openSetup: []
  toggleSidebar: []
  'update:backendMode': [value: string]
  toggleQueue: [anchor: PanelAnchor | null]
}>()

const isElectron = ref(false)
const showModelHub = ref(false)
const showDownloadManager = ref(false)
const queueBtnRef = ref<HTMLElement | null>(null)
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
const { canControl } = useRemoteSession()
const { pendingCount, current: currentJob } = useJobQueue()
const { activeCount, subscribeDownloads } = useDownloads()

const backendModeOptions = [
  { value: 'cli', label: 'CLI' },
  { value: 'server', label: 'Server' }
]

const queueBadge = computed(() => pendingCount.value + (currentJob.value ? 1 : 0))

const downloadBadgeLabel = computed(() => {
  const n = activeCount.value
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
})

const queueBadgeLabel = computed(() => {
  const n = queueBadge.value
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
})

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

function rectFromEl(el: HTMLElement | null): PanelAnchor | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width
  }
}

function handleToggleQueue(): void {
  emit('toggleQueue', rectFromEl(queueBtnRef.value))
}

function handleBackendMode(value: string): void {
  emit('update:backendMode', value)
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showDownloadManager.value) {
    showDownloadManager.value = false
  }
}

let unsubDownloads: (() => void) | null = null

onMounted(() => {
  isElectron.value = !!window.electronAPI
  startRuntimeStatusPolling()
  unsubDownloads = subscribeDownloads()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  stopRuntimeStatusPolling()
  unsubDownloads?.()
  unsubDownloads = null
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
</script>

<template>
  <header
    class="relative z-50 flex h-10 shrink-0 select-none items-center justify-between bg-background titlebar-drag"
  >
    <div class="flex h-full min-w-0 items-center gap-1.5 px-2 titlebar-no-drag">
      <div class="group relative hidden h-8 items-center justify-center titlebar-no-drag md:flex">
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

      <!-- Backend mode next to sidebar / status -->
      <SegmentedControl
        class="shrink-0"
        :model-value="config.backendMode"
        :options="backendModeOptions"
        size="sm"
        aria-label="Backend mode"
        @update:model-value="handleBackendMode"
      />
    </div>

    <div
      v-if="isElectron"
      class="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 titlebar-no-drag md:flex"
    >
      <button
        class="inline-flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        type="button"
        @click="showModelHub = true"
      >
        Model Hub
      </button>
    </div>

    <!-- Drag region between left tools and right actions -->
    <div class="min-w-0 flex-1" aria-hidden="true" />

    <div class="flex h-full items-center gap-0.5 titlebar-no-drag">
      <!-- Queue -->
      <Tooltip text="Job queue — reorder, pause, or cancel runs" position="bottom">
        <button
          ref="queueBtnRef"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          :class="props.queueOpen || queueBadge ? 'bg-accent/80 text-foreground' : ''"
          :aria-expanded="props.queueOpen"
          aria-label="Job queue"
          @click="handleToggleQueue"
        >
          <span>Queue</span>
          <span
            v-if="queueBadgeLabel"
            class="inline-flex min-w-4 items-center justify-center rounded-md bg-foreground px-1 text-[10px] font-medium tabular-nums text-background"
          >
            {{ queueBadgeLabel }}
          </span>
        </button>
      </Tooltip>

      <Tooltip v-if="showMobileConfig" text="Model & settings" position="bottom">
        <button
          @click="emit('toggleMobileConfig')"
          class="aui-icon-button mr-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
          type="button"
          aria-label="Open mobile settings"
        >
          <SlidersHorizontal class="h-4 w-4" />
        </button>
      </Tooltip>

      <button
        v-if="props.setupNeeded"
        class="aui-status-badge mr-0.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-500/10 px-2 text-xs font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-500/15 dark:text-amber-400 titlebar-no-drag md:hidden"
        type="button"
        title="Open setup wizard"
        @click="emit('openSetup')"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
        Setup
      </button>

      <button
        v-if="props.setupNeeded"
        class="aui-status-badge mr-0.5 hidden h-7 items-center gap-1.5 rounded-md bg-amber-500/10 px-2 text-xs font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-500/15 dark:text-amber-400 titlebar-no-drag md:inline-flex"
        type="button"
        @click="emit('openSetup')"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
        Setup
      </button>

      <!-- Downloads with active file count -->
      <Tooltip
        v-if="isElectron"
        :text="
          activeCount
            ? `Downloads — ${activeCount} file${activeCount === 1 ? '' : 's'} transferring`
            : 'Downloads — model & package downloads'
        "
        position="bottom"
      >
        <button
          @click="showDownloadManager = !showDownloadManager"
          class="aui-icon-button relative mr-0.5 inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
          type="button"
          :aria-label="
            activeCount
              ? `Open download manager, ${activeCount} active`
              : 'Open download manager'
          "
          :class="showDownloadManager || activeCount ? 'bg-accent/80 text-foreground' : ''"
          :aria-expanded="showDownloadManager"
        >
          <Download class="h-4 w-4 shrink-0" />
          <span
            v-if="downloadBadgeLabel"
            class="inline-flex min-w-4 items-center justify-center rounded-md bg-foreground px-1 text-[10px] font-medium tabular-nums text-background"
          >
            {{ downloadBadgeLabel }}
          </span>
        </button>
      </Tooltip>

      <Tooltip v-if="canControl" text="Terminal — server / generation logs" position="bottom">
        <button
          @click="emit('toggleLogs')"
          class="aui-icon-button mr-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          type="button"
          aria-label="Open server logs"
        >
          <Terminal class="h-4 w-4" />
        </button>
      </Tooltip>

      <Tooltip
        :text="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        position="bottom"
      >
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
