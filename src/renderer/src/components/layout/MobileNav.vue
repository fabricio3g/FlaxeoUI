<script setup lang="ts">
import { ImageIcon, Brush, Video, Images, Settings } from 'lucide-vue-next'

interface NavItem {
  id: string
  label: string
  icon: any
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
  { id: 'settings', label: 'Settings', icon: Settings }
]

function handleNavClick(id: string): void {
  emit('navigate', id)
}
</script>

<template>
  <nav
    class="h-16 bg-card border-t border-border flex items-center justify-around px-2 shrink-0 z-40"
  >
    <button
      v-for="item in navItems"
      :key="item.id"
      @click="handleNavClick(item.id)"
      class="flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-all duration-200"
      :class="[
        currentTab === item.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      ]"
    >
      <component
        :is="item.icon"
        class="w-5 h-5"
        :class="{ 'fill-current/20': currentTab === item.id }"
      />
      <span class="text-[10px] font-medium">{{ item.label }}</span>
    </button>
  </nav>
</template>
