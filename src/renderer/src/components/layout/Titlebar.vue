<script setup lang="ts">
import type { Component } from 'vue'
import {
  Brush,
  Database,
  Download,
  Film,
  FolderOpen,
  ImageIcon,
  Images,
  Moon,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Settings,
  Square,
  Sun,
  Terminal,
  Video,
  X
} from 'lucide-vue-next'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useRuntimeStatus } from '@/composables/useRuntimeStatus'
import DownloadManagerModal from '@/components/DownloadManagerModal.vue'
import ModelHubModal from '@/components/ModelHubModal.vue'
import Tooltip from '../ui/Tooltip.vue'

interface NavItem {
  id: string
  label: string
  icon: Component
}

const props = defineProps<{
  currentTab: string
  sidebarCollapsed: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
  toggleMobileConfig: []
  toggleLogs: []
}>()

const router = useRouter()
const route = useRoute()

const routeMap: Record<string, string> = {
  text2image: '/text2image',
  edit: '/edit',
  video: '/video',
  gallery: '/gallery',
  settings: '/settings',
  quantization: '/quantization'
}

const navItems: NavItem[] = [
  { id: 'text2image', label: 'Text2Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'quantization', label: 'Quantize', icon: Scale }
]

const isElectron = ref(false)
const isDark = ref(false)
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

const statusDotClass = computed(() => {
  if (runtimeState.value === 'online') return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.68)]'
  if (runtimeState.value === 'offline')
    return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.45)]'
  return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.52)]'
})

const statusHint = computed(() => {
  if (config.value.backendMode === 'server' && backendValid.value && !sdServerRunning.value) {
    return 'Server mode is selected but sd-server is offline.'
  }
  if (!backendValid.value) return 'Backend binary is not valid.'
  return config.value.backendMode === 'server' ? 'Server mode active.' : 'CLI mode active.'
})

function applyTheme(dark: boolean): void {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('flaxeo-theme', dark ? 'dark' : 'light')
}

onMounted(() => {
  isElectron.value = !!window.electronAPI
  applyTheme(localStorage.getItem('flaxeo-theme') !== 'light')
  startRuntimeStatusPolling()
})

onUnmounted(() => {
  stopRuntimeStatusPolling()
})

function toggleTheme(): void {
  applyTheme(!isDark.value)
}

function toggleVideoMode(): void {
  configStore.updateConfig({ videoMode: !config.value.videoMode })
}

function isActive(id: string): boolean {
  return props.currentTab === id
}

function handleNavClick(id: string): void {
  router.push(routeMap[id] || '/' + id)
}

function openModelsFolder(): void {
  window.electronAPI?.openModelsFolder()
}

function openGalleryFolder(): void {
  window.electronAPI?.openGalleryFolder()
}

/**
 * handleMinimize() - Minimizes the electron window
 * Calls the electronAPI exposed via preload script
 */
function handleMinimize(): void {
  window.electronAPI?.minimize()
}

/**
 * handleMaximize() - Toggles maximize/restore window state
 */
function handleMaximize(): void {
  window.electronAPI?.maximize()
}

/**
 * handleClose() - Closes the electron window
 */
function handleClose(): void {
  window.electronAPI?.close()
}
</script>

<template>
  <header
    class="titlebar-shell relative z-[10000] h-8 flex items-center justify-between select-none titlebar-drag titlebar-border"
  >
    <nav class="titlebar-shell h-full hidden md:flex items-center gap-0 px-3 titlebar-no-drag">
      <button
        @click="emit('toggleSidebar')"
        class="h-7 w-7 shrink-0 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
        :aria-label="props.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        type="button"
      >
        <PanelLeftOpen v-if="props.sidebarCollapsed" class="w-4 h-4" />
        <PanelLeftClose v-else class="w-4 h-4" />
      </button>

      <div class="mx-1 h-4 w-px bg-border/80"></div>

      <Tooltip v-for="item in navItems" :key="item.id" :text="item.label">
        <button
          @click="handleNavClick(item.id)"
          class="h-7 w-7 metal-icon-button flex items-center justify-center titlebar-no-drag"
          :class="[
            isActive(item.id)
              ? 'primary-metal-button'
              : 'text-muted-foreground hover:text-foreground'
          ]"
          type="button"
        >
          <component :is="item.icon" class="w-4 h-4" />
        </button>
      </Tooltip>

      <div
        class="runtime-status-dot-wrap group relative flex h-7 items-center justify-center titlebar-no-drag"
      >
        <button
          class="runtime-status-dot-button flex h-7 w-7 items-center justify-center"
          type="button"
          :aria-label="runtimeLabel"
        >
          <span class="h-2.5 w-2.5 rounded-full" :class="statusDotClass"></span>
        </button>

        <div
          class="runtime-status-popover pointer-events-none absolute left-0 top-full z-[10001] mt-2 w-64 opacity-0 translate-y-1 transition-all duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0"
        >
          <div class="rounded-lg border border-border bg-card p-3 text-xs shadow-xl">
            <div class="mb-2 flex items-center gap-2 border-b border-border/70 pb-2">
              <span class="h-2 w-2 rounded-full" :class="statusDotClass"></span>
              <span class="font-semibold text-foreground">Runtime status</span>
            </div>
            <div class="space-y-1.5 text-muted-foreground">
              <div class="flex items-center justify-between gap-3">
                <span>Server</span>
                <span
                  class="font-medium"
                  :class="sdServerRunning ? 'text-green-600' : 'text-yellow-600'"
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
              class="mt-2 border-t border-border/70 pt-2 text-[11px] leading-4 text-muted-foreground"
            >
              {{ statusHint }}
            </p>
          </div>
        </div>
      </div>

      <div class="mx-1 h-4 w-px bg-border/80"></div>

      <Tooltip text="Open Models Folder">
        <button
          @click="openModelsFolder"
          class="h-7 w-7 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <Database class="w-4 h-4" />
        </button>
      </Tooltip>

      <button
        @click="showModelHub = true"
        class="h-7 rounded px-2 text-xs font-medium metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
        type="button"
      >
        Model Hub
      </button>

      <Tooltip text="Open Gallery Folder">
        <button
          @click="openGalleryFolder"
          class="h-7 w-7 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <FolderOpen class="w-4 h-4" />
        </button>
      </Tooltip>

      <div class="mx-1 h-4 w-px bg-border/80"></div>

      <Tooltip :text="config.videoMode ? 'Disable Video Mode' : 'Enable Video Mode'">
        <button
          @click.stop="toggleVideoMode"
          class="h-7 w-7 metal-icon-button flex items-center justify-center titlebar-no-drag"
          :class="
            config.videoMode
              ? 'primary-metal-button'
              : 'text-muted-foreground hover:text-foreground'
          "
          type="button"
        >
          <Film class="w-4 h-4" />
        </button>
      </Tooltip>

      <Tooltip text="Server Logs">
        <button
          @click="emit('toggleLogs')"
          class="h-7 w-7 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <Terminal class="w-4 h-4" />
        </button>
      </Tooltip>
    </nav>

    <div class="flex min-w-0 flex-1 items-center px-3 md:hidden">
      <span class="truncate text-sm font-semibold tracking-tight">Flaxeo</span>
    </div>

    <!-- Window Controls -->
    <div class="flex items-center h-full titlebar-no-drag">
      <!-- Mobile config toggle (shown on small screens only) -->
      <button
        @click="emit('toggleMobileConfig')"
        class="h-7 w-7 mr-1 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag md:hidden"
        type="button"
        title="Settings"
        aria-label="Open mobile settings"
      >
        <PanelLeftClose class="w-4 h-4" />
      </button>

      <button
        @click="showDownloadManager = true"
        class="h-7 w-7 mr-1 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag md:hidden"
        type="button"
        title="Downloads"
        aria-label="Open download manager"
      >
        <Download class="w-4 h-4" />
      </button>

      <Tooltip text="Downloads">
        <button
          @click="showDownloadManager = true"
          class="hidden h-7 w-7 mr-1 metal-icon-button md:flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <Download class="w-4 h-4" />
        </button>
      </Tooltip>

      <Tooltip :text="isDark ? 'Light mode' : 'Dark mode'">
        <button
          @click="toggleTheme"
          class="h-7 w-7 mr-1 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <Sun v-if="isDark" class="w-4 h-4" />
          <Moon v-else class="w-4 h-4" />
        </button>
      </Tooltip>

      <template v-if="isElectron">
        <button
          @click="handleMinimize"
          class="h-full w-[46px] flex items-center justify-center hover:bg-muted/60 transition-colors"
          title="Minimize"
        >
          <Minus class="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        <button
          @click="handleMaximize"
          class="h-full w-[46px] flex items-center justify-center hover:bg-muted/60 transition-colors"
          title="Maximize"
        >
          <Square class="w-3 h-3 text-muted-foreground" />
        </button>

        <button
          @click="handleClose"
          class="h-full w-[46px] flex items-center justify-center hover:bg-destructive/90 hover:text-white transition-colors"
          title="Close"
        >
          <X class="w-4 h-4" />
        </button>
      </template>
    </div>
    <ModelHubModal :open="showModelHub" @close="showModelHub = false" />
    <DownloadManagerModal :open="showDownloadManager" @close="showDownloadManager = false" />
  </header>
</template>
