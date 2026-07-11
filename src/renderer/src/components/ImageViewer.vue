<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import {
  X,
  Info,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Download,
  Image as ImageIcon
} from '@/lib/icons'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'
import {
  hasUsableImageParams,
  normalizeImageParams,
  type ImageGenerationParams
} from '@/lib/imageParams'
import {
  buildExportFilename,
  copyImageUrlToClipboard,
  downloadUrlAs
} from '@/lib/mediaExport'

const props = defineProps<{
  src: string
  filename: string
  alt?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'reuse-seed', params: ImageGenerationParams): void
  (e: 'reuse-all', params: ImageGenerationParams): void
}>()

const toast = useToast()
const showInfo = ref(false)
const metadata = ref<ImageGenerationParams | null>(null)
const isLoading = ref(false)
const isCopied = ref(false)
const hasParams = computed(() => hasUsableImageParams(metadata.value || {}))
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const hasDragged = ref(false)
const dragStart = ref({ x: 0, y: 0, panX: 0, panY: 0 })
/** 1 = normal, 2 = 2×2 tile, 3 = 3×3 tile */
const tileRepeat = ref<1 | 2 | 3>(1)
const grayscale = ref(false)

const imageFilterStyle = computed(() => ({
  filter: grayscale.value ? 'grayscale(1)' : undefined
}))

function cycleTile(): void {
  tileRepeat.value = tileRepeat.value === 1 ? 2 : tileRepeat.value === 2 ? 3 : 1
  if (tileRepeat.value > 1) {
    zoom.value = 1
    resetPan()
  }
}

function toggleGrayscale(): void {
  grayscale.value = !grayscale.value
}

async function fetchMetadata() {
  if (!props.filename) return
  isLoading.value = true
  metadata.value = null

  try {
    const data = await apiPost<Record<string, unknown>>('/api/image/params', {
      filename: props.filename
    })
    if (data && !(data as { error?: string }).error) {
      const normalized = normalizeImageParams(data)
      metadata.value = hasUsableImageParams(normalized) ? normalized : null
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
    metadata.value.negative_prompt
      ? `Negative prompt: ${metadata.value.negative_prompt}`
      : '',
    `Steps: ${metadata.value.steps}, Sampler: ${metadata.value.sampler || 'Default'}, CFG scale: ${metadata.value.cfg_scale ?? metadata.value.cfgScale}, Seed: ${metadata.value.seed}, Size: ${metadata.value.width}x${metadata.value.height}, Model: ${metadata.value.model || metadata.value.diffusionModel}`
  ]
    .filter(Boolean)
    .join('\n')

  navigator.clipboard.writeText(text)
  isCopied.value = true
  toast.success('Parameters copied to clipboard')
  setTimeout(() => (isCopied.value = false), 2000)
}

async function copyImagePixels(): Promise<void> {
  try {
    await copyImageUrlToClipboard(props.src)
    toast.success('Image copied to clipboard')
  } catch (e) {
    console.error(e)
    toast.error('Could not copy image')
  }
}

async function saveImageFile(): Promise<void> {
  if (!props.src) {
    toast.error('No image to save')
    return
  }
  const name = buildExportFilename({
    originalName: props.filename,
    prompt: metadata.value?.prompt,
    seed: metadata.value?.seed,
    width: metadata.value?.width,
    height: metadata.value?.height
  })
  try {
    await downloadUrlAs(props.src, name)
    toast.success('Download started')
  } catch (e) {
    console.error(e)
    toast.error('Could not save image')
  }
}

function handleReuseSeed(): void {
  if (!metadata.value || metadata.value.seed == null) {
    toast.error('No seed in image metadata')
    return
  }
  emit('reuse-seed', metadata.value)
}

function handleReuseAll(): void {
  if (!metadata.value || !hasParams.value) {
    toast.error('No generation parameters found')
    return
  }
  emit('reuse-all', metadata.value)
}

function resetPan(): void {
  pan.value = { x: 0, y: 0 }
}

function setZoom(value: number): void {
  const nextZoom = Math.min(4, Math.max(1, Number(value.toFixed(2))))
  zoom.value = nextZoom
  if (nextZoom === 1) resetPan()
}

function toggleZoom(): void {
  setZoom(zoom.value > 1 ? 1 : 2)
}

function handleWheel(e: WheelEvent): void {
  e.preventDefault()
  setZoom(zoom.value + (e.deltaY > 0 ? -0.25 : 0.25))
}

function resetZoom(): void {
  zoom.value = 1
  resetPan()
}

function handleImagePointerDown(e: PointerEvent): void {
  hasDragged.value = false
  if (zoom.value <= 1) return

  isDragging.value = true
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    panX: pan.value.x,
    panY: pan.value.y
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function handleImagePointerMove(e: PointerEvent): void {
  if (!isDragging.value) return

  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  if (Math.abs(dx) + Math.abs(dy) > 3) hasDragged.value = true
  pan.value = {
    x: dragStart.value.panX + dx,
    y: dragStart.value.panY + dy
  }
}

function handleImagePointerUp(e: PointerEvent): void {
  if (!isDragging.value) return

  isDragging.value = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
}

function handleImageClick(): void {
  if (hasDragged.value) return
  toggleZoom()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') emit('prev')
  if (e.key === 'ArrowRight') emit('next')
  if (e.key === '+' || e.key === '=') setZoom(zoom.value + 0.25)
  if (e.key === '-') setZoom(zoom.value - 0.25)
  if (e.key === '0') resetZoom()
}

watch(
  () => props.filename,
  () => {
    resetZoom()
    tileRepeat.value = 1
    grayscale.value = false
    fetchMetadata()
  },
  { immediate: true }
)

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
            @click="cycleTile"
            class="aui-icon-button inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            :class="tileRepeat > 1 && 'bg-white/10 text-white'"
            :title="
              tileRepeat === 1
                ? 'Tile preview 2×2'
                : tileRepeat === 2
                  ? 'Tile preview 3×3'
                  : 'Single image'
            "
            :aria-label="`Tile repeat ${tileRepeat}x${tileRepeat}`"
          >
            {{ tileRepeat }}×{{ tileRepeat }}
          </button>
          <button
            type="button"
            @click="toggleGrayscale"
            class="aui-icon-button inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            :class="grayscale && 'bg-white/10 text-white'"
            title="Grayscale preview"
            aria-label="Toggle grayscale"
            :aria-pressed="grayscale"
          >
            Gray
          </button>
          <button
            type="button"
            @click="resetZoom"
            class="aui-icon-button inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Reset zoom"
            aria-label="Reset zoom"
            :disabled="tileRepeat > 1"
          >
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            type="button"
            @click="copyImagePixels"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Copy image"
            aria-label="Copy image to clipboard"
          >
            <ImageIcon class="size-4" />
          </button>
          <button
            type="button"
            @click="saveImageFile"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Save image"
            aria-label="Save image"
          >
            <Download class="size-4" />
          </button>
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
        v-if="tileRepeat === 1"
        type="button"
        @click="emit('prev')"
        class="aui-icon-button absolute left-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-zinc-950/45 text-zinc-400 shadow-sm backdrop-blur-xl transition-[background-color,color,border-color] duration-200 hover:border-white/20 hover:bg-zinc-900/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 md:left-5 md:size-10"
        aria-label="Previous image"
      >
        <ChevronLeft class="size-5" />
      </button>

      <button
        v-if="tileRepeat === 1"
        type="button"
        @click="emit('next')"
        class="aui-icon-button absolute right-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-zinc-950/45 text-zinc-400 shadow-sm backdrop-blur-xl transition-[background-color,color,border-color] duration-200 hover:border-white/20 hover:bg-zinc-900/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 md:right-5 md:size-10"
        aria-label="Next image"
      >
        <ChevronRight class="size-5" />
      </button>

      <div
        class="flex h-full w-full items-center justify-center overflow-hidden p-12 transition-[padding] duration-200 md:p-16"
        :class="showInfo && 'md:pr-[25rem]'"
        @click.stop
        @wheel="tileRepeat === 1 ? handleWheel($event) : undefined"
      >
        <!-- Tile preview: client-side repeat for seamless inspection -->
        <div
          v-if="tileRepeat > 1"
          class="fade-in max-h-full max-w-full overflow-hidden rounded-lg border border-white/10 shadow-2xl"
          :style="{
            width: 'min(70vmin, 100%)',
            aspectRatio: '1',
            backgroundImage: `url(${src})`,
            backgroundSize: `${100 / tileRepeat}% ${100 / tileRepeat}%`,
            backgroundRepeat: 'repeat',
            filter: grayscale ? 'grayscale(1)' : undefined
          }"
          role="img"
          :aria-label="`${tileRepeat} by ${tileRepeat} tile preview of ${filename}`"
        />
        <img
          v-else
          :src="src"
          :alt="alt || filename"
          class="fade-in zoom-in-95 animate-in fill-mode-both max-h-full max-w-full touch-none select-none object-contain duration-200"
          :class="
            zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
          "
          :style="{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            ...imageFilterStyle
          }"
          draggable="false"
          @pointerdown="handleImagePointerDown"
          @pointermove="handleImagePointerMove"
          @pointerup="handleImagePointerUp"
          @pointercancel="handleImagePointerUp"
          @click="handleImageClick"
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

        <div v-else class="flex flex-1 flex-col overflow-hidden">
          <div
            v-if="!metadata"
            class="flex flex-1 flex-col items-center justify-center px-8 text-center"
          >
            <div
              class="mb-3 flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-500"
            >
              <Info class="size-4" />
            </div>
            <p class="text-xs font-medium text-zinc-300">No metadata found</p>
            <p class="mt-1 text-[11px] leading-4 text-zinc-500">
              This image does not include generation parameters. You can still copy or save the
              image.
            </p>
          </div>

          <div v-else class="flex-1 space-y-5 overflow-y-auto p-4">
            <section v-if="metadata.prompt">
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
                    <dd class="mt-0.5 font-mono text-xs text-zinc-200">
                      {{ metadata.steps ?? '—' }}
                    </dd>
                  </div>
                  <div class="px-3 py-2.5">
                    <dt class="text-[10px] text-zinc-500">CFG scale</dt>
                    <dd class="mt-0.5 font-mono text-xs text-zinc-200">
                      {{ metadata.cfg_scale ?? metadata.cfgScale ?? '—' }}
                    </dd>
                  </div>
                </div>
                <div class="grid grid-cols-2 border-b border-white/10">
                  <div class="border-r border-white/10 px-3 py-2.5">
                    <dt class="text-[10px] text-zinc-500">Seed</dt>
                    <dd class="mt-0.5 truncate font-mono text-xs text-zinc-200">
                      {{ metadata.seed ?? '—' }}
                    </dd>
                  </div>
                  <div class="px-3 py-2.5">
                    <dt class="text-[10px] text-zinc-500">Size</dt>
                    <dd class="mt-0.5 font-mono text-xs text-zinc-200">
                      <template v-if="metadata.width && metadata.height">
                        {{ metadata.width }} x {{ metadata.height }}
                      </template>
                      <template v-else>—</template>
                    </dd>
                  </div>
                </div>
                <div class="px-3 py-2.5">
                  <dt class="text-[10px] text-zinc-500">Model</dt>
                  <dd
                    class="mt-0.5 truncate font-mono text-xs text-zinc-200"
                    :title="metadata.model || metadata.diffusionModel"
                  >
                    {{ metadata.model || metadata.diffusionModel || '—' }}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <!-- Always available: save/copy do not require metadata -->
          <div class="shrink-0 space-y-2 border-t border-white/10 p-3">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10"
                @click="copyImagePixels"
              >
                <ImageIcon class="size-3.5" />
                Copy image
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10"
                @click="saveImageFile"
              >
                <Download class="size-3.5" />
                Save
              </button>
            </div>
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
              :disabled="!metadata || metadata.seed == null"
              @click="handleReuseSeed"
            >
              <RefreshCw class="size-3.5" />
              Reuse seed
            </button>
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/15 disabled:pointer-events-none disabled:opacity-40"
              :disabled="!hasParams"
              @click="handleReuseAll"
            >
              <Sparkles class="size-3.5" />
              Reuse all settings
            </button>
          </div>
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
