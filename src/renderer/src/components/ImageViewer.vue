<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { X, Info, Copy, Check, ChevronLeft, ChevronRight } from '@/lib/icons'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  src: string
  filename: string
  alt?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'prev'): void
  (e: 'next'): void
}>()

const toast = useToast()
const showInfo = ref(false)
const metadata = ref<any>(null)
const isLoading = ref(false)
const isCopied = ref(false)

async function fetchMetadata() {
  if (!props.filename) return
  isLoading.value = true
  metadata.value = null

  try {
    const data = await apiPost('/api/image/params', { filename: props.filename })
    if (data && !data.error) {
      metadata.value = data
    }
  } catch (e) {
    console.warn('Failed to fetch metadata:', e)
  } finally {
    isLoading.value = false
  }
}

function handleCopy() {
  if (!metadata.value) return

  const text = [
    metadata.value.prompt,
    metadata.value.negative_prompt ? `Negative prompt: ${metadata.value.negative_prompt}` : '',
    `Steps: ${metadata.value.steps}, Sampler: ${metadata.value.sampler || 'Default'}, CFG scale: ${metadata.value.cfg_scale}, Seed: ${metadata.value.seed}, Size: ${metadata.value.width}x${metadata.value.height}, Model: ${metadata.value.model}`
  ]
    .filter(Boolean)
    .join('\n')

  navigator.clipboard.writeText(text)
  isCopied.value = true
  toast.success('Parameters copied to clipboard')
  setTimeout(() => (isCopied.value = false), 2000)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') emit('prev')
  if (e.key === 'ArrowRight') emit('next')
}

watch(() => props.filename, fetchMetadata, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fade-in animate-in fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-zinc-950/95 text-zinc-100 backdrop-blur-sm duration-200"
      @click.self="emit('close')"
    >
      <header
        class="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 p-3 md:p-4"
      >
        <div
          class="min-w-0 max-w-[calc(100%-6rem)] truncate rounded-lg border border-white/10 bg-zinc-950/55 px-3 py-2 text-xs font-medium text-zinc-300 shadow-sm backdrop-blur-xl md:max-w-lg"
          :title="filename"
        >
          {{ filename }}
        </div>

        <div
          class="pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-zinc-950/55 p-1 shadow-sm backdrop-blur-xl"
        >
          <button
            type="button"
            @click="showInfo = !showInfo"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            :class="showInfo && 'bg-white/10 text-white'"
            title="Toggle info"
            aria-label="Toggle image info"
            :aria-pressed="showInfo"
          >
            <Info class="size-4" />
          </button>
          <button
            type="button"
            @click="emit('close')"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Close"
            aria-label="Close"
          >
            <X class="size-4" />
          </button>
        </div>
      </header>

      <button
        type="button"
        @click="emit('prev')"
        class="aui-icon-button absolute left-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-zinc-950/45 text-zinc-400 shadow-sm backdrop-blur-xl transition-[background-color,color,border-color] duration-200 hover:border-white/20 hover:bg-zinc-900/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 md:left-5 md:size-10"
        aria-label="Previous image"
      >
        <ChevronLeft class="size-5" />
      </button>

      <button
        type="button"
        @click="emit('next')"
        class="aui-icon-button absolute right-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-zinc-950/45 text-zinc-400 shadow-sm backdrop-blur-xl transition-[background-color,color,border-color] duration-200 hover:border-white/20 hover:bg-zinc-900/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 md:right-5 md:size-10"
        aria-label="Next image"
      >
        <ChevronRight class="size-5" />
      </button>

      <div
        class="flex h-full w-full items-center justify-center p-12 transition-[padding] duration-200 md:p-16"
        :class="showInfo && 'md:pr-[25rem]'"
        @click.stop
      >
        <img
          :src="src"
          :alt="alt || filename"
          class="fade-in zoom-in-95 animate-in fill-mode-both max-h-full max-w-full object-contain shadow-2xl duration-200"
        />
      </div>

      <aside
        class="aui-dialog-surface absolute inset-x-2 bottom-16 top-16 z-20 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 text-zinc-100 shadow-2xl backdrop-blur-2xl transition-transform duration-200 ease-out md:bottom-3 md:left-auto md:right-3 md:top-16 md:w-[22rem]"
        :class="
          showInfo
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-[calc(100%+5rem)] md:translate-x-[calc(100%+2rem)] md:translate-y-0'
        "
        :aria-hidden="!showInfo"
        @click.stop
      >
        <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div class="min-w-0">
            <p class="text-sm font-medium tracking-tight text-zinc-100">Image details</p>
            <p class="mt-0.5 text-[10px] text-zinc-500">Generation metadata</p>
          </div>
          <button
            type="button"
            @click="handleCopy"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-40"
            title="Copy parameters"
            aria-label="Copy parameters"
            :disabled="!metadata"
          >
            <Check v-if="isCopied" class="size-4 text-zinc-100" />
            <Copy v-else class="size-4" />
          </button>
        </div>

        <div
          v-if="isLoading"
          class="flex flex-1 flex-col gap-3 p-4"
          aria-label="Loading image information"
        >
          <div class="h-3 w-16 animate-pulse rounded bg-white/10"></div>
          <div class="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5"></div>
          <div class="grid grid-cols-2 gap-2">
            <div
              v-for="n in 4"
              :key="n"
              class="h-14 animate-pulse rounded-lg border border-white/10 bg-white/5"
            ></div>
          </div>
        </div>

        <div
          v-else-if="!metadata"
          class="flex flex-1 flex-col items-center justify-center px-8 text-center"
        >
          <div
            class="mb-3 flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-500"
          >
            <Info class="size-4" />
          </div>
          <p class="text-xs font-medium text-zinc-300">No metadata found</p>
          <p class="mt-1 text-[11px] leading-4 text-zinc-500">
            This image does not include generation parameters.
          </p>
        </div>

        <div v-else class="flex-1 space-y-5 overflow-y-auto p-4">
          <section>
            <label
              class="aui-label mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500"
              >Prompt</label
            >
            <p
              class="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-zinc-300"
            >
              {{ metadata.prompt }}
            </p>
          </section>

          <section v-if="metadata.negative_prompt">
            <label
              class="aui-label mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500"
              >Negative prompt</label
            >
            <p
              class="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-zinc-300"
            >
              {{ metadata.negative_prompt }}
            </p>
          </section>

          <section>
            <label
              class="aui-label mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500"
              >Parameters</label
            >
            <dl class="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
              <div class="grid grid-cols-2 border-b border-white/10">
                <div class="border-r border-white/10 px-3 py-2.5">
                  <dt class="text-[10px] text-zinc-500">Steps</dt>
                  <dd class="mt-0.5 font-mono text-xs text-zinc-200">{{ metadata.steps }}</dd>
                </div>
                <div class="px-3 py-2.5">
                  <dt class="text-[10px] text-zinc-500">CFG scale</dt>
                  <dd class="mt-0.5 font-mono text-xs text-zinc-200">{{ metadata.cfg_scale }}</dd>
                </div>
              </div>
              <div class="grid grid-cols-2 border-b border-white/10">
                <div class="border-r border-white/10 px-3 py-2.5">
                  <dt class="text-[10px] text-zinc-500">Seed</dt>
                  <dd class="mt-0.5 truncate font-mono text-xs text-zinc-200">
                    {{ metadata.seed }}
                  </dd>
                </div>
                <div class="px-3 py-2.5">
                  <dt class="text-[10px] text-zinc-500">Size</dt>
                  <dd class="mt-0.5 font-mono text-xs text-zinc-200">
                    {{ metadata.width }} x {{ metadata.height }}
                  </dd>
                </div>
              </div>
              <div class="px-3 py-2.5">
                <dt class="text-[10px] text-zinc-500">Model</dt>
                <dd class="mt-0.5 truncate font-mono text-xs text-zinc-200" :title="metadata.model">
                  {{ metadata.model }}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </aside>

      <div
        v-if="$slots.actions"
        class="aui-dialog-surface absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center rounded-lg border border-white/10 bg-zinc-950/60 p-1 shadow-xl backdrop-blur-2xl md:bottom-5"
        @click.stop
      >
        <slot name="actions" />
      </div>
    </div>
  </Teleport>
</template>
