<script setup lang="ts">
import type { Component } from 'vue'
import {
  ImageIcon,
  Brush,
  Video,
  Images,
  Settings,
  Scale,
  FolderOpen,
  Database,
  ChevronLeft
} from '@/lib/icons'
import Tooltip from '@/components/ui/Tooltip.vue'
import BrandMark from '@/components/BrandMark.vue'

interface NavItem {
  id: string
  label: string
  icon: Component
}

const props = defineProps<{
  currentTab: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  navigate: [tab: string]
  toggleCollapse: []
}>()

const navItems: NavItem[] = [
  { id: 'text2image', label: 'Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'quantization', label: 'Quantize', icon: Scale }
]

function isActive(id: string): boolean {
  return props.currentTab === id
}

function handleNavClick(id: string): void {
  emit('navigate', id)
}

function openModelsFolder(): void {
  window.electronAPI?.openModelsFolder()
}

function openGalleryFolder(): void {
  window.electronAPI?.openGalleryFolder()
}
</script>

<template>
  <aside
    class="flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200"
    :class="
      collapsed
        ? 'w-14 items-center px-2 py-2'
        : 'w-52 items-stretch px-3 py-3'
    "
  >
    <div
      v-if="!collapsed"
      class="mb-3 flex items-center justify-between px-1"
    >
      <BrandMark size="sm" class="text-foreground" />
      <Tooltip text="Collapse sidebar" position="right">
        <button
          type="button"
          class="aui-icon-button inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          aria-label="Collapse sidebar"
          @click="emit('toggleCollapse')"
        >
          <ChevronLeft class="size-4" />
        </button>
      </Tooltip>
    </div>

    <nav class="flex flex-1 flex-col gap-0.5" aria-label="Primary navigation">
      <template v-for="item in navItems" :key="item.id">
        <Tooltip
          v-if="collapsed"
          :text="item.label"
          position="right"
        >
          <button
            type="button"
            class="aui-icon-button relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            :class="isActive(item.id) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
            :aria-label="item.label"
            :aria-current="isActive(item.id) ? 'page' : undefined"
            @click="handleNavClick(item.id)"
          >
            <component :is="item.icon" class="size-4" />
          </button>
        </Tooltip>
        <button
          v-else
          type="button"
          class="aui-icon-button relative inline-flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :class="isActive(item.id) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          @click="handleNavClick(item.id)"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </button>
      </template>
    </nav>

    <div class="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border/70 pt-2">
      <template v-if="collapsed">
        <Tooltip text="Settings" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            :class="isActive('settings') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
            aria-label="Settings"
            :aria-current="isActive('settings') ? 'page' : undefined"
            @click="handleNavClick('settings')"
          >
            <Settings class="size-4" />
          </button>
        </Tooltip>
        <Tooltip text="Open Models Folder" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            aria-label="Open Models Folder"
            @click="openModelsFolder"
          >
            <Database class="size-4" />
          </button>
        </Tooltip>
        <Tooltip text="Open Gallery Folder" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            aria-label="Open Gallery Folder"
            @click="openGalleryFolder"
          >
            <FolderOpen class="size-4" />
          </button>
        </Tooltip>
      </template>
      <template v-else>
        <button
          type="button"
          class="aui-icon-button inline-flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :class="isActive('settings') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
          :aria-current="isActive('settings') ? 'page' : undefined"
          @click="handleNavClick('settings')"
        >
          <Settings class="size-4 shrink-0" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          class="aui-icon-button inline-flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          @click="openModelsFolder"
        >
          <Database class="size-4 shrink-0" />
          <span>Models</span>
        </button>
        <button
          type="button"
          class="aui-icon-button inline-flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          @click="openGalleryFolder"
        >
          <FolderOpen class="size-4 shrink-0" />
          <span>Gallery</span>
        </button>
      </template>
    </div>
  </aside>
</template>
