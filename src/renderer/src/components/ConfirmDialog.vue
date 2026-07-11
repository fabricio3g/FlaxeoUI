<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import { X } from '@/lib/icons'
import { useConfirmDialog } from '@/composables/useConfirm'

const { state, confirm, cancel } = useConfirmDialog()

function onKeydown(e: KeyboardEvent): void {
  if (!state.value.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    confirm()
  }
}

watch(
  () => state.value.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.open"
      class="aui-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm titlebar-no-drag"
      role="presentation"
      @pointerdown.self="cancel"
    >
      <Transition name="modal-surface" appear>
        <div
          v-if="state.open"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="'confirm-title'"
          :aria-describedby="'confirm-desc'"
          class="aui-dialog-surface w-full max-w-sm overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/20"
          @pointerdown.stop
        >
          <header class="flex items-start gap-3 px-5 pt-5">
            <div class="min-w-0 flex-1">
              <h2 id="confirm-title" class="text-base font-semibold tracking-tight text-foreground">
                {{ state.title }}
              </h2>
              <p
                id="confirm-desc"
                class="mt-1.5 text-sm leading-6 text-muted-foreground"
              >
                {{ state.message }}
              </p>
            </div>
            <button
              type="button"
              class="aui-icon-button -mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
              @click="cancel"
            >
              <X class="size-4" />
            </button>
          </header>

          <footer class="flex items-center justify-end gap-2 px-5 py-4">
            <button
              type="button"
              class="inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              @click="cancel"
            >
              {{ state.cancelLabel }}
            </button>
            <button
              type="button"
              class="inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="
                state.danger
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              "
              @click="confirm"
            >
              {{ state.confirmLabel }}
            </button>
          </footer>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
