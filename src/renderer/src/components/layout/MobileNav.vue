<script setup lang="ts">
import { ImageIcon, Brush, Video, Images, Settings, Scale } from '@/lib/icons'
import type { Component } from 'vue'

interface NavItem {
  id: string
  label: string
  icon: Component
}

defineProps<{
  currentTab: string
}>()

const emit = defineEmits<{
  navigate: [tab: string]
}>()

const navItems: NavItem[] = [
  { id: 'text2image', label: 'Generate', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'quantization', label: 'Quantize', icon: Scale }
]

function handleNavClick(id: string): void {
  emit('navigate', id)
}
</script>

<template>
  <nav
    class="mobile-nav z-40 flex h-16 shrink-0 items-center justify-around border-t border-border bg-background px-2"
  >
    <button
      v-for="item in navItems"
      :key="item.id"
      type="button"
      @click="handleNavClick(item.id)"
      class="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      :class="
        currentTab === item.id
          ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
          : ''
      "
      :aria-current="currentTab === item.id ? 'page' : undefined"
    >
      <component :is="item.icon" class="h-4 w-4" />
      <span class="max-w-full truncate text-[10px] font-medium">{{ item.label }}</span>
    </button>
  </nav>
</template>
