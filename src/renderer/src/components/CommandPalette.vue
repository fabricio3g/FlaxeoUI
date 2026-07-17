<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Search, X } from '@/lib/icons'
import { filterCommandItems, groupCommandItems, type CommandItem } from '@/lib/commandPalette'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [item: CommandItem]
}>()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const filtered = computed(() => filterCommandItems(query.value))
const groups = computed(() => groupCommandItems(filtered.value))
const flat = computed(() => filtered.value)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    inputRef.value?.focus()
  }
)

watch(query, () => {
  activeIndex.value = 0
})

function close(): void {
  emit('close')
}

function selectIndex(index: number): void {
  const item = flat.value[index]
  if (!item) return
  emit('select', item)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!flat.value.length) return
    activeIndex.value = (activeIndex.value + 1) % flat.value.length
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!flat.value.length) return
    activeIndex.value = (activeIndex.value - 1 + flat.value.length) % flat.value.length
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    selectIndex(activeIndex.value)
  }
}

function flatIndexOf(item: CommandItem): number {
  return flat.value.findIndex((i) => i.id === item.id)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="aui-dialog-backdrop fixed inset-0 z-[320] flex items-start justify-center bg-black/40 p-4 pt-[min(20vh,8rem)] backdrop-blur-sm titlebar-no-drag"
      role="presentation"
      @pointerdown.self="close"
      @keydown="onKeydown"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        class="aui-dialog-surface flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-2xl shadow-black/20"
        @pointerdown.stop
      >
        <div class="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <Search class="size-4 shrink-0 text-muted-foreground" />
          <input
            ref="inputRef"
            v-model="query"
            type="search"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="Search screens, settings, actions…"
            class="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            @keydown="onKeydown"
          />
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close search"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="max-h-[min(50vh,22rem)] overflow-y-auto p-2">
          <p v-if="!flat.length" class="px-3 py-8 text-center text-sm text-muted-foreground">
            No matches
          </p>
          <div v-for="section in groups" :key="section.group" class="mb-2 last:mb-0">
            <p
              class="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {{ section.group }}
            </p>
            <button
              v-for="item in section.items"
              :key="item.id"
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
              :class="
                flatIndexOf(item) === activeIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-muted/70'
              "
              @mouseenter="activeIndex = flatIndexOf(item)"
              @click="selectIndex(flatIndexOf(item))"
            >
              <span
                class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground"
              >
                <component :is="item.icon" class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ item.label }}</span>
                <span
                  v-if="item.subtitle"
                  class="block truncate text-[11px] text-muted-foreground"
                  >{{ item.subtitle }}</span
                >
              </span>
            </button>
          </div>
        </div>

        <div
          class="flex items-center gap-3 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground"
        >
          <span><kbd class="font-mono">↑↓</kbd> navigate</span>
          <span><kbd class="font-mono">Enter</kbd> open</span>
          <span><kbd class="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
