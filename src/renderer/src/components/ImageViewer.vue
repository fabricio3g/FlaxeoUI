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
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 backdrop-blur-md"
    @click.self="emit('close')"
  >
    <!-- Top Bar -->
    <div
      class="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-foreground/60 to-transparent p-4"
    >
      <div class="ml-4 max-w-md truncate text-sm font-medium text-background drop-shadow-md">
        {{ filename }}
      </div>

      <div class="mr-2 flex items-center gap-2">
        <button
          type="button"
          @click="showInfo = !showInfo"
          class="inline-flex size-9 items-center justify-center rounded-full bg-foreground/40 text-background backdrop-blur-sm transition-colors hover:bg-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          :class="{ 'bg-primary/80 hover:bg-primary/80': showInfo }"
          title="Toggle Info"
          aria-label="Toggle image info"
        >
          <Info class="h-5 w-5" />
        </button>
        <button
          type="button"
          @click="emit('close')"
          class="inline-flex size-9 items-center justify-center rounded-full bg-foreground/40 text-background backdrop-blur-sm transition-colors hover:bg-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          title="Close"
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Navigation Buttons -->
    <button
      type="button"
      @click="emit('prev')"
      class="absolute left-4 top-1/2 z-10 -translate-y-1/2 inline-flex size-11 items-center justify-center rounded-full bg-foreground/30 text-background backdrop-blur-sm transition-colors hover:bg-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      aria-label="Previous image"
    >
      <ChevronLeft class="h-7 w-7" />
    </button>

    <button
      type="button"
      @click="emit('next')"
      class="absolute right-4 top-1/2 z-10 -translate-y-1/2 inline-flex size-11 items-center justify-center rounded-full bg-foreground/30 text-background backdrop-blur-sm transition-colors hover:bg-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      aria-label="Next image"
    >
      <ChevronRight class="h-7 w-7" />
    </button>

    <!-- Main Image -->
    <div
      class="flex h-full w-full items-center justify-center bg-foreground p-4 transition-all duration-300"
      :class="{ 'pr-[26rem]': showInfo }"
      @click.stop
    >
      <img
        :src="src"
        :alt="alt"
        class="max-h-full max-w-full object-contain drop-shadow-lg"
      />
    </div>

    <!-- Info Panel -->
    <div
      class="absolute inset-y-0 right-0 z-20 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-l border-border bg-popover text-popover-foreground shadow-lg transition-transform duration-300 ease-in-out"
      :class="showInfo ? 'translate-x-0' : 'translate-x-full'"
      @click.stop
    >
      <div class="flex items-center justify-between border-b border-border p-4">
        <h3 class="text-base font-semibold tracking-tight">Image Info</h3>
        <button
          type="button"
          @click="handleCopy"
          class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          title="Copy Parameters"
          aria-label="Copy parameters"
        >
          <Check v-if="isCopied" class="h-4 w-4 text-emerald-500" />
          <Copy v-else class="h-4 w-4" />
        </button>
      </div>

      <div v-if="isLoading" class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading info...
      </div>

      <div
        v-else-if="!metadata"
        class="flex flex-1 flex-col items-center justify-center p-4 text-center text-sm text-muted-foreground"
      >
        <Info class="mb-4 h-12 w-12 opacity-20" />
        <p>No metadata found for this image.</p>
      </div>

      <div v-else class="flex-1 space-y-4 overflow-y-auto p-4">
        <!-- Prompt -->
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prompt</label>
          <p class="rounded-md border border-border bg-muted/50 p-3 text-sm leading-relaxed">{{ metadata.prompt }}</p>
        </div>

        <!-- Negative Prompt -->
        <div v-if="metadata.negative_prompt">
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Negative Prompt</label>
          <p class="rounded-md border border-border bg-muted/50 p-3 text-sm leading-relaxed">
            {{ metadata.negative_prompt }}
          </p>
        </div>

        <!-- Details Grid -->
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-md border border-border bg-muted/30 p-2">
            <span class="block text-[11px] uppercase tracking-wider text-muted-foreground">Steps</span>
            <span class="font-mono text-sm">{{ metadata.steps }}</span>
          </div>
          <div class="rounded-md border border-border bg-muted/30 p-2">
            <span class="block text-[11px] uppercase tracking-wider text-muted-foreground">CFG Scale</span>
            <span class="font-mono text-sm">{{ metadata.cfg_scale }}</span>
          </div>
          <div class="rounded-md border border-border bg-muted/30 p-2">
            <span class="block text-[11px] uppercase tracking-wider text-muted-foreground">Seed</span>
            <span class="font-mono text-sm">{{ metadata.seed }}</span>
          </div>
          <div class="rounded-md border border-border bg-muted/30 p-2">
            <span class="block text-[11px] uppercase tracking-wider text-muted-foreground">Size</span>
            <span class="font-mono text-sm">{{ metadata.width }}×{{ metadata.height }}</span>
          </div>
          <div class="col-span-2 rounded-md border border-border bg-muted/30 p-2">
            <span class="block text-[11px] uppercase tracking-wider text-muted-foreground">Model</span>
            <span class="truncate font-mono text-sm">{{ metadata.model }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
