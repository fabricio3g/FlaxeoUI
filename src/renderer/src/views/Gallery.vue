<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet, apiPost, getOutputUrl } from '@/services/api'
import {
  Brush,
  Images,
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
  Maximize2,
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
const selectedIndex = computed(() =>
  selectedImage.value ? images.value.indexOf(selectedImage.value) : -1
)
const selectedDisplayName = computed(() => selectedImage.value?.split(/[\\/]/).pop() || '')

// ... (fetchGallery, selectImage, deleteImage, downloadImage, sendToEdit, sendToText2Image, copyImagePath, openGalleryFolder, navigatePage unchanged) ...
/**
 * fetchGallery() - Fetches all images from the output directory
 */
async function fetchGallery(): Promise<void> {
  isLoading.value = true
  try {
    const data = await apiGet<string[]>('/api/gallery')
    images.value = data || []
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
    await apiPost('/api/delete', { filename: selectedImage.value })
    images.value = images.value.filter((img) => img !== selectedImage.value)
    toast.success('Image deleted')
    selectedImage.value = null
  } catch (e) {
    console.error('Failed to delete image:', e)
    toast.error('Failed to delete image')
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
  <div class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <!-- ... header/grid stuff ... -->

    <!-- (Adding ImageViewer at root) -->
    <ImageViewer
      v-if="showImageViewer && selectedImage"
      :src="getOutputUrl(selectedImage)"
      :filename="selectedImage"
      @close="showImageViewer = false"
      @prev="navigateImage('prev')"
      @next="navigateImage('next')"
    />

    <!-- Header -->
    <div class="shrink-0 border-b border-border bg-card px-4 py-3 md:px-5">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            <Images class="h-5 w-5" />
          </div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Gallery</h1>
            <p class="text-xs text-muted-foreground">
              {{ images.length }} saved image{{ images.length === 1 ? '' : 's' }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- View Mode Toggle -->
          <SegmentedControl
            :model-value="viewMode"
            :options="viewModeOptions"
            size="sm"
            icon-only
            aria-label="Gallery view"
            @update:model-value="handleViewMode"
          />

          <!-- Refresh -->
          <button
            type="button"
            @click="fetchGallery"
            :disabled="isLoading"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Refresh gallery"
          >
            <RefreshCw class="w-4 h-4" :class="isLoading && 'animate-spin'" />
          </button>

          <!-- Open Folder -->
          <button
            @click="openGalleryFolder"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Open gallery folder"
          >
            <FolderOpen class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Image Grid -->
      <div class="flex-1 overflow-y-auto bg-background p-4 md:p-5">
        <!-- Loading State -->
        <div
          v-if="isLoading"
          class="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
        >
          <RefreshCw class="h-8 w-8 animate-spin" />
          <span class="text-sm font-medium">Loading gallery</span>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="images.length === 0"
          class="flex h-full flex-col items-center justify-center text-center text-muted-foreground"
        >
          <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
            <Images class="h-7 w-7" />
          </div>
          <p class="text-sm font-medium text-foreground">No images yet</p>
          <p class="mt-1 max-w-xs text-xs">
            Generate images in Text2Image, Edit, or Video and they will appear here.
          </p>
        </div>

        <!-- Grid -->
        <div
          v-else
          class="grid gap-3 md:gap-4"
          :class="
            viewMode === 'grid'
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
          "
        >
          <button
            v-for="(img, index) in paginatedImages"
            :key="img"
            :style="`animation-delay: ${index * 40}ms`"
            @click="selectImage(img)"
            class="animate-in fade-in fill-mode-both group relative aspect-square overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md"
            :class="
              selectedImage === img
                ? 'border-foreground/30 ring-2 ring-ring/40'
                : 'border-border/60 hover:border-foreground/20'
            "
          >
            <img
              :src="getOutputUrl(img)"
              :alt="img"
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/70 to-transparent p-2 text-left opacity-0 transition-opacity group-hover:opacity-100">
              <p class="truncate text-[11px] font-medium text-background">{{ img }}</p>
            </div>
          </button>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-4 pb-4">
          <button
            @click="navigatePage('prev')"
            :disabled="currentPage === 1"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronLeft class="w-5 h-5" />
          </button>
          <span class="text-sm text-muted-foreground"
            >Page {{ currentPage }} of {{ totalPages }}</span
          >
          <button
            @click="navigatePage('next')"
            :disabled="currentPage === totalPages"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronRight class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Preview Panel -->
      <div
        v-if="selectedImage"
        class="animate-in fade-in slide-in-from-right duration-200 absolute inset-0 z-20 flex h-full w-full shrink-0 flex-col border-l border-border bg-card md:static md:inset-auto md:z-auto md:w-96"
      >
        <!-- Preview Image -->
        <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
          <!-- Mobile Close -->
          <button
            type="button"
            @click="selectedImage = null"
            class="absolute left-2 top-2 z-10 inline-flex size-9 items-center justify-center rounded-full bg-foreground/60 text-background transition-colors hover:bg-foreground/80 md:hidden"
          >
            <ChevronLeft class="h-5 w-5" />
          </button>

          <div
            class="group relative flex h-full w-full items-center justify-center rounded-lg border border-border bg-card p-2"
          >
            <img
              :src="getOutputUrl(selectedImage)"
              :alt="selectedImage"
              class="h-full w-full cursor-zoom-in object-contain"
              @click="showImageViewer = true"
            />
            <!-- Overlay button -->
            <button
              @click="showImageViewer = true"
              class="absolute right-2 top-2 rounded bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              title="Full Screen"
            >
              <Maximize2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Navigation -->
        <div class="flex items-center justify-center gap-4 border-t border-border/70 py-2">
          <button
            type="button"
            @click="navigateImage('prev')"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Previous image"
          >
            <ChevronLeft class="w-5 h-5" />
          </button>
          <span class="text-xs text-muted-foreground">
            {{ selectedIndex + 1 }} / {{ images.length }}
          </span>
          <button
            type="button"
            @click="navigateImage('next')"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Next image"
          >
            <ChevronRight class="w-5 h-5" />
          </button>
        </div>

        <!-- File Info -->
        <div class="border-t border-border px-4 py-3">
          <p class="text-xs font-medium text-foreground truncate" :title="selectedImage">
            {{ selectedDisplayName }}
          </p>
          <p class="mt-1 text-[11px] text-muted-foreground">Choose where to use this image.</p>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-2 border-t border-border p-4">
          <button
            type="button"
            @click="showImageViewer = true"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Maximize2 class="h-4 w-4" />
            Full Screen
          </button>
          <button
            type="button"
            @click="sendToText2Image"
            class="inline-flex h-9 items-center justify-start gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Sparkles class="h-4 w-4" />
            <span>
              <span class="block text-left">Use in Text2Image</span>
              <span class="block text-left text-[10px] text-muted-foreground"
                >Restore prompt and parameters</span
              >
            </span>
          </button>
          <button
            type="button"
            @click="sendToEdit"
            class="inline-flex h-9 items-center justify-start gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Brush class="h-4 w-4" />
            <span>
              <span class="block text-left">Send to Edit</span>
              <span class="block text-left text-[10px] text-muted-foreground"
                >Use as the base image</span
              >
            </span>
          </button>
          <button
            type="button"
            @click="sendToVideo"
            class="inline-flex h-9 items-center justify-start gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Video class="h-4 w-4" />
            <span>
              <span class="block text-left">Send to Video</span>
              <span class="block text-left text-[10px] text-muted-foreground"
                >Use as I2V reference</span
              >
            </span>
          </button>
          <button
            type="button"
            @click="copyImagePath"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Copy class="h-4 w-4" />
            Copy
          </button>
          <button
            type="button"
            @click="downloadImage"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Download class="h-4 w-4" />
            Download
          </button>
          <button
            type="button"
            @click="deleteImage"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Trash2 class="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
