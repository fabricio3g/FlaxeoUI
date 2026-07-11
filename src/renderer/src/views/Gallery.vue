<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet, getApiBase, getOutputUrl } from '@/services/api'
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
  Video
} from '@/lib/icons'
import { useRouter } from 'vue-router'
import ImageViewer from '@/components/ImageViewer.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const toast = useToast()

// Gallery state
const images = ref<string[]>([])
const isLoading = ref(false)
const selectedImage = ref<string | null>(null)
const viewMode = ref<'grid' | 'large'>('grid')
const loadedImages = ref(new Set<string>())
const viewModeOptions = [
  { value: 'grid', label: 'Compact grid', icon: Grid },
  { value: 'large', label: 'Large grid', icon: LayoutGrid }
]
const showImageViewer = ref(false) // New state for full screen

// ... (pagination logic unchanged) ...
// Pagination
const currentPage = ref(1)
const imagesPerPage = 20
const totalPages = computed(() => Math.ceil(images.value.length / imagesPerPage))
const paginatedImages = computed(() => {
  const start = (currentPage.value - 1) * imagesPerPage
  return images.value.slice(start, start + imagesPerPage)
})
// ... (fetchGallery, selectImage, deleteImage, downloadImage, sendToEdit, sendToText2Image, copyImagePath, openGalleryFolder, navigatePage unchanged) ...
/**
 * fetchGallery() - Fetches all images from the output directory
 */
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
    images.value = []
  } finally {
    isLoading.value = false
  }
}

/**
 * selectImage() - Sets the currently selected image for preview
 */
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

/**
 * deleteImage() - Deletes selected image after confirmation
 */
async function deleteImage(): Promise<void> {
  if (!selectedImage.value) return

  if (!confirm(`Delete ${selectedImage.value}?`)) return

  try {
    const response = await fetch(`${getApiBase()}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: selectedImage.value })
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Delete failed' }))
      throw new Error(err.message || 'Delete failed')
    }
    const data = await response.json()
    images.value = images.value.filter((img) => img !== data.filename)
    toast.success('Image deleted')
    selectedImage.value = null
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete image'
    toast.error(msg)
    console.error('Failed to delete image:', e)
  }
}

/**
 * downloadImage() - Downloads the selected image
 */
function downloadImage(): void {
  if (!selectedImage.value) return

  const link = document.createElement('a')
  link.href = getOutputUrl(selectedImage.value)
  link.download = selectedImage.value
  link.click()
  toast.success('Download started')
}

/**
 * sendToEdit() - Sends selected image to the inpainting/edit view
 */
function sendToEdit(): void {
  if (!selectedImage.value) return

  // Store in sessionStorage for the Edit view to pick up
  sessionStorage.setItem('editImage', getOutputUrl(selectedImage.value))
  toast.success('Sent to Edit')
  router.push({ name: 'Edit' })
}

/**
 * sendToText2Image() - Sends selected image to Text2Image to load params
 */
function sendToText2Image(): void {
  if (!selectedImage.value) return

  // Store in sessionStorage for Text2Image to pick up
  sessionStorage.setItem('text2imageParams', getOutputUrl(selectedImage.value))
  toast.success('Sent to Text2Image')
  router.push({ name: 'Text2Image' })
}

/**
 * sendToVideo() - Sends selected image as an image-to-video reference
 */
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

/**
 * copyImagePath() - Copies the image path to clipboard
 */
async function copyImagePath(): Promise<void> {
  if (!selectedImage.value) return

  try {
    await navigator.clipboard.writeText(selectedImage.value)
    toast.success('Copied filename')
  } catch (e) {
    console.error('Failed to copy:', e)
    toast.error('Failed to copy filename')
  }
}

/**
 * openGalleryFolder() - Opens the output folder in file explorer
 */
function openGalleryFolder(): void {
  window.electronAPI?.openGalleryFolder()
}

/**
 * navigatePage() - Navigate to a different page
 */
function navigatePage(direction: 'prev' | 'next'): void {
  if (direction === 'prev' && currentPage.value > 1) {
    currentPage.value--
  } else if (direction === 'next' && currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

/**
 * navigateImage() - Navigate to previous/next image
 */
function navigateImage(direction: 'prev' | 'next'): void {
  if (!selectedImage.value) return

  const currentIndex = images.value.indexOf(selectedImage.value)
  if (direction === 'prev' && currentIndex > 0) {
    selectedImage.value = images.value[currentIndex - 1]
  } else if (direction === 'next' && currentIndex < images.value.length - 1) {
    selectedImage.value = images.value[currentIndex + 1]
  }
}

// Keyboard navigation
function handleKeydown(e: KeyboardEvent): void {
  if (showImageViewer.value) return // Let ImageViewer handle its own logic

  if (selectedImage.value) {
    if (e.key === 'ArrowLeft') navigateImage('prev')
    else if (e.key === 'ArrowRight') navigateImage('next')
    else if (e.key === 'Escape') selectedImage.value = null
    else if (e.key === 'Delete') deleteImage()
  }
}

onMounted(() => {
  fetchGallery()
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
            @click="copyImagePath"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Copy filename"
            aria-label="Copy filename"
          >
            <Copy class="size-4" />
          </button>
          <button
            type="button"
            @click="downloadImage"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Download"
            aria-label="Download"
          >
            <Download class="size-4" />
          </button>
          <button
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

    <header
      class="shrink-0 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur md:px-6"
    >
      <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <SegmentedControl
          :model-value="viewMode"
          :options="viewModeOptions"
          size="sm"
          icon-only
          aria-label="Gallery view"
          @update:model-value="handleViewMode"
        />

        <div class="flex shrink-0 items-center gap-1">
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
        v-else-if="images.length === 0"
        class="flex h-full min-h-80 items-center justify-center rounded-3xl px-8 text-center"
      >
        <div class="content-item flex max-w-sm flex-col items-center">
          <BrandMark size="lg" class="text-foreground" />
          <p class="mt-5 text-xl font-light tracking-[-0.03em]">
            Your gallery is empty
          </p>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            Generated images from Text2Image and Edit will appear here.
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
