<script setup lang="ts">
import { ref } from 'vue'
import { X } from '@/lib/icons'

const props = defineProps<{
  open: boolean
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
}>()

const emit = defineEmits<{
  useImageSize: []
  keepOutput: []
  fitToTarget: []
  dismiss: []
  'update:dontAsk': [value: boolean]
}>()

const dontAsk = ref(false)

function onDontAskChange(e: Event): void {
  const checked = (e.target as HTMLInputElement).checked
  dontAsk.value = checked
  emit('update:dontAsk', checked)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="aui-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm titlebar-no-drag"
      role="presentation"
      @pointerdown.self="emit('dismiss')"
    >
      <Transition name="modal-surface" appear>
        <div
          v-if="open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ref-size-title"
          class="aui-dialog-surface w-full max-w-sm overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/20"
          @pointerdown.stop
        >
          <header class="flex items-start gap-3 px-5 pt-5">
            <div class="min-w-0 flex-1">
              <h2 id="ref-size-title" class="text-base font-semibold tracking-tight text-foreground">
                Output size
              </h2>
              <p class="mt-1.5 text-sm leading-6 text-muted-foreground">
                This image is
                <span class="font-mono text-foreground"
                  >{{ imageWidth }}×{{ imageHeight }}</span
                >. Output target is
                <span class="font-mono text-foreground"
                  >{{ targetWidth }}×{{ targetHeight }}</span
                >.
              </p>
            </div>
            <button
              type="button"
              class="aui-icon-button -mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
              @click="emit('dismiss')"
            >
              <X class="size-4" />
            </button>
          </header>

          <div class="flex flex-col gap-2 px-5 pt-3">
            <button
              type="button"
              class="inline-flex h-10 w-full items-center justify-center rounded-lg bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
              @click="emit('useImageSize')"
            >
              Use image size ({{ imageWidth }}×{{ imageHeight }})
            </button>
            <button
              type="button"
              class="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              @click="emit('keepOutput')"
            >
              Keep output {{ targetWidth }}×{{ targetHeight }}
            </button>
            <button
              type="button"
              class="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              @click="emit('fitToTarget')"
            >
              Fit image to {{ targetWidth }}×{{ targetHeight }}…
            </button>
          </div>

          <footer class="flex items-center px-5 py-4">
            <label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                class="rounded border-border"
                :checked="dontAsk"
                @change="onDontAskChange"
              />
              Don’t ask again
            </label>
          </footer>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
