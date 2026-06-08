<script setup lang="ts">
import type { Component } from 'vue'
import { ImageIcon, Brush, Video, Images, Settings, FolderOpen, Database } from 'lucide-vue-next'

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

/**
 * Navigation items for the sidebar
 * Each item maps to a route in the application
 */
const navItems: NavItem[] = [
  { id: 'text2image', label: 'Text2Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'settings', label: 'Settings', icon: Settings }
]

/**
 * isActive() - Check if a nav item is the current active tab
 * @param id - The navigation item id to check
 */
function isActive(id: string): boolean {
  return props.currentTab === id
}

/**
 * handleNavClick() - Handle navigation item click
 * @param id - The navigation item id to navigate to
 */
function handleNavClick(id: string): void {
  emit('navigate', id)
}

/**
 * openModelsFolder() - Opens the models directory in file explorer
 */
function openModelsFolder(): void {
  window.electronAPI?.openModelsFolder()
}

/**
 * openGalleryFolder() - Opens the output/gallery directory
 */
function openGalleryFolder(): void {
  window.electronAPI?.openGalleryFolder()
}
</script>

<template>
  <aside
    class="w-16 flex flex-col items-center py-3 rounded-2xl border border-border/80 bg-card/85 shadow-sm backdrop-blur-xl"
  >
    <!-- Main Navigation -->
    <nav class="flex flex-col gap-1.5 flex-1">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="handleNavClick(item.id)"
        class="w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-150"
        :class="[
          isActive(item.id)
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        ]"
        :title="item.label"
      >
        <component :is="item.icon" class="w-4.5 h-4.5" />
      </button>
    </nav>

    <!-- Quick Actions -->
    <div class="flex flex-col gap-1.5 mt-auto">
      <button
        @click="openModelsFolder"
        class="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Open Models Folder"
      >
        <Database class="w-4.5 h-4.5" />
      </button>

      <button
        @click="openGalleryFolder"
        class="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Open Gallery Folder"
      >
        <FolderOpen class="w-4.5 h-4.5" />
      </button>
    </div>
  </aside>
</template>
