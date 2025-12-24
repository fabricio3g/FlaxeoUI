<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { apiGet, apiPost, getOutputUrl } from '@/services/api'
import { 
  Images, Trash2, Download, FolderOpen, RefreshCw,
  Grid, LayoutGrid, ChevronLeft, ChevronRight, Send, Copy, Sparkles, Maximize2
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import ImageViewer from '@/components/ImageViewer.vue'

const router = useRouter()

// Gallery state
const images = ref<string[]>([])
const isLoading = ref(false)
const selectedImage = ref<string | null>(null)
const viewMode = ref<'grid' | 'large'>('grid')
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

/**
 * deleteImage() - Deletes selected image after confirmation
 */
async function deleteImage(): Promise<void> {
  if (!selectedImage.value) return
  
  if (!confirm(`Delete ${selectedImage.value}?`)) return
  
  try {
    await apiPost('/api/delete', { filename: selectedImage.value })
    images.value = images.value.filter(img => img !== selectedImage.value)
    selectedImage.value = null
  } catch (e) {
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
}

/**
 * sendToEdit() - Sends selected image to the inpainting/edit view
 */
function sendToEdit(): void {
  if (!selectedImage.value) return
  
  // Store in sessionStorage for the Edit view to pick up
  sessionStorage.setItem('editImage', getOutputUrl(selectedImage.value))
  router.push({ name: 'Edit' })
}

/**
 * sendToText2Image() - Sends selected image to Text2Image to load params
 */
function sendToText2Image(): void {
  if (!selectedImage.value) return
  
  // Store in sessionStorage for Text2Image to pick up
  sessionStorage.setItem('text2imageParams', getOutputUrl(selectedImage.value))
  router.push({ name: 'Text2Image' })
}

/**
 * copyImagePath() - Copies the image path to clipboard
 */
async function copyImagePath(): Promise<void> {
  if (!selectedImage.value) return
  
  try {
    await navigator.clipboard.writeText(selectedImage.value)
  } catch (e) {
    console.error('Failed to copy:', e)
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
</script>

<template>
  <div class="flex flex-col h-full">
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
    <div class="p-4 border-b border-border bg-card shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Images class="w-6 h-6 text-primary" />
          <div>
            <h1 class="text-xl font-bold">Gallery</h1>
            <p class="text-xs text-muted-foreground">{{ images.length }} images</p>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          <!-- View Mode Toggle -->
          <div class="flex p-1 bg-muted rounded-md">
            <button
              @click="viewMode = 'grid'"
              class="p-1.5 rounded"
              :class="viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground'"
            >
              <Grid class="w-4 h-4" />
            </button>
            <button
              @click="viewMode = 'large'"
              class="p-1.5 rounded"
              :class="viewMode === 'large' ? 'bg-background shadow-sm' : 'text-muted-foreground'"
            >
              <LayoutGrid class="w-4 h-4" />
            </button>
          </div>
          
          <!-- Refresh -->
          <button
            @click="fetchGallery"
            :disabled="isLoading"
            class="p-2 rounded hover:bg-muted transition-colors"
            title="Refresh gallery"
          >
            <RefreshCw class="w-4 h-4" :class="isLoading && 'animate-spin'" />
          </button>
          
          <!-- Open Folder -->
          <button
            @click="openGalleryFolder"
            class="p-2 rounded hover:bg-muted transition-colors"
            title="Open gallery folder"
          >
            <FolderOpen class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Image Grid -->
      <div class="flex-1 overflow-y-auto p-4">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center h-full">
          <RefreshCw class="w-8 h-8 animate-spin text-muted-foreground" />
        </div>

        <!-- Empty State -->
        <div v-else-if="images.length === 0" class="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Images class="w-16 h-16 mb-4 opacity-30" />
          <p class="text-sm">No images yet</p>
          <p class="text-xs">Generate some in Text2Image!</p>
        </div>

        <!-- Grid -->
        <div
          v-else
          class="grid gap-3"
          :class="viewMode === 'grid' 
            ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' 
            : 'grid-cols-2 md:grid-cols-3'"
        >
          <button
            v-for="img in paginatedImages"
            :key="img"
            @click="selectImage(img)"
            class="aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] hover:shadow-lg"
            :class="selectedImage === img ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground'"
          >
            <img
              :src="getOutputUrl(img)"
              :alt="img"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-center gap-4 mt-6 pb-4">
          <button
            @click="navigatePage('prev')"
            :disabled="currentPage === 1"
            class="p-2 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft class="w-5 h-5" />
          </button>
          <span class="text-sm">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button
            @click="navigatePage('next')"
            :disabled="currentPage === totalPages"
            class="p-2 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Preview Panel -->
      <div
        v-if="selectedImage"
        class="w-80 border-l border-border bg-card flex flex-col shrink-0"
      >
        <!-- Preview Image -->
        <div class="flex-1 p-4 flex items-center justify-center overflow-hidden">
          <div class="relative w-full h-full group">
            <img
              :src="getOutputUrl(selectedImage)"
              :alt="selectedImage"
              class="w-full h-full object-contain rounded-lg cursor-zoom-in"
              @click="showImageViewer = true"
            />
             <!-- Overlay button -->
            <button 
                @click="showImageViewer = true"
                class="absolute top-2 right-2 p-1.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Full Screen"
            >
                <Maximize2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Navigation -->
        <div class="flex items-center justify-center gap-4 py-2">
          <button
            @click="navigateImage('prev')"
            class="p-2 rounded hover:bg-muted"
            title="Previous image"
          >
            <ChevronLeft class="w-5 h-5" />
          </button>
          <span class="text-xs text-muted-foreground">
            {{ images.indexOf(selectedImage) + 1 }} / {{ images.length }}
          </span>
          <button
            @click="navigateImage('next')"
            class="p-2 rounded hover:bg-muted"
            title="Next image"
          >
            <ChevronRight class="w-5 h-5" />
          </button>
        </div>

        <!-- File Info -->
        <div class="px-4 py-2 border-t border-border">
          <p class="text-xs text-muted-foreground truncate" :title="selectedImage">
            {{ selectedImage }}
          </p>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-2 p-4 border-t border-border">
          <button
            @click="showImageViewer = true"
             class="col-span-2 py-2 px-3 text-xs rounded bg-muted hover:bg-muted/80 flex items-center justify-center gap-1"
          >
            <Maximize2 class="w-4 h-4" />
            Full Screen
          </button>
          <button
            @click="sendToText2Image"
            class="py-2 px-3 text-xs rounded bg-muted hover:bg-muted/80 flex items-center justify-center gap-1"
          >
            <Sparkles class="w-4 h-4" />
            Use Params
          </button>
          <button
            @click="sendToEdit"
            class="py-2 px-3 text-xs rounded bg-muted hover:bg-muted/80 flex items-center justify-center gap-1"
          >
            <Send class="w-4 h-4" />
            Send to Edit
          </button>
          <button
            @click="copyImagePath"
            class="py-2 px-3 text-xs rounded bg-muted hover:bg-muted/80 flex items-center justify-center gap-1"
          >
            <Copy class="w-4 h-4" />
            Copy Path
          </button>
          <button
            @click="downloadImage"
            class="py-2 px-3 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1"
          >
            <Download class="w-4 h-4" />
            Download
          </button>
          <button
            @click="deleteImage"
            class="col-span-2 py-2 px-3 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center gap-1"
          >
            <Trash2 class="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
