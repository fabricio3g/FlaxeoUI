<script setup lang="ts">
/**
 * The one sidebar: where you work (Create, Workflows, Assets, Models), then the current
 * page's own list (sessions in Create, workflows and nodes in Workflows), then Settings/Help.
 * `floating` draws it as the hover preview shown while it is collapsed.
 */
import { computed } from 'vue'
import { PanelLeft } from '@/lib/icons'
import SessionList from '@/components/create/SessionList.vue'
import WorkflowSidebar from '@/components/workflow/WorkflowSidebar.vue'
import SettingsNav from './SettingsNav.vue'
import { NAV_FOOTER, NAV_ITEMS, type NavItem } from '@/lib/tools'
import { useRemoteSession } from '@/composables/useRemoteSession'

const props = withDefaults(
  defineProps<{ currentTab: string; floating?: boolean; closable?: boolean }>(),
  { floating: false, closable: false }
)
/** toggle: hide the docked sidebar, or keep the floating preview open */
const emit = defineEmits<{ navigate: [tab: string]; toggle: [] }>()

const { isRemote, canViewGallery } = useRemoteSession()

const visible = (items: NavItem[]): NavItem[] =>
  items.filter(
    (item) => !(isRemote && item.desktopOnly) && !(item.needsGallery && !canViewGallery.value)
  )

const main = computed(() => visible(NAV_ITEMS))
const footer = computed(() => visible(NAV_FOOTER))
const isActive = (item: NavItem): boolean => props.currentTab === item.id
</script>

<template>
  <aside
    class="flex h-full w-64 shrink-0 flex-col"
    :class="
      floating
        ? 'rounded-xl border border-border bg-popover shadow-[var(--float-shadow)] titlebar-no-drag'
        : 'bg-sidebar'
    "
  >
    <!-- The floating preview opens under the top bar's "Show sidebar" button, which stays the
         one toggle; the docked sidebar has its own "Hide" toggle here. -->
    <div
      class="flex h-12 shrink-0 items-center justify-between pl-4 pr-2"
      :class="!floating && 'titlebar-drag'"
    >
      <span class="text-[13px] font-semibold tracking-tight">Flaxeo</span>
      <button
        v-if="!floating || closable"
        v-tip="closable ? 'Close menu' : { text: 'Hide sidebar', keys: 'Mod+\\' }"
        type="button"
        class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground titlebar-no-drag"
        :aria-label="closable ? 'Close menu' : 'Hide sidebar'"
        @click="emit('toggle')"
      >
        <PanelLeft class="size-4" />
      </button>
    </div>

    <nav class="flex flex-col gap-0.5 px-2" aria-label="Primary">
      <button
        v-for="item in main"
        :key="item.id"
        type="button"
        class="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors"
        :class="
          isActive(item)
            ? 'bg-accent font-medium text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        "
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="emit('navigate', item.id)"
      >
        <component :is="item.icon" class="size-4 shrink-0" aria-hidden="true" />
        {{ item.label }}
      </button>
    </nav>

    <div class="mt-3 min-h-0 flex-1 border-t border-border">
      <SessionList v-if="currentTab === 'create'" />
      <WorkflowSidebar v-else-if="currentTab === 'workflows'" />
      <SettingsNav v-else-if="currentTab === 'settings'" />
    </div>

    <div class="flex flex-col gap-0.5 border-t border-border px-2 py-2">
      <button
        v-for="item in footer"
        :key="item.id"
        type="button"
        class="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors"
        :class="
          isActive(item)
            ? 'bg-accent font-medium text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        "
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="emit('navigate', item.id)"
      >
        <component :is="item.icon" class="size-4 shrink-0" aria-hidden="true" />
        {{ item.label }}
      </button>
    </div>
  </aside>
</template>
