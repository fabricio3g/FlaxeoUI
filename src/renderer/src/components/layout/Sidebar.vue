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
  Database
} from '@/lib/icons'

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
    class="flex h-full w-14 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-2"
  >
    <nav class="flex flex-1 flex-col gap-0.5">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        :class="
          isActive(item.id)
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : ''
        "
        :title="item.label"
        :aria-label="item.label"
        @click="handleNavClick(item.id)"
      >
        <component :is="item.icon" class="size-4" />
      </button>
    </nav>

    <div class="mt-auto flex flex-col gap-0.5">
      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        title="Open Models Folder"
        aria-label="Open Models Folder"
        @click="openModelsFolder"
      >
        <Database class="size-4" />
      </button>
      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        title="Open Gallery Folder"
        aria-label="Open Gallery Folder"
        @click="openGalleryFolder"
      >
        <FolderOpen class="size-4" />
      </button>
    </div>
  </aside>
</template>
