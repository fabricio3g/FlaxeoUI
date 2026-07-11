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
    class="mobile-nav z-40 flex h-14 shrink-0 items-center justify-around border-t border-border/70 bg-background/95 px-1.5 backdrop-blur-md"
    aria-label="Primary navigation"
  >
    <button
      v-for="item in navItems"
      :key="item.id"
      type="button"
      @click="handleNavClick(item.id)"
      class="group flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      :class="currentTab === item.id ? 'bg-accent text-accent-foreground' : ''"
      :aria-current="currentTab === item.id ? 'page' : undefined"
    >
      <component
        :is="item.icon"
        class="h-4 w-4 transition-transform duration-150 group-active:scale-95"
      />
      <span class="max-w-full truncate text-[10px] font-medium leading-3">{{ item.label }}</span>
    </button>
  </nav>
</template>
