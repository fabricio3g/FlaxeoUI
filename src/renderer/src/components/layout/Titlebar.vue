<script setup lang="ts">
import { Download, Moon, Minus, PanelLeft, Square, Sun, Terminal, X } from '@/lib/icons'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useConnection } from '@/composables/useConnection'
import { useTheme } from '@/composables/useTheme'
import { useRemoteSession } from '@/composables/useRemoteSession'
import { useJobQueue } from '@/composables/useJobQueue'
import { useDownloads } from '@/composables/useDownloads'
import DownloadManagerModal from '@/components/DownloadManagerModal.vue'
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
  setupNeeded?: boolean
  queueOpen?: boolean
  sidebarCollapsed?: boolean
}>()

const emit = defineEmits<{
  expandSidebar: []
  /** Phone width: open the sidebar as a drawer */
  openDrawer: []
  /** Pointer over the expand button: show (true) or hide (false) the sidebar preview */
  peek: [show: boolean]
  toggleLogs: []
  openSetup: []
  openEngine: []
  toggleQueue: [anchor: PanelAnchor | null]
}>()

const isElectron = ref(false)
const showDownloadManager = ref(false)
const queueBtnRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const connection = useConnection()
const { isDark, toggleTheme } = useTheme()
const { canControl } = useRemoteSession()
const { pendingCount, current: currentJob } = useJobQueue()
const { activeCount, subscribeDownloads } = useDownloads()

const queueBadge = computed(() => pendingCount.value + (currentJob.value ? 1 : 0))
const badge = (n: number): string => (n <= 0 ? '' : n > 99 ? '99+' : String(n))

/** One status: is the local service reachable, and is an sd.cpp engine installed? */
const status = computed(() => {
  const app = connection.appState.value
  if (app === 'connecting') return { tone: 'muted', action: false }
  if (app !== 'connected') return { tone: 'bad', action: false }
  if (connection.engineState.value === 'missing') return { tone: 'warn', action: canControl.value }
  return { tone: 'ok', action: false }
})

const statusText = computed(() =>
  status.value.action ? 'Install sd.cpp engine' : connection.summary.value
)

const dotClass = computed(
  () =>
    ({
      ok: 'bg-success',
      warn: 'bg-warning',
      bad: 'bg-destructive',
      muted: 'bg-muted-foreground/50'
    })[status.value.tone]
)

function handleToggleQueue(): void {
  const el = queueBtnRef.value
  const target =
    el instanceof HTMLElement ? el : ((el as { $el?: HTMLElement } | null)?.$el ?? null)
  const r = target?.getBoundingClientRect()
  emit(
    'toggleQueue',
    r ? { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width } : null
  )
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showDownloadManager.value) {
    showDownloadManager.value = false
  }
}

let unsubDownloads: (() => void) | null = null

onMounted(() => {
  isElectron.value = !!window.electronAPI
  connection.start()
  unsubDownloads = subscribeDownloads()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  connection.stop()
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
    class="relative z-30 flex h-12 shrink-0 select-none items-center gap-2 pl-2 titlebar-drag"
  >
    <button
      type="button"
      class="aui-icon-button inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground titlebar-no-drag md:hidden"
      aria-label="Open menu"
      @click="emit('openDrawer')"
    >
      <PanelLeft class="size-4" />
    </button>
    <span
      v-if="sidebarCollapsed"
      class="hidden titlebar-no-drag md:inline-flex"
      @pointerenter="emit('peek', true)"
      @pointerleave="emit('peek', false)"
    >
      <button
        type="button"
        class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground titlebar-no-drag"
        aria-label="Show sidebar"
        v-tip="{ text: 'Show sidebar', keys: 'Mod+\\' }"
        @click="emit('expandSidebar')"
      >
        <PanelLeft class="size-4" />
      </button>
    </span>

    <!-- Pages put their title and actions here (Teleport to #page-header) -->
    <div id="page-header" class="flex min-w-0 flex-1 items-center gap-1 pl-1"></div>

    <component
      :is="status.action ? 'button' : 'span'"
      type="button"
      class="inline-flex h-7 min-w-0 shrink-0 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground titlebar-no-drag"
      :class="status.action && 'text-foreground hover:bg-accent'"
      :title="connection.summary.value"
      role="status"
      @click="status.action && emit('openEngine')"
    >
      <span class="size-2 shrink-0 rounded-full" :class="dotClass" aria-hidden="true" />
      <span class="hidden truncate lg:inline">{{ statusText }}</span>
    </component>

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
            v-if="badge(queueBadge)"
            class="inline-flex min-w-4 items-center justify-center rounded-md bg-foreground px-1 text-xs font-medium tabular-nums text-background"
          >
            {{ badge(queueBadge) }}
          </span>
        </Button>
      </Tooltip>

      <button
        v-if="props.setupNeeded"
        class="mr-1 inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-warning hover:bg-accent titlebar-no-drag"
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
            v-if="badge(activeCount)"
            class="inline-flex min-w-4 items-center justify-center rounded-md bg-foreground px-1 text-xs font-medium tabular-nums text-background"
          >
            {{ badge(activeCount) }}
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
          v-tip="'Minimize'"
        >
          <Minus class="h-3.5 w-3.5" />
        </button>

        <button
          @click="handleMaximize"
          class="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
          v-tip="'Maximize'"
        >
          <Square class="h-3 w-3" />
        </button>

        <button
          @click="handleClose"
          class="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
          v-tip="'Close'"
        >
          <X class="h-4 w-4" />
        </button>
      </template>
    </div>
    <DownloadManagerModal :open="showDownloadManager" @close="showDownloadManager = false" />
  </header>
</template>
