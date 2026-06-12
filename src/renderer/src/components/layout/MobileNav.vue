<script setup lang="ts">
import { ImageIcon, Brush, Video, Images, Settings, Scale } from 'lucide-vue-next'
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
    class="mobile-nav h-16 bg-card/90 border-t border-border/70 flex items-center justify-around px-2 shrink-0 z-40 backdrop-blur-xl"
  >
    <button
      v-for="item in navItems"
      :key="item.id"
      @click="handleNavClick(item.id)"
      class="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg"
      :class="[
        currentTab === item.id
          ? 'primary-metal-button text-white'
          : 'metal-icon-button text-muted-foreground hover:text-foreground'
      ]"
    >
      <component :is="item.icon" class="w-4 h-4" />
      <span class="max-w-full truncate text-[10px] font-medium">{{ item.label }}</span>
    </button>
  </nav>
</template>
