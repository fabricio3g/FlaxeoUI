<script setup lang="ts">
import type { Component } from 'vue'
import {
  Brush,
  Database,
  Film,
  FolderOpen,
  ImageIcon,
  Images,
  Moon,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Square,
  Sun,
  Video,
  X
} from 'lucide-vue-next'
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
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
}>()

const router = useRouter()
const route = useRoute()

const routeMap: Record<string, string> = {
  text2image: '/text2image',
  edit: '/edit',
  video: '/video',
  gallery: '/gallery',
  settings: '/settings'
}

const navItems: NavItem[] = [
  { id: 'text2image', label: 'Text2Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'settings', label: 'Settings', icon: Settings }
]

const isElectron = ref(false)
const isDark = ref(false)
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

function applyTheme(dark: boolean): void {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('flaxeo-theme', dark ? 'dark' : 'light')
}

onMounted(() => {
  isElectron.value = !!window.electronAPI
  applyTheme(localStorage.getItem('flaxeo-theme') === 'dark')
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
  router.push(routeMap[id] || ('/' + id))
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
    class="h-11 flex items-center justify-between bg-card/90 select-none backdrop-blur-xl rounded-tl-lg titlebar-drag"
  >
    <nav
      class="h-full w-80 hidden md:flex items-center gap-1 bg-card/95 px-3 titlebar-no-drag"
    >
      <button
        @click="emit('toggleSidebar')"
        class="h-8 w-8 shrink-0 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
        :aria-label="props.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        type="button"
      >
        <PanelLeftOpen v-if="props.sidebarCollapsed" class="w-4 h-4" />
        <PanelLeftClose v-else class="w-4 h-4" />
      </button>

      <div class="mx-1 h-5 w-px bg-border/80"></div>

      <Tooltip v-for="item in navItems" :key="item.id" :text="item.label">
        <button
          @click="handleNavClick(item.id)"
          class="h-8 w-8 metal-icon-button flex items-center justify-center titlebar-no-drag"
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

      <div class="mx-1 h-5 w-px bg-border/80"></div>

      <Tooltip text="Open Models Folder">
        <button
          @click="openModelsFolder"
          class="h-8 w-8 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <Database class="w-4 h-4" />
        </button>
      </Tooltip>

      <Tooltip text="Open Gallery Folder">
        <button
          @click="openGalleryFolder"
          class="h-8 w-8 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <FolderOpen class="w-4 h-4" />
        </button>
      </Tooltip>

      <div class="mx-1 h-5 w-px bg-border/80"></div>

      <Tooltip :text="config.videoMode ? 'Disable Video Mode' : 'Enable Video Mode'">
        <button
          @click.stop="toggleVideoMode"
          class="h-8 w-8 metal-icon-button flex items-center justify-center titlebar-no-drag"
          :class="config.videoMode ? 'primary-metal-button' : 'text-muted-foreground hover:text-foreground'"
          type="button"
        >
          <Film class="w-4 h-4" />
        </button>
      </Tooltip>
    </nav>

    <div class="flex-1"></div>

    <!-- Window Controls -->
    <div class="flex items-center h-full titlebar-no-drag">
      <Tooltip :text="isDark ? 'Light mode' : 'Dark mode'">
        <button
          @click="toggleTheme"
          class="h-8 w-8 mr-1.5 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground titlebar-no-drag"
          type="button"
        >
          <Sun v-if="isDark" class="w-4 h-4" />
          <Moon v-else class="w-4 h-4" />
        </button>
      </Tooltip>

      <template v-if="isElectron">
        <button
          @click="handleMinimize"
          class="h-full w-12 flex items-center justify-center hover:bg-muted/60 transition-colors"
          title="Minimize"
        >
          <Minus class="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        <button
          @click="handleMaximize"
          class="h-full w-12 flex items-center justify-center hover:bg-muted/60 transition-colors"
          title="Maximize"
        >
          <Square class="w-3 h-3 text-muted-foreground" />
        </button>

        <button
          @click="handleClose"
          class="h-full w-12 flex items-center justify-center hover:bg-destructive/90 hover:text-white transition-colors"
          title="Close"
        >
          <X class="w-4 h-4" />
        </button>
      </template>
    </div>
  </header>
</template>
