<script setup lang="ts">
/** Phone-width navigation: the same destinations as the desktop rail. */
import { computed } from 'vue'
import { NAV_FOOTER, NAV_ITEMS } from '@/lib/tools'
import { useRemoteSession } from '@/composables/useRemoteSession'

defineProps<{ currentTab: string }>()
const emit = defineEmits<{ navigate: [tab: string] }>()

const { isRemote, canViewGallery } = useRemoteSession()

const items = computed(() =>
  [...NAV_ITEMS, ...NAV_FOOTER.filter((item) => item.id === 'settings')].filter(
    (item) => !(isRemote && item.desktopOnly) && !(item.needsGallery && !canViewGallery.value)
  )
)
</script>

<template>
  <nav
    class="mobile-nav z-40 flex h-14 shrink-0 items-center justify-around border-t border-border bg-background px-1.5"
    aria-label="Primary"
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      :class="currentTab === item.id && 'bg-accent text-foreground'"
      :aria-current="currentTab === item.id ? 'page' : undefined"
      @click="emit('navigate', item.id)"
    >
      <component :is="item.icon" class="size-4" :class="currentTab === item.id && 'text-brand'" />
      <span class="max-w-full truncate text-[11px] font-medium leading-3">{{ item.label }}</span>
    </button>
  </nav>
</template>
