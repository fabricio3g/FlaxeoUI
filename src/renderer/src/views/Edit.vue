<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, getApiBase, getOutputUrl } from '@/services/api'
import { Brush, Upload, Trash2, X, Images } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import { useGenerationStatus } from '@/composables/useGeneration'

const router = useRouter()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

// Inpainting state
const prompt = ref('')
const negativePrompt = ref('')
const { isGenerating } = useGenerationStatus('edit')
const error = ref<string | null>(null)

// Canvas state
const baseImage = ref<string | null>(null)
const baseImageFile = ref<File | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const isDrawing = ref(false)
const isPanning = ref(false)
const brushSize = ref(30)
const inpaintStrength = ref(0.75)
const canvasDisplaySize = ref({ width: 0, height: 0 })
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const panStart = ref({ x: 0, y: 0 })
const panOrigin = ref({ x: 0, y: 0 })

// Canvas context
let ctx: CanvasRenderingContext2D | null = null
let imageElement: HTMLImageElement | null = null
let imageResizeObserver: ResizeObserver | null = null
let lastMaskPoint: { x: number; y: number } | null = null

const canvasDisplayStyle = computed(() => ({
  width: canvasDisplaySize.value.width ? `${canvasDisplaySize.value.width}px` : '100%',
  height: canvasDisplaySize.value.height ? `${canvasDisplaySize.value.height}px` : '100%'
}))

const imageViewportStyle = computed(() => ({
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
  transformOrigin: 'center center'
}))

function syncCanvasToDisplayedImage(): void {
  if (!imageRef.value) return

  canvasDisplaySize.value = {
    width: imageRef.value.clientWidth,
    height: imageRef.value.clientHeight
  }
}

function observeDisplayedImage(): void {
  if (!imageRef.value || typeof ResizeObserver === 'undefined') return

  imageResizeObserver?.disconnect()
  imageResizeObserver = new ResizeObserver(() => syncCanvasToDisplayedImage())
  imageResizeObserver.observe(imageRef.value)
}

function initializeMaskCanvas(): void {
  if (!canvasRef.value || !imageElement) return

  canvasRef.value.width = imageElement.width
  canvasRef.value.height = imageElement.height
  ctx = canvasRef.value.getContext('2d')
  if (ctx) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }
  ctx?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
}

function getCanvasPoint(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if (!canvasRef.value) return null

  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height

  if ('touches' in e) {
    const touch = e.touches[0]
    if (!touch) return null
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    }
  }

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  }
}

function getBrushWidth(): number {
  if (!canvasRef.value) return brushSize.value

  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height
  return brushSize.value * ((scaleX + scaleY) / 2)
}

function drawMaskPoint(point: { x: number; y: number }): void {
  if (!ctx) return

  const brushWidth = getBrushWidth()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.beginPath()
  ctx.arc(point.x, point.y, brushWidth / 2, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * loadImage() - Load an image into the canvas
 */
function loadImage(src: string): void {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = async () => {
    imageElement = img
    baseImage.value = src
    zoom.value = 1
    pan.value = { x: 0, y: 0 }
    await nextTick()
    initializeMaskCanvas()
    syncCanvasToDisplayedImage()
    observeDisplayedImage()
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
  if ('button' in e && e.button !== 0) return
  if (!ctx) initializeMaskCanvas()

  const point = getCanvasPoint(e)
  if (!point) return

  isDrawing.value = true
  lastMaskPoint = point
  drawMaskPoint(point)
}

/**
 * stopDrawing() - End mask drawing
 */
function stopDrawing(): void {
  isDrawing.value = false
  lastMaskPoint = null
  if (ctx) {
    ctx.beginPath()
  }
}

/**
 * draw() - Draw on the mask canvas
 */
function draw(e: MouseEvent | TouchEvent): void {
  if (!ctx) initializeMaskCanvas()
  if (!isDrawing.value || !ctx || !canvasRef.value) return

  const point = getCanvasPoint(e)
  if (!point) return

  if (!lastMaskPoint) {
    lastMaskPoint = point
    drawMaskPoint(point)
    return
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = getBrushWidth()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(lastMaskPoint.x, lastMaskPoint.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  lastMaskPoint = point
}

/**
 * clearMask() - Clear the mask canvas
 */
function clearMask(): void {
  if (!ctx) initializeMaskCanvas()
  if (ctx && canvasRef.value) {
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  }
}

function handleViewportWheel(event: WheelEvent): void {
  if (!baseImage.value) return

  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  zoom.value = Math.min(6, Math.max(0.25, Number((zoom.value + delta).toFixed(2))))
}

function startPanning(event: MouseEvent): void {
  if (event.button !== 1) return

  event.preventDefault()
  isPanning.value = true
  panStart.value = { x: event.clientX, y: event.clientY }
  panOrigin.value = { ...pan.value }
}

function panViewport(event: MouseEvent): void {
  if (!isPanning.value) return


  pan.value = {
    x: panOrigin.value.x + event.clientX - panStart.value.x,
    y: panOrigin.value.y + event.clientY - panStart.value.y
  }
}

function stopPanning(): void {
  isPanning.value = false
}

function resetViewport(): void {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
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
    formData.append('initImage', baseImageFile.value)
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
      formData.append('diffusionModel', config.value.standardModel)
    } else {
      formData.append('diffusionModel', config.value.diffusionModel)
      if (config.value.highNoiseDiffusionModel) formData.append('highNoiseDiffusionModel', config.value.highNoiseDiffusionModel)
      if (config.value.uncondDiffusionModel) formData.append('uncondDiffusionModel', config.value.uncondDiffusionModel)
      if (config.value.t5xxlModel) formData.append('t5xxl', config.value.t5xxlModel)
      if (config.value.llmModel) formData.append('llm', config.value.llmModel)
      if (config.value.llmVisionModel) formData.append('llmVision', config.value.llmVisionModel)
      if (config.value.embeddingsConnectorsModel) formData.append('embeddingsConnectors', config.value.embeddingsConnectorsModel)
      if (config.value.clipModel) formData.append('clipL', config.value.clipModel)
      if (config.value.clipGModel) formData.append('clipG', config.value.clipGModel)
      if (config.value.clipVisionModel) formData.append('clipVision', config.value.clipVisionModel)
    }
    if (config.value.vaeModel) formData.append('vae', config.value.vaeModel)
    if (config.value.audioVaeModel) formData.append('audioVae', config.value.audioVaeModel)
    if (config.value.vaeFormat) formData.append('vaeFormat', config.value.vaeFormat)
    formData.append('samplingMethod', config.value.sampler)
    formData.append('scheduler', config.value.scheduler)
    if (config.value.guidance) formData.append('guidance', config.value.guidance.toString())
    if (config.value.clipSkip !== -1) formData.append('clipSkip', config.value.clipSkip.toString())
    if (config.value.flashAttention) formData.append('diffusionFa', 'true')
    if (config.value.vaeTiling) formData.append('vaeTiling', 'true')
    if (config.value.clipOnCpu) formData.append('clipOnCpu', 'true')
    if (config.value.vaeOnCpu) formData.append('vaeOnCpu', 'true')
    if (config.value.controlNetOnCpu) formData.append('controlNetOnCpu', 'true')
    if (config.value.cpuOffload) formData.append('offloadToCpu', 'true')
    if (config.value.diffusionConvDirect) formData.append('diffusionConvDirect', 'true')
    if (config.value.vaeConvDirect) formData.append('vaeConvDirect', 'true')
    if (config.value.forceSDXLVaeConvScale) formData.append('forceSDXLVaeConvScale', 'true')
    if (config.value.backendAssignment) formData.append('backendAssignment', config.value.backendAssignment)
    if (config.value.paramsBackendAssignment) formData.append('paramsBackendAssignment', config.value.paramsBackendAssignment)
    if (config.value.threads > 0) formData.append('threads', config.value.threads.toString())
    if (config.value.maxVram !== 0) formData.append('maxVram', config.value.maxVram.toString())
    if (config.value.streamLayers) formData.append('streamLayers', 'true')
    if (config.value.mmap) formData.append('mmap', 'true')
    if (config.value.rngType) formData.append('rngType', config.value.rngType)
    if (config.value.samplerRngType) formData.append('samplerRngType', config.value.samplerRngType)
    if (config.value.loraApplyMode) formData.append('loraApplyMode', config.value.loraApplyMode)
    if (config.value.quantizationType) formData.append('quantizationType', config.value.quantizationType)
    if (config.value.predictionType) formData.append('predictionType', config.value.predictionType)
    if (config.value.cacheMode) formData.append('cacheMode', config.value.cacheMode)
    if (config.value.cacheOption) formData.append('cacheOption', config.value.cacheOption)
    if (config.value.scmMask) formData.append('scmMask', config.value.scmMask)
    if (config.value.scmPolicy) formData.append('scmPolicy', config.value.scmPolicy)
    if (config.value.flowShift) formData.append('flowShift', config.value.flowShift.toString())
    if (config.value.extraSampleArgs) formData.append('extraSampleArgs', config.value.extraSampleArgs)
    if (config.value.extraTilingArgs) formData.append('extraTilingArgs', config.value.extraTilingArgs)
    if (config.value.disableImageMetadata) formData.append('disableImageMetadata', 'true')

    const res = await fetch(`${getApiBase()}/api/inpaint`, {
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
  window.addEventListener('resize', syncCanvasToDisplayedImage)

  const editImage = sessionStorage.getItem('editImage')
  if (editImage) {
    sessionStorage.removeItem('editImage')
    // Create a fetch to get the file for upload
    fetch(editImage)
      .then((res) => res.blob())
      .then((blob) => {
        baseImageFile.value = new File([blob], 'image.png', { type: 'image/png' })
        loadImage(editImage)
      })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', syncCanvasToDisplayedImage)
  imageResizeObserver?.disconnect()
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-muted/30 text-foreground">
    <div class="flex-1 relative min-h-0 overflow-hidden border-b border-border/60 p-2 md:p-3">
      <div
        v-if="error"
        class="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm flex items-center gap-2 z-50"
      >
        {{ error }}
        <button @click="error = null" class="hover:opacity-70">
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="mx-auto h-full w-full max-w-5xl min-h-0">
        <div
          ref="containerRef"
          class="relative flex h-full min-h-0 items-center justify-center rounded-2xl metal-surface overflow-hidden dot-grid-corners"
          @wheel="handleViewportWheel"
          @mousedown="startPanning"
          @mousemove="panViewport"
          @mouseup="stopPanning"
          @mouseleave="() => { stopDrawing(); stopPanning() }"
          @contextmenu.prevent
        >
          <div
            v-if="!baseImage"
            class="relative w-80 h-80 flex flex-col items-center justify-center text-muted-foreground gap-4 rounded-2xl overflow-hidden"
          >
            <div class="absolute inset-0 bg-gradient-to-br from-muted/20 via-transparent to-muted/10"></div>
            <div class="absolute inset-0 opacity-30">
              <div class="empty-preview-noise"></div>
            </div>
            <Brush class="w-12 h-12 opacity-30 relative z-10" />
            <div class="text-center relative z-10">
              <p class="text-xs mb-2">Drop an image here or</p>
              <label
                class="px-4 py-2 text-xs primary-metal-button text-white rounded cursor-pointer"
              >
                Upload Image
                <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
              </label>
            </div>
            <button @click="goToGallery" class="text-xs text-muted-foreground/70 hover:text-foreground relative z-10">
              Select from Gallery
            </button>
          </div>

          <div
            v-else
              class="relative inline-block max-h-full max-w-full transition-transform duration-75"
            :class="isPanning ? 'cursor-grabbing' : ''"
            :style="imageViewportStyle"
          >
            <img
              ref="imageRef"
              :src="baseImage"
              class="block max-h-full max-w-full object-contain"
              alt="Base image"
              @load="syncCanvasToDisplayedImage"
            />
            <canvas
              ref="canvasRef"
              class="absolute top-0 left-0 cursor-crosshair"
              :style="canvasDisplayStyle"
              @mousedown="startDrawing"
              @mousemove="draw"
              @mouseup="stopDrawing"
              @mouseleave="stopDrawing"
              @touchstart.prevent="startDrawing"
              @touchmove.prevent="draw"
              @touchend="stopDrawing"
            ></canvas>
          </div>

          <div v-if="baseImage" class="absolute right-3 top-3 flex items-center gap-2 rounded-lg bg-card/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
            <span>{{ Math.round(zoom * 100) }}%</span>
            <button @click="resetViewport" class="hover:text-foreground">Reset</button>
          </div>

          <div
            v-if="isGenerating"
            class="absolute inset-0 generating-halftone flex items-center justify-center"
          >
            <div class="generating-status">
              <div class="generating-loader-mark" aria-hidden="true">
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
              </div>
              <span class="generating-status-title">Blending the edit</span>
              <p class="generating-status-subtitle">Filling the masked area with your prompt.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 bg-card/70 px-3 pb-3 pt-2">
      <div class="relative overflow-visible rounded-3xl border border-border/70 bg-card/85 shadow-[0_12px_34px_rgba(130,130,255,0.14)] backdrop-blur">
        <div class="px-3 py-2 flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-2 bg-card border border-border rounded-lg px-2 py-1">
            <Brush class="w-3.5 h-3.5 text-muted-foreground" />
            <span class="text-[10px] text-muted-foreground">Brush</span>
            <input v-model.number="brushSize" type="range" min="5" max="100" class="w-20 h-1 accent-primary" />
            <span class="text-xs w-6 text-center font-mono">{{ brushSize }}</span>
          </div>

          <div class="flex items-center gap-2 bg-card border border-border rounded-lg px-2 py-1">
            <span class="text-[10px] text-muted-foreground">Strength</span>
            <input v-model.number="inpaintStrength" type="range" min="0" max="1" step="0.05" class="w-16 h-1 accent-primary" />
            <span class="text-xs w-8 text-center font-mono">{{ inpaintStrength.toFixed(2) }}</span>
          </div>

          <div class="flex-1 hidden md:block"></div>

          <button @click="clearMask" class="h-8 px-3 text-xs font-medium bg-card border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1.5">
            <Trash2 class="w-3.5 h-3.5" />
            Clear
          </button>
          <label class="h-8 px-3 text-xs font-medium bg-card border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors flex items-center gap-1.5">
            <Upload class="w-3.5 h-3.5" />
            Upload
            <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
          </label>
          <button @click="goToGallery" class="h-8 px-3 text-xs font-medium bg-card border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1.5">
            <Images class="w-3.5 h-3.5" />
            Gallery
          </button>
        </div>

        <div class="composer-shell mx-3 rounded-2xl px-3 py-3">
          <PromptPresetControls
            v-model:prompt="prompt"
            v-model:negative-prompt="negativePrompt"
            class="mb-3"
          />

          <div class="flex items-end gap-2">
            <div class="flex-1 relative">
              <textarea
                v-model="prompt"
                rows="1"
                placeholder="Describe what to generate in the masked area..."
                class="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-foreground transition-all duration-200 focus:outline-none placeholder:text-muted-foreground/50 overflow-y-auto"
                :style="{ minHeight: '68px', maxHeight: '200px' }"
                :disabled="isGenerating"
              ></textarea>
            </div>
            <div class="flex items-end pb-0.5">
              <button v-if="!isGenerating" @click="handleGenerate" :disabled="!prompt.trim() || !baseImage" class="h-10 w-10 rounded-xl primary-metal-button disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 flex items-center justify-center hover:scale-105 active:scale-95" title="Inpaint">
                <Brush class="w-5 h-5 stroke-[2.5]" />
              </button>
              <button v-else @click="handleCancel" class="h-10 w-10 rounded-xl bg-red-500/90 text-white hover:bg-red-500 transition-all duration-200 flex items-center justify-center hover:scale-105 active:scale-95" title="Cancel">
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="mt-2 border-t border-border/50 pt-2">
            <textarea v-model="negativePrompt" rows="2" placeholder="Things to avoid: blurry, low quality, distorted, bad anatomy..." class="w-full resize-none rounded-xl bg-muted/35 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50" :disabled="isGenerating"></textarea>
          </div>
        </div>

        <div class="flex items-center justify-between px-3 pb-2 pt-1">
          <span class="text-[10px] text-muted-foreground">{{ prompt.length }} chars</span>
          <span class="text-[10px] text-muted-foreground">Mask over the image to edit selected areas</span>
        </div>
      </div>
    </div>
  </div>
</template>
