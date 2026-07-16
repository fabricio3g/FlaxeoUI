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
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Search
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
  openSearch: []
}>()

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '')
const searchShortcutLabel = isMac ? '⌘K' : 'Ctrl+K'

const navItems: NavItem[] = [
  { id: 'text2image', label: 'Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'quantization', label: 'Quantize', icon: Scale },
  { id: 'help', label: 'Help', icon: BookOpen }
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
    class="flex h-full shrink-0 flex-col border-r-0 bg-sidebar transition-[width] duration-200"
    :class="collapsed ? 'w-14 items-center px-2 py-2' : 'w-52 items-stretch px-3 py-3'"
  >
    <!-- Brand (expanded) + collapse/expand — size-8 control -->
    <div
      class="mb-3 flex h-8 w-full shrink-0 items-center"
      :class="collapsed ? 'justify-center' : 'justify-between px-1'"
    >
      <BrandMark
        v-if="!collapsed"
        size="sm"
        :ambient="false"
        class="min-w-0 shrink text-foreground"
      />
      <Tooltip :text="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" position="right">
        <button
          type="button"
          class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="emit('toggleCollapse')"
        >
          <ChevronRight v-if="collapsed" class="size-4" />
          <ChevronLeft v-else class="size-4" />
        </button>
      </Tooltip>
    </div>

    <!-- Search / jump -->
    <div class="mb-2 w-full" :class="collapsed ? 'flex justify-center' : ''">
      <Tooltip v-if="collapsed" :text="`Search (${searchShortcutLabel})`" position="right">
        <button
          type="button"
          class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          aria-label="Search"
          @click="emit('openSearch')"
        >
          <Search class="size-4" />
        </button>
      </Tooltip>
      <button
        v-else
        type="button"
        class="aui-icon-button inline-flex h-8 w-full items-center gap-2 rounded-md border border-transparent bg-sidebar-accent/60 px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        aria-label="Search"
        @click="emit('openSearch')"
      >
        <Search class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-left">Search</span>
        <kbd
          class="shrink-0 rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >{{ searchShortcutLabel }}</kbd
        >
      </button>
    </div>

    <!-- Same gap as expanded; collapsed icons match collapse button (size-8) -->
    <nav
      class="flex flex-1 flex-col gap-0.5"
      :class="collapsed ? 'items-center' : ''"
      aria-label="Primary navigation"
    >
      <template v-for="item in navItems" :key="item.id">
        <Tooltip v-if="collapsed" :text="item.label" position="right">
          <button
            type="button"
            class="aui-icon-button relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
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
          class="aui-icon-button relative inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :class="isActive(item.id) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          @click="handleNavClick(item.id)"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </button>
      </template>
    </nav>

    <div
      class="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border/70 pt-2"
      :class="collapsed ? 'items-center' : ''"
    >
      <template v-if="collapsed">
        <Tooltip text="Settings" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            :class="
              isActive('settings') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''
            "
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
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            aria-label="Open Models Folder"
            @click="openModelsFolder"
          >
            <Database class="size-4" />
          </button>
        </Tooltip>
        <Tooltip text="Open Gallery Folder" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
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
          class="aui-icon-button inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :class="isActive('settings') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
          :aria-current="isActive('settings') ? 'page' : undefined"
          @click="handleNavClick('settings')"
        >
          <Settings class="size-4 shrink-0" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          class="aui-icon-button inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          @click="openModelsFolder"
        >
          <Database class="size-4 shrink-0" />
          <span>Models</span>
        </button>
        <button
          type="button"
          class="aui-icon-button inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          @click="openGalleryFolder"
        >
          <FolderOpen class="size-4 shrink-0" />
          <span>Gallery</span>
        </button>
      </template>
    </div>
  </aside>
</template>
