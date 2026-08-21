<script setup lang="ts">
import { Download, Moon, Minus, Square, SlidersHorizontal, Sun, Terminal, X } from '@/lib/icons'
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
import IconButton from '@/components/ui/IconButton.vue'
import Button from '@/components/ui/Button.vue'

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
const queueBtnRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
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
  if (runtimeState.value === 'online') return 'bg-success'
  if (runtimeState.value === 'offline') return 'bg-warning'
  return 'bg-destructive'
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
  // Ref may be a component wrapper; resolve its root element
  const el = queueBtnRef.value
  const target = el instanceof HTMLElement ? el : ((el as { $el?: HTMLElement } | null)?.$el ?? null)
  emit('toggleQueue', rectFromEl(target))
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
        <IconButton
          shape="pill"
          :aria-label="runtimeLabel"
        >
          <span class="h-2.5 w-2.5 rounded-full" :class="statusDotClass"></span>
        </IconButton>

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
                :class="sdServerRunning ? 'text-success' : 'text-warning'"
                >{{ sdServerRunning ? 'Online' : 'Offline' }}</span
              >
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Backend</span>
              <span
                class="max-w-36 truncate font-medium"
                :class="backendValid ? 'text-foreground' : 'text-destructive'"
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
            class="mt-2.5 border-t border-border/70 pt-2.5 text-xs leading-relaxed text-muted-foreground"
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
      <Button
        variant="ghost"
        size="sm"
        class="h-7 rounded-md px-3"
        @click="showModelHub = true"
      >
        Model Hub
      </Button>
    </div>

    <!-- Drag region between left tools and right actions -->
    <div class="min-w-0 flex-1" aria-hidden="true" />

    <div class="flex h-full items-center gap-0.5 titlebar-no-drag">
      <!-- Queue -->
      <Tooltip text="Job queue — reorder, pause, or cancel runs" position="bottom">
        <Button
          ref="queueBtnRef"
          variant="ghost"
          size="sm"
          class="h-8 px-2"
          :class="props.queueOpen || queueBadge ? 'bg-accent/80 text-foreground' : ''"
          :aria-expanded="props.queueOpen"
          aria-label="Job queue"
          @click="handleToggleQueue"
        >
          <span>Queue</span>
          <span
            v-if="queueBadgeLabel"
            class="inline-flex min-w-4 items-center justify-center rounded-md bg-foreground px-1 text-xs font-medium tabular-nums text-background"
          >
            {{ queueBadgeLabel }}
          </span>
        </Button>
      </Tooltip>

      <Tooltip v-if="showMobileConfig" text="Model & settings" position="bottom">
        <IconButton
          class="mr-0.5 md:hidden"
          aria-label="Open mobile settings"
          @click="emit('toggleMobileConfig')"
        >
          <SlidersHorizontal class="h-4 w-4" />
        </IconButton>
      </Tooltip>

      <button
        v-if="props.setupNeeded"
        class="aui-status-badge mr-0.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-warning/10 px-2 text-xs font-medium text-warning transition-colors duration-150 hover:bg-warning/15 titlebar-no-drag md:hidden"
        type="button"
        title="Open setup wizard"
        @click="emit('openSetup')"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
        Setup
      </button>

      <button
        v-if="props.setupNeeded"
        class="aui-status-badge mr-0.5 hidden h-7 items-center gap-1.5 rounded-md bg-warning/10 px-2 text-xs font-medium text-warning transition-colors duration-150 hover:bg-warning/15 titlebar-no-drag md:inline-flex"
        type="button"
        @click="emit('openSetup')"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
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
        <IconButton
          class="mr-0.5 w-auto min-w-8 px-1.5"
          :aria-label="
            activeCount ? `Open download manager, ${activeCount} active` : 'Open download manager'
          "
          :class="showDownloadManager || activeCount ? 'bg-accent/80 text-foreground' : ''"
          :aria-expanded="showDownloadManager"
          @click="showDownloadManager = !showDownloadManager"
        >
          <Download class="h-4 w-4 shrink-0" />
          <span
            v-if="downloadBadgeLabel"
            class="inline-flex min-w-4 items-center justify-center rounded-md bg-foreground px-1 text-xs font-medium tabular-nums text-background"
          >
            {{ downloadBadgeLabel }}
          </span>
        </IconButton>
      </Tooltip>

      <Tooltip v-if="canControl" text="Terminal — server / generation logs" position="bottom">
        <IconButton class="mr-0.5" aria-label="Open server logs" @click="emit('toggleLogs')">
          <Terminal class="h-4 w-4" />
        </IconButton>
      </Tooltip>

      <Tooltip :text="isDark ? 'Switch to light theme' : 'Switch to dark theme'" position="bottom">
        <IconButton
          class="mr-0.5"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <Sun v-if="isDark" class="h-4 w-4" />
          <Moon v-else class="h-4 w-4" />
        </IconButton>
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
