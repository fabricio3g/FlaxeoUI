<script setup lang="ts">
import type { Component } from 'vue'
import { ImageIcon, Brush, Video, Images, Settings, Scale, FolderOpen, Database } from '@/lib/icons'

interface NavItem {
  id: string
  label: string
  icon: Component
}

const props = defineProps<{
  currentTab: string
}>()

const emit = defineEmits<{
  navigate: [tab: string]
}>()

const navItems: NavItem[] = [
  { id: 'text2image', label: 'Text2Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'settings', label: 'Settings', icon: Settings },
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
    class="flex h-full w-14 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar px-2 py-2"
  >
    <nav class="flex flex-1 flex-col gap-1" aria-label="Primary navigation">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="aui-icon-button relative inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        :class="isActive(item.id) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
        :title="item.label"
        :aria-label="item.label"
        :aria-current="isActive(item.id) ? 'page' : undefined"
        @click="handleNavClick(item.id)"
      >
        <component :is="item.icon" class="size-4" />
      </button>
    </nav>

    <div class="mt-auto flex flex-col gap-1 border-t border-sidebar-border/70 pt-2">
      <button
        type="button"
        class="aui-icon-button inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        title="Open Models Folder"
        aria-label="Open Models Folder"
        @click="openModelsFolder"
      >
        <Database class="size-4" />
      </button>
      <button
        type="button"
        class="aui-icon-button inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        title="Open Gallery Folder"
        aria-label="Open Gallery Folder"
        @click="openGalleryFolder"
      >
        <FolderOpen class="size-4" />
      </button>
    </div>
  </aside>
</template>
