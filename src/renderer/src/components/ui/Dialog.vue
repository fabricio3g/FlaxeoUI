<script setup lang="ts">
/** Modal dialog: title, body slot, footer slot; Esc and backdrop click close it. */
import { onUnmounted, watch } from 'vue'
import { X } from '@/lib/icons'

const props = withDefaults(defineProps<{ open: boolean; title: string; width?: string }>(), {
  width: 'max-w-lg'
})
const emit = defineEmits<{ close: [] }>()

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="aui-dialog-backdrop fixed inset-0 z-[400] flex items-center justify-center p-4 titlebar-no-drag"
      role="presentation"
      @pointerdown.self="emit('close')"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="aui-dialog-surface flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[var(--float-shadow)]"
        :class="width"
      >
        <header class="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 class="text-base font-semibold">{{ title }}</h2>
          <button
            type="button"
            class="aui-icon-button -mr-1.5 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="flex items-center justify-end gap-2 px-5 pb-4 pt-3">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
