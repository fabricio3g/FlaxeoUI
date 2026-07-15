<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet, apiPost, getOutputUrl } from '@/services/api'
import {
  Brush,
  Trash2,
  Download,
  FolderOpen,
  RefreshCw,
  Grid,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Copy,
  Sparkles,
  Video,
  Scale,
  X,
  History
} from '@/lib/icons'
import { requestOpenHistory } from '@/lib/appEvents'
import { copyImageUrlToClipboard, downloadOutputAsFormat } from '@/lib/mediaExport'
import { useOutputPreferences } from '@/composables/useOutputPreferences'
import { requestConfirm } from '@/composables/useConfirm'
import { useRouter } from 'vue-router'
import ImageViewer from '@/components/ImageViewer.vue'
import BrandMark from '@/components/BrandMark.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import { useToast } from '@/composables/useToast'
import { useConfigStore } from '@/stores/config'
import { useModels } from '@/composables/useModels'
import { useGenerationHistory } from '@/composables/useGenerationHistory'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import { isAnyGenerationBusy, toastGenerationError } from '@/composables/useGeneration'
import { useJobQueue } from '@/composables/useJobQueue'
import type { ImageGenerationParams } from '@/lib/imageParams'
import { useRemoteSession } from '@/composables/useRemoteSession'

const router = useRouter()
const toast = useToast()
const configStore = useConfigStore()
const { models, fetchModels } = useModels()
const { addEntry: addHistoryEntry } = useGenerationHistory()
const { supportsUpscale, fetchCapabilities } = useBackendCapabilities()
const { enqueue, pendingCount } = useJobQueue()
const { isRemote } = useRemoteSession()
const { defaultSaveFormat } = useOutputPreferences()
const isElectron = Boolean(window.electronAPI)

// Gallery state
const images = ref<string[]>([])
const isLoading = ref(false)
const selectedImage = ref<string | null>(null)
const viewMode = ref<'grid' | 'large'>('grid')
const mediaFilter = ref<'all' | 'images' | 'videos' | 'upscales'>('all')
const loadedImages = ref(new Set<string>())
const viewModeOptions = [
  { value: 'grid', label: 'Compact grid', icon: Grid },
  { value: 'large', label: 'Large grid', icon: LayoutGrid }
]
const mediaFilterOptions = [
  { value: 'all', label: 'All' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
  { value: 'upscales', label: 'Upscales' }
]
const showImageViewer = ref(false)

// Upscale UI
const showUpscale = ref(false)
const upscaleModel = ref('')
const upscaleRepeats = ref(1)
const upscaleTileSize = ref(128)
const isUpscaling = ref(false)

// Pagination
const currentPage = ref(1)
const imagesPerPage = 20

const filteredImages = computed(() => {
  return images.value.filter((name) => {
    if (mediaFilter.value === 'all') return true
    const isVideo = /\.mp4$/i.test(name)
    const isUpscale = /^upscale_/i.test(name)
    if (mediaFilter.value === 'videos') return isVideo
    if (mediaFilter.value === 'upscales') return isUpscale
    // images: stills that are not primarily video
    return !isVideo
  })
})

const totalPages = computed(() => Math.ceil(filteredImages.value.length / imagesPerPage) || 1)
const paginatedImages = computed(() => {
  const start = (currentPage.value - 1) * imagesPerPage
  return filteredImages.value.slice(start, start + imagesPerPage)
})

const upscaleModelOptions = computed(() => [
  {
    label: models.value.upscale.length ? 'Select upscale model…' : 'No models in models/upscale',
    value: ''
  },
  ...models.value.upscale.map((model) => ({
    label: model.split(/[\\/]/).pop() || model,
    value: model
  }))
])

async function fetchGallery(): Promise<void> {
  isLoading.value = true
  try {
    const data = await apiGet<string[]>('/api/gallery')
    images.value = data || []
    loadedImages.value = new Set(
      [...loadedImages.value].filter((image) => images.value.includes(image))
    )
    if (currentPage.value > totalPages.value) currentPage.value = Math.max(totalPages.value, 1)
  } catch (e) {
    console.error('Failed to fetch gallery:', e)
    toast.error(e instanceof Error ? e.message : 'Gallery unavailable')
    images.value = []
  } finally {
    isLoading.value = false
  }
}

function handleMediaFilter(value: string): void {
  if (value === 'all' || value === 'images' || value === 'videos' || value === 'upscales') {
    mediaFilter.value = value
    currentPage.value = 1
  }
}

function selectImage(filename: string): void {
  selectedImage.value = filename
}

function openImageViewer(filename: string): void {
  selectImage(filename)
  showImageViewer.value = true
}

function markImageLoaded(filename: string): void {
  if (loadedImages.value.has(filename)) return
  loadedImages.value = new Set(loadedImages.value).add(filename)
}

function handleViewMode(value: string): void {
  if (value === 'grid' || value === 'large') viewMode.value = value
}

async function deleteImage(): Promise<void> {
  if (!selectedImage.value || isRemote) return

  const ok = await requestConfirm({
    title: 'Delete image',
    message: `Delete “${selectedImage.value}”? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return

  try {
    const data = await apiPost<{ filename: string }>('/api/delete', {
      filename: selectedImage.value
    })
    images.value = images.value.filter((img) => img !== data.filename)
    toast.success('Image deleted')
    selectedImage.value = null
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete image'
    toast.error(msg)
    console.error('Failed to delete image:', e)
  }
}

async function downloadImage(): Promise<void> {
  if (!selectedImage.value) return
  try {
    await downloadOutputAsFormat(selectedImage.value, defaultSaveFormat.value)
    toast.success(`Saved as ${defaultSaveFormat.value.toUpperCase()}`)
  } catch (e) {
    console.error(e)
    toast.error('Could not save image')
  }
}

async function copyImagePixels(): Promise<void> {
  if (!selectedImage.value) return
  try {
    await copyImageUrlToClipboard(getOutputUrl(selectedImage.value))
    toast.success('Image copied to clipboard')
  } catch (e) {
    console.error(e)
    toast.error('Could not copy image — try Download instead')
  }
}

function sendToEdit(): void {
  if (!selectedImage.value) return
  sessionStorage.setItem('editImage', getOutputUrl(selectedImage.value))
  toast.success('Sent to Edit')
  router.push({ name: 'Edit' })
}

function sendToText2Image(): void {
  if (!selectedImage.value) return
  sessionStorage.setItem('text2imageParams', getOutputUrl(selectedImage.value))
  toast.success('Sent to Text2Image')
  router.push({ name: 'Text2Image' })
}

function sendToVideo(): void {
  if (!selectedImage.value) return
  sessionStorage.setItem('videoReferenceImage', getOutputUrl(selectedImage.value))
  toast.success('Sent to Video')
  router.push({ name: 'Video' })
}

function sendSelectedToText2Image(): void {
  sendToText2Image()
  showImageViewer.value = false
}

function sendSelectedToEdit(): void {
  sendToEdit()
  showImageViewer.value = false
}

function sendSelectedToVideo(): void {
  sendToVideo()
  showImageViewer.value = false
}

async function deleteSelectedImage(): Promise<void> {
  await deleteImage()
  if (!selectedImage.value) showImageViewer.value = false
}

function handleReuseSeed(params: ImageGenerationParams): void {
  configStore.applyImageParams(params, 'seed')
  toast.success(params.seed != null ? `Seed set to ${params.seed}` : 'Seed applied')
}

function handleReuseAll(params: ImageGenerationParams): void {
  configStore.applyImageParams(params, 'all')
  // Store prompts for Text2Image to pick up even when navigating away
  if (params.prompt) sessionStorage.setItem('text2imagePrompt', params.prompt)
  if (params.negative_prompt || params.negativePrompt) {
    sessionStorage.setItem(
      'text2imageNegativePrompt',
      params.negative_prompt || params.negativePrompt || ''
    )
  }
  toast.success('Settings restored from image')
  showImageViewer.value = false
  router.push({ name: 'Text2Image' })
}

function openUpscalePanel(): void {
  if (!selectedImage.value) {
    toast.error('Select an image first')
    return
  }
  if (!supportsUpscale.value) {
    toast.error('Active backend does not advertise upscale mode')
    return
  }
  if (!upscaleModel.value && models.value.upscale[0]) {
    upscaleModel.value = models.value.upscale[0]
  }
  showUpscale.value = true
}

function closeUpscalePanel(): void {
  if (isUpscaling.value) return
  showUpscale.value = false
}

async function runUpscale(opts?: { quiet?: boolean }): Promise<void> {
  if (!selectedImage.value) return
  if (!upscaleModel.value) {
    if (!models.value.upscale[0]) {
      toast.error('Select an upscale model')
      return
    }
    upscaleModel.value = models.value.upscale[0]
  }

  const source = selectedImage.value
  const model = upscaleModel.value
  const busy = isAnyGenerationBusy()
  isUpscaling.value = true

  enqueue({
    surface: 'upscale',
    label: `Upscale ${source}`,
    prompt: `Upscale ${source}`,
    kind: 'json',
    endpoint: '/api/upscale',
    jsonBody: {
      filename: source,
      upscaleModel: model,
      upscaleRepeats: upscaleRepeats.value,
      upscaleTileSize: upscaleTileSize.value,
      offloadToCpu: configStore.config.cpuOffload,
      diffusionFa: configStore.config.flashAttention,
      streamLayers: configStore.config.streamLayers,
      maxVram: configStore.config.maxVram,
      threads: configStore.config.threads
    },
    onSuccess: async (result) => {
      const filename = result.filename || result.filenames?.[0]
      if (!filename) {
        toastGenerationError(toast, result.message || 'Upscale failed', 'Upscale failed')
        return
      }
      addHistoryEntry({
        surface: 'upscale',
        status: 'success',
        prompt: `Upscale ${source}`,
        filename
      })
      toast.success('Upscale complete')
      showUpscale.value = false
      await fetchGallery()
      openImageViewer(filename)
    },
    onError: (msg) => {
      if (msg === 'Cancelled') return
      toastGenerationError(toast, msg, 'Upscale failed')
      addHistoryEntry({
        surface: 'upscale',
        status: 'failed',
        prompt: `Upscale ${source}`,
        error: msg
      })
    },
    onSettled: () => {
      isUpscaling.value = false
    }
  })

  if (busy && !opts?.quiet) toast.info(`Queued · ${pendingCount.value} waiting`)
}

/** One-click queue upscale with default model (no modal). */
function queueUpscaleNow(): void {
  if (!selectedImage.value) {
    toast.error('Select an image first')
    return
  }
  if (!supportsUpscale.value) {
    toast.error('Active backend does not advertise upscale mode')
    return
  }
  if (!upscaleModel.value && models.value.upscale[0]) {
    upscaleModel.value = models.value.upscale[0]
  }
  if (!upscaleModel.value) {
    toast.error('No model in models/upscale')
    return
  }
  void runUpscale({ quiet: true })
  toast.info('Upscale queued')
}

function openGalleryFolder(): void {
  window.electronAPI?.openGalleryFolder()
}

function navigatePage(direction: 'prev' | 'next'): void {
  if (direction === 'prev' && currentPage.value > 1) {
    currentPage.value--
  } else if (direction === 'next' && currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

function navigateImage(direction: 'prev' | 'next'): void {
  if (!selectedImage.value) return

  const currentIndex = images.value.indexOf(selectedImage.value)
  if (direction === 'prev' && currentIndex > 0) {
    selectedImage.value = images.value[currentIndex - 1]
  } else if (direction === 'next' && currentIndex < images.value.length - 1) {
    selectedImage.value = images.value[currentIndex + 1]
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (showImageViewer.value || showUpscale.value) return

  if (selectedImage.value) {
    if (e.key === 'ArrowLeft') navigateImage('prev')
    else if (e.key === 'ArrowRight') navigateImage('next')
    else if (e.key === 'Escape') selectedImage.value = null
    else if (e.key === 'Delete' && !isRemote) deleteImage()
  }
}

onMounted(async () => {
  await fetchGallery()
  fetchModels()
  fetchCapabilities()
  try {
    const focus = sessionStorage.getItem('galleryFocusFile')
    if (focus) {
      sessionStorage.removeItem('galleryFocusFile')
      if (images.value.includes(focus) || /\.(png|jpe?g|webp|gif|avif|mp4)$/i.test(focus)) {
        openImageViewer(focus)
      }
    }
    if (sessionStorage.getItem('galleryOpenUpscale') === '1') {
      sessionStorage.removeItem('galleryOpenUpscale')
      if (selectedImage.value) openUpscalePanel()
    }
  } catch {
    /* ignore */
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <ImageViewer
      v-if="showImageViewer && selectedImage"
      :src="getOutputUrl(selectedImage)"
      :filename="selectedImage"
      @close="showImageViewer = false"
      @prev="navigateImage('prev')"
      @next="navigateImage('next')"
      @reuse-seed="handleReuseSeed"
      @reuse-all="handleReuseAll"
    >
      <template #actions>
        <div class="flex items-center gap-1">
          <button
            type="button"
            @click="sendSelectedToText2Image"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Use in Text2Image"
            aria-label="Use in Text2Image"
          >
            <Sparkles class="size-4" />
          </button>
          <button
            type="button"
            @click="sendSelectedToEdit"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Send to Edit"
            aria-label="Send to Edit"
          >
            <Brush class="size-4" />
          </button>
          <button
            type="button"
            @click="sendSelectedToVideo"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Send to Video"
            aria-label="Send to Video"
          >
            <Video class="size-4" />
          </button>
          <button
            type="button"
            @click="queueUpscaleNow"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-40"
            title="Queue upscale (default model)"
            aria-label="Queue upscale"
            :disabled="!supportsUpscale || !models.upscale.length"
          >
            <Scale class="size-4" />
          </button>
          <button
            type="button"
            @click="openUpscalePanel"
            class="inline-flex h-8 items-center rounded-md px-2 text-[11px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-40"
            title="Upscale options"
            aria-label="Upscale options"
            :disabled="!supportsUpscale"
          >
            …
          </button>
          <button
            type="button"
            @click="copyImagePixels"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Copy image"
            aria-label="Copy image to clipboard"
          >
            <Copy class="size-4" />
          </button>
          <button
            type="button"
            @click="downloadImage"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Save image"
            aria-label="Save image"
          >
            <Download class="size-4" />
          </button>
          <button
            v-if="!isRemote"
            type="button"
            @click="deleteSelectedImage"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-destructive/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 class="size-4" />
          </button>
        </div>
      </template>
    </ImageViewer>

    <!-- Upscale dialog -->
    <Teleport to="body">
      <div
        v-if="showUpscale && selectedImage"
        class="fixed inset-0 z-[210] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
        @click.self="closeUpscalePanel"
      >
        <div
          class="aui-dialog-surface w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl"
          @click.stop
        >
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium tracking-tight">Upscale image</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground" :title="selectedImage">
                {{ selectedImage }}
              </p>
            </div>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              :disabled="isUpscaling"
              @click="closeUpscalePanel"
            >
              <X class="size-4" />
            </button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-muted-foreground">ESRGAN model</label>
              <Select v-model="upscaleModel" size="md" :options="upscaleModelOptions" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <label class="text-xs text-muted-foreground">
                Repeats
                <input
                  v-model.number="upscaleRepeats"
                  type="number"
                  min="1"
                  max="8"
                  class="mt-1 w-full rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label class="text-xs text-muted-foreground">
                Tile size
                <input
                  v-model.number="upscaleTileSize"
                  type="number"
                  min="32"
                  step="32"
                  class="mt-1 w-full rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>
            <p class="text-[11px] leading-4 text-muted-foreground">
              Uses sd-cli <code class="text-foreground/80">-M upscale</code>. Place models in
              <code class="text-foreground/80">models/upscale</code>.
            </p>
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
              :disabled="isUpscaling || !upscaleModel"
              @click="runUpscale"
            >
              <Scale class="size-4" :class="isUpscaling && 'animate-pulse'" />
              {{ isUpscaling ? 'Upscaling…' : 'Run upscale' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <header
      class="shrink-0 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur md:px-6"
    >
      <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <SegmentedControl
            :model-value="viewMode"
            :options="viewModeOptions"
            size="sm"
            icon-only
            aria-label="Gallery view"
            @update:model-value="handleViewMode"
          />
          <SegmentedControl
            :model-value="mediaFilter"
            :options="mediaFilterOptions"
            size="sm"
            aria-label="Media filter"
            @update:model-value="handleMediaFilter"
          />
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            title="Generation history"
            aria-label="Generation history"
            @click="requestOpenHistory()"
          >
            <History class="size-4" />
          </button>
          <button
            type="button"
            @click="fetchGallery"
            :disabled="isLoading"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            title="Refresh gallery"
          >
            <RefreshCw class="size-4" :class="isLoading && 'animate-spin'" />
          </button>

          <button
            v-if="isElectron"
            type="button"
            @click="openGalleryFolder"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            title="Open gallery folder"
          >
            <FolderOpen class="size-4" />
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl flex-1 overflow-y-auto p-4 md:p-6">
      <div
        v-if="isLoading"
        class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        <div
          v-for="n in 15"
          :key="n"
          class="aspect-square animate-pulse rounded-lg border border-border/60 bg-muted/50"
        ></div>
      </div>

      <div
        v-else-if="filteredImages.length === 0"
        class="flex h-full min-h-80 items-center justify-center rounded-3xl px-8 text-center"
      >
        <div class="content-item flex max-w-sm flex-col items-center">
          <BrandMark size="lg" class="text-foreground" />
          <p class="mt-5 text-xl font-light tracking-[-0.03em]">
            {{ images.length === 0 ? 'Your gallery is empty' : 'No matches for this filter' }}
          </p>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            {{
              images.length === 0
                ? 'Generated images from Text2Image and Edit will appear here.'
                : 'Try another media filter or clear the filter to All.'
            }}
          </p>
        </div>
      </div>

      <div
        v-else
        class="grid gap-2.5 sm:gap-3"
        :class="
          viewMode === 'grid'
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        "
      >
        <button
          v-for="(img, index) in paginatedImages"
          :key="img"
          :style="`animation-delay: ${Math.min(index, 8) * 40}ms`"
          @click="openImageViewer(img)"
          class="fade-in animate-in fill-mode-both group relative aspect-square overflow-hidden rounded-lg border bg-muted/20 duration-200 transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-muted/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          :class="
            selectedImage === img
              ? 'border-foreground/50 ring-1 ring-foreground/15'
              : 'border-border/70'
          "
        >
          <div
            v-if="!loadedImages.has(img)"
            class="absolute inset-0 animate-pulse bg-muted"
            aria-hidden="true"
          ></div>
          <img
            :src="getOutputUrl(img)"
            :alt="img"
            class="h-full w-full object-cover transition-[opacity,transform] duration-200 group-hover:scale-[1.015]"
            :class="loadedImages.has(img) ? 'opacity-100' : 'opacity-0'"
            loading="lazy"
            @load="markImageLoaded(img)"
            @error="markImageLoaded(img)"
          />
          <div
            class="pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded-md border border-white/10 bg-zinc-950/65 px-2 py-1.5 text-left opacity-0 shadow-sm backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <p class="truncate text-[10px] font-medium text-zinc-100">{{ img }}</p>
          </div>
        </button>
      </div>

      <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-3 pb-2">
        <button
          @click="navigatePage('prev')"
          :disabled="currentPage === 1"
          class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="Previous page"
        >
          <ChevronLeft class="size-4" />
        </button>
        <span
          class="aui-status-badge rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
          >Page {{ currentPage }} of {{ totalPages }}</span
        >
        <button
          @click="navigatePage('next')"
          :disabled="currentPage === totalPages"
          class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="Next page"
        >
          <ChevronRight class="size-4" />
        </button>
      </div>
    </main>
  </div>
</template>
