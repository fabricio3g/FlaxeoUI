<script setup lang="ts">
import { computed } from 'vue'
import { 
  ImageIcon, 
  Brush, 
  Video, 
  Images, 
  Settings,
  FolderOpen,
  Database
} from 'lucide-vue-next'

interface NavItem {
  id: string
  label: string
  icon: any
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
  <aside class="w-16 flex flex-col items-center py-4 bg-card border-r border-border">
    <!-- Main Navigation -->
    <nav class="flex flex-col gap-2 flex-1">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="handleNavClick(item.id)"
        class="w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-200"
        :class="[
          isActive(item.id) 
            ? 'bg-primary text-primary-foreground' 
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        ]"
        :title="item.label"
        v-motion
        :initial="{ scale: 1 }"
        :hovered="{ scale: 1.05 }"
        :tapped="{ scale: 0.95 }"
      >
        <component :is="item.icon" class="w-5 h-5" />
      </button>
    </nav>
    
    <!-- Quick Actions -->
    <div class="flex flex-col gap-2 mt-auto">
      <button
        @click="openModelsFolder"
        class="w-12 h-12 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Open Models Folder"
      >
        <Database class="w-5 h-5" />
      </button>
      
      <button
        @click="openGalleryFolder"
        class="w-12 h-12 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Open Gallery Folder"
      >
        <FolderOpen class="w-5 h-5" />
      </button>
    </div>
  </aside>
</template>
