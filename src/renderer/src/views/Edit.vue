<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, API_BASE, getOutputUrl } from '@/services/api'
import { Brush, Upload, Trash2, Loader2, X, Images } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

// Inpainting state
const prompt = ref('')
const negativePrompt = ref('')
const isGenerating = ref(false)
const error = ref<string | null>(null)

// Canvas state
const baseImage = ref<string | null>(null)
const baseImageFile = ref<File | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const isDrawing = ref(false)
const brushSize = ref(30)
const inpaintStrength = ref(0.75)

// Canvas context
let ctx: CanvasRenderingContext2D | null = null
let imageElement: HTMLImageElement | null = null

/**
 * loadImage() - Load an image into the canvas
 */
function loadImage(src: string): void {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    imageElement = img
    baseImage.value = src
    
    if (canvasRef.value) {
      canvasRef.value.width = img.width
      canvasRef.value.height = img.height
      ctx = canvasRef.value.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, img.width, img.height)
      }
    }
  }
  img.src = src
}

/**
 * handleImageUpload() - Handle direct image upload
 */
function handleImageUpload(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  baseImageFile.value = file
  const url = URL.createObjectURL(file)
  loadImage(url)
}

/**
 * startDrawing() - Begin mask drawing
 */
function startDrawing(e: MouseEvent | TouchEvent): void {
  isDrawing.value = true
  draw(e)
}

/**
 * stopDrawing() - End mask drawing
 */
function stopDrawing(): void {
  isDrawing.value = false
  if (ctx) {
    ctx.beginPath()
  }
}

/**
 * draw() - Draw on the mask canvas
 */
function draw(e: MouseEvent | TouchEvent): void {
  if (!isDrawing.value || !ctx || !canvasRef.value) return
  
  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height
  
  let x: number, y: number
  if ('touches' in e) {
    x = (e.touches[0].clientX - rect.left) * scaleX
    y = (e.touches[0].clientY - rect.top) * scaleY
  } else {
    x = (e.clientX - rect.left) * scaleX
    y = (e.clientY - rect.top) * scaleY
  }
  
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.beginPath()
  ctx.arc(x, y, brushSize.value * scaleX, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * clearMask() - Clear the mask canvas
 */
function clearMask(): void {
  if (ctx && canvasRef.value) {
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  }
}

/**
 * getMaskDataUrl() - Get the mask as a data URL
 */
function getMaskDataUrl(): string | null {
  if (!canvasRef.value) return null
  return canvasRef.value.toDataURL('image/png')
}

/**
 * handleGenerate() - Generate inpainted image
 */
async function handleGenerate(): Promise<void> {
  if (!prompt.value.trim() || !baseImageFile.value) return
  
  isGenerating.value = true
  error.value = null
  
  try {
    const formData = new FormData()
    formData.append('prompt', prompt.value)
    formData.append('negative_prompt', negativePrompt.value)
    formData.append('image', baseImageFile.value)
    formData.append('strength', inpaintStrength.value.toString())
    formData.append('steps', config.value.steps.toString())
    formData.append('cfg_scale', config.value.cfgScale.toString())
    formData.append('seed', config.value.seed.toString())
    
    // Add mask if drawn
    const maskDataUrl = getMaskDataUrl()
    if (maskDataUrl && maskDataUrl !== 'data:,') {
      // Convert data URL to blob
      const response = await fetch(maskDataUrl)
      const blob = await response.blob()
      formData.append('mask', blob, 'mask.png')
    }
    
    // Add model info
    if (config.value.loadMode === 'standard') {
      formData.append('model', config.value.standardModel)
    } else {
      formData.append('diffusion_model', config.value.diffusionModel)
    }
    
    const res = await fetch(`${API_BASE}/api/inpaint`, {
      method: 'POST',
      body: formData
    })
    
    if (!res.ok) {
      throw new Error(await res.text())
    }
    
    const result = await res.json()
    if (result.filename) {
      loadImage(getOutputUrl(result.filename))
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Inpainting failed'
    console.error('Inpainting error:', e)
  } finally {
    isGenerating.value = false
  }
}

/**
 * handleCancel() - Cancel generation
 */
async function handleCancel(): Promise<void> {
  try {
    await apiPost('/api/cancel-cli', {})
  } catch (e) {
    console.error('Cancel failed:', e)
  }
  isGenerating.value = false
}

/**
 * goToGallery() - Open gallery to select an image
 */
function goToGallery(): void {
  router.push({ name: 'Gallery' })
}

// Check for image from gallery on mount
onMounted(() => {
  const editImage = sessionStorage.getItem('editImage')
  if (editImage) {
    sessionStorage.removeItem('editImage')
    // Create a fetch to get the file for upload
    fetch(editImage)
      .then(res => res.blob())
      .then(blob => {
        baseImageFile.value = new File([blob], 'image.png', { type: 'image/png' })
        loadImage(editImage)
      })
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Prompt Section -->
    <div class="shrink-0 border-b border-border/50">
      <div class="p-5">
        <div class="max-w-4xl mx-auto space-y-4">
          
          <!-- Inpaint Prompt -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Inpaint Prompt</label>
              <span class="text-xs text-muted-foreground">{{ prompt.length }} chars</span>
            </div>
            <textarea
              v-model="prompt"
              rows="2"
              placeholder="Describe what to generate in the masked area..."
              class="w-full px-4 py-3 text-sm rounded-xl bg-background border-2 border-border/60 resize-none transition-all duration-200
                     focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/40"
              :disabled="isGenerating"
            ></textarea>
          </div>
          
          <!-- Negative Prompt -->
          <div>
            <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-2 block">Negative Prompt</label>
            <textarea
              v-model="negativePrompt"
              rows="2"
              placeholder="blurry, low quality, distorted, bad anatomy..."
              class="w-full px-4 py-3 text-sm rounded-xl bg-muted/50 border border-border/50 resize-none transition-all duration-200
                     focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground/40"
              :disabled="isGenerating"
            ></textarea>
          </div>
          
          <!-- Controls Row -->
          <div class="flex flex-wrap items-center gap-4">
            
            <!-- Brush Size -->
            <div class="flex items-center gap-2">
              <label class="text-xs font-medium text-muted-foreground">Brush</label>
              <div class="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 border border-border/30">
                <input
                  v-model.number="brushSize"
                  type="range"
                  min="5"
                  max="100"
                  class="w-20 h-1 accent-primary"
                />
                <span class="text-xs w-6 text-center font-mono">{{ brushSize }}</span>
              </div>
            </div>

            <!-- Strength -->
            <div class="flex items-center gap-2">
              <label class="text-xs font-medium text-muted-foreground">Strength</label>
              <div class="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 border border-border/30">
                <input
                  v-model.number="inpaintStrength"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  class="w-16 h-1 accent-primary"
                />
                <span class="text-xs w-8 text-center font-mono">{{ inpaintStrength.toFixed(2) }}</span>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-2">
              <button
                @click="clearMask"
                class="px-3 py-1.5 text-xs font-medium bg-muted/50 border border-border/30 rounded-lg 
                       hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                <Trash2 class="w-3.5 h-3.5" />
                Clear
              </button>

              <label class="px-3 py-1.5 text-xs font-medium bg-muted/50 border border-border/30 rounded-lg 
                            cursor-pointer hover:bg-muted transition-colors flex items-center gap-1.5">
                <Upload class="w-3.5 h-3.5" />
                Upload
                <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
              </label>

              <button
                @click="goToGallery"
                class="px-3 py-1.5 text-xs font-medium bg-muted/50 border border-border/30 rounded-lg 
                       hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                <Images class="w-3.5 h-3.5" />
                Gallery
              </button>
            </div>
            
            <!-- Spacer -->
            <div class="flex-1"></div>
            
            <!-- Inpaint / Cancel Button -->
            <button
              v-if="!isGenerating"
              @click="handleGenerate"
              :disabled="!prompt.trim() || !baseImage"
              class="px-6 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 
                     text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:scale-100
                     transform transition-all duration-200 flex items-center gap-2"
            >
              <Brush class="w-4 h-4" />
              Inpaint
            </button>
            <button
              v-else
              @click="handleCancel"
              class="px-6 py-2.5 text-sm font-semibold rounded-lg bg-red-500/90 text-white
                     hover:bg-red-500 transition-colors flex items-center gap-2"
            >
              <X class="w-4 h-4" />
              Cancel
            </button>
          </div>
          
        </div>
      </div>
    </div>

    <!-- Canvas Area -->
    <div class="flex-1 overflow-hidden flex items-center justify-center p-4 bg-muted/30">
      <!-- Error -->
      <div v-if="error" class="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm flex items-center gap-2 z-10">
        {{ error }}
        <button @click="error = null" class="hover:opacity-70">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Canvas Container -->
      <div
        ref="containerRef"
        class="relative max-w-full max-h-full rounded-lg overflow-hidden border border-border bg-background shadow-xl"
      >
        <!-- Placeholder -->
        <div v-if="!baseImage" class="w-80 h-80 flex flex-col items-center justify-center text-muted-foreground gap-4">
          <Brush class="w-12 h-12 opacity-30" />
          <div class="text-center">
            <p class="text-xs mb-2">Drop an image here or</p>
            <label class="px-4 py-2 text-xs bg-primary text-primary-foreground rounded cursor-pointer hover:bg-primary/90">
              Upload Image
              <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
            </label>
          </div>
          <p class="text-xs text-muted-foreground/50">Or select from Gallery</p>
        </div>

        <!-- Image + Canvas -->
        <div v-else class="relative inline-block">
          <img
            :src="baseImage"
            class="block max-w-full max-h-[65vh] object-contain"
            alt="Base image"
          />
          <canvas
            ref="canvasRef"
            class="absolute top-0 left-0 w-full h-full cursor-crosshair"
            @mousedown="startDrawing"
            @mousemove="draw"
            @mouseup="stopDrawing"
            @mouseleave="stopDrawing"
            @touchstart.prevent="startDrawing"
            @touchmove.prevent="draw"
            @touchend="stopDrawing"
          ></canvas>
        </div>

        <!-- Loading Overlay -->
        <div
          v-if="isGenerating"
          class="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <Loader2 class="w-8 h-8 animate-spin text-primary mb-2" />
          <span class="text-sm font-medium">Inpainting...</span>
        </div>
      </div>
    </div>
  </div>
</template>
