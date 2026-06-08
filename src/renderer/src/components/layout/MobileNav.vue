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
    class="h-16 bg-card/90 border-t border-border/70 flex items-center justify-around px-2 shrink-0 z-40 backdrop-blur-xl"
  >
    <button
      v-for="item in navItems"
      :key="item.id"
      @click="handleNavClick(item.id)"
      class="flex min-w-12 flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-all duration-200"
      :class="[
        currentTab === item.id ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/20' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      ]"
    >
      <component
        :is="item.icon"
        class="w-4.5 h-4.5"
        :class="{ 'fill-current/20': currentTab === item.id }"
      />
      <span class="text-[10px] font-medium">{{ item.label }}</span>
    </button>
  </nav>
</template>
