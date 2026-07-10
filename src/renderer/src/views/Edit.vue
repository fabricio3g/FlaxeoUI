<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, getApiBase, getOutputUrl } from '@/services/api'
import { ArrowUp, Brush, Eraser, Images, Trash2, Upload, X } from '@/lib/icons'
import { useRouter } from 'vue-router'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useGenerationStatus } from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import { samplerOptions, schedulerOptions } from '@/lib/generationOptions'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import { appendLoraPromptTokens } from '@/lib/promptTokens'

const router = useRouter()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

// Inpainting state
const prompt = ref('')
const negativePrompt = ref('')
const editImages = ref<string[]>([])
const currentEditFilename = ref<string | null>(null)
const { isGenerating } = useGenerationStatus('edit')
const progress = useGenerationProgress()
const error = ref<string | null>(null)
const promptInput = ref<HTMLTextAreaElement | null>(null)
const isMobile = ref(false)
const promptMode = ref<'positive' | 'negative'>('positive')

const promptModeOptions = [
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' }
]

const activePrompt = computed({
  get: () => (promptMode.value === 'positive' ? prompt.value : negativePrompt.value),
  set: (value: string) => {
    if (promptMode.value === 'positive') prompt.value = value
    else negativePrompt.value = value
  }
})

// Canvas state
const baseImage = ref<string | null>(null)
const baseImageFile = ref<File | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const isDrawing = ref(false)
const isPanning = ref(false)
const brushSize = ref(30)
const maskMode = ref<'paint' | 'erase'>('paint')
const inpaintStrength = ref(0.75)
const hasMaskPaint = ref(false)
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
let imageLoadVersion = 0

function autoResize(): void {
  const el = promptInput.value
  if (!el) return

  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, isMobile.value ? 160 : 360) + 'px'
}

function onPromptKeydown(e: KeyboardEvent): void {
  if (promptMode.value === 'positive' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleGenerate()
  }
}

function setPromptMode(value: string): void {
  if (value === 'positive' || value === 'negative') promptMode.value = value
}

function handleWindowResize(): void {
  isMobile.value = window.innerWidth < 768
  syncCanvasToDisplayedImage()
}

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
  hasMaskPaint.value = false
}

function getCanvasPoint(e: PointerEvent): { x: number; y: number } | null {
  if (!canvasRef.value) return null

  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height

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
  const isErasing = maskMode.value === 'erase'
  ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over'
  ctx.fillStyle = isErasing ? '#000000' : 'rgba(239, 68, 68, 0.48)'
  ctx.beginPath()
  ctx.arc(point.x, point.y, brushWidth / 2, 0, Math.PI * 2)
  ctx.fill()
  if (!isErasing) hasMaskPaint.value = true
}

/**
 * loadImage() - Load an image into the canvas
 */
function loadImage(src: string): void {
  const loadVersion = ++imageLoadVersion
  ctx = null
  hasMaskPaint.value = false
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = async () => {
    if (loadVersion !== imageLoadVersion) return
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

async function useOutputImage(filename: string): Promise<void> {
  const url = getOutputUrl(filename)
  const response = await fetch(url)
  const blob = await response.blob()
  baseImageFile.value = new File([blob], filename, { type: blob.type || 'image/png' })
  currentEditFilename.value = filename
  loadImage(url)
}

/**
 * handleImageUpload() - Handle direct image upload
 */
function handleImageUpload(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  baseImageFile.value = file
  currentEditFilename.value = null
  const url = URL.createObjectURL(file)
  loadImage(url)
}

function removeBaseImage(): void {
  imageLoadVersion += 1
  stopDrawing()
  imageResizeObserver?.disconnect()
  imageResizeObserver = null

  if (baseImage.value?.startsWith('blob:')) URL.revokeObjectURL(baseImage.value)

  baseImage.value = null
  baseImageFile.value = null
  currentEditFilename.value = null
  imageElement = null
  ctx = null
  hasMaskPaint.value = false
  canvasDisplaySize.value = { width: 0, height: 0 }
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}

/**
 * startDrawing() - Begin mask drawing
 */
function startDrawing(e: PointerEvent): void {
  if (e.button !== 0) return
  if (!ctx) initializeMaskCanvas()

  const point = getCanvasPoint(e)
  if (!point) return

  isDrawing.value = true
  lastMaskPoint = point
  canvasRef.value?.setPointerCapture(e.pointerId)
  drawMaskPoint(point)
}

/**
 * stopDrawing() - End mask drawing
 */
function stopDrawing(e?: PointerEvent): void {
  if (e && canvasRef.value?.hasPointerCapture(e.pointerId)) {
    canvasRef.value.releasePointerCapture(e.pointerId)
  }
  isDrawing.value = false
  lastMaskPoint = null
  if (ctx) {
    ctx.beginPath()
  }
}

/**
 * draw() - Draw on the mask canvas
 */
function draw(e: PointerEvent): void {
  if (!ctx) initializeMaskCanvas()
  if (!isDrawing.value || !ctx || !canvasRef.value) return

  const samples = e.getCoalescedEvents?.() || [e]
  for (const sample of samples) {
    const point = getCanvasPoint(sample)
    if (!point) continue

    if (!lastMaskPoint) {
      lastMaskPoint = point
      drawMaskPoint(point)
      continue
    }

    const isErasing = maskMode.value === 'erase'
    ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over'
    ctx.strokeStyle = isErasing ? '#000000' : 'rgba(239, 68, 68, 0.48)'
    ctx.lineWidth = getBrushWidth()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastMaskPoint.x, lastMaskPoint.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastMaskPoint = point
    if (!isErasing) hasMaskPaint.value = true
  }
}

/**
 * clearMask() - Clear the mask canvas
 */
function clearMask(): void {
  stopDrawing()
  const canvas = canvasRef.value
  if (!canvas) {
    hasMaskPaint.value = false
    return
  }

  ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  hasMaskPaint.value = false
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
  const canvas = canvasRef.value
  if (!canvas || !hasMaskPaint.value) return null

  const sourceContext = canvas.getContext('2d')
  if (!sourceContext) return null

  // The CLI receives a conventional opaque grayscale mask: white is editable,
  // black is preserved. The visible drawing layer can remain translucent.
  const imageData = sourceContext.getImageData(0, 0, canvas.width, canvas.height)
  let containsPaint = false
  for (let index = 0; index < imageData.data.length; index += 4) {
    const painted = imageData.data[index + 3] > 8
    containsPaint ||= painted
    const value = painted ? 255 : 0
    imageData.data[index] = value
    imageData.data[index + 1] = value
    imageData.data[index + 2] = value
    imageData.data[index + 3] = 255
  }

  if (!containsPaint) {
    hasMaskPaint.value = false
    return null
  }

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = canvas.width
  maskCanvas.height = canvas.height
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext) return null
  maskContext.putImageData(imageData, 0, 0)
  return maskCanvas.toDataURL('image/png')
}

/**
 * handleGenerate() - Generate inpainted image
 */
async function handleGenerate(): Promise<void> {
  if (!prompt.value.trim() || !baseImageFile.value) return

  isGenerating.value = true
  progress.start()
  error.value = null

  try {
    const formData = new FormData()
    formData.append('prompt', appendLoraPromptTokens(prompt.value, config.value.loras))
    formData.append('negative_prompt', negativePrompt.value)
    formData.append('initImage', baseImageFile.value)
    formData.append('strength', inpaintStrength.value.toString())
    formData.append('steps', config.value.steps.toString())
    formData.append('cfg_scale', config.value.cfgScale.toString())
    formData.append('seed', config.value.seed.toString())
    formData.append('width', String(imageElement?.naturalWidth || config.value.width))
    formData.append('height', String(imageElement?.naturalHeight || config.value.height))

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
      if (config.value.highNoiseDiffusionModel)
        formData.append('highNoiseDiffusionModel', config.value.highNoiseDiffusionModel)
      if (config.value.uncondDiffusionModel)
        formData.append('uncondDiffusionModel', config.value.uncondDiffusionModel)
      if (config.value.t5xxlModel) formData.append('t5xxl', config.value.t5xxlModel)
      if (config.value.llmModel) formData.append('llm', config.value.llmModel)
      if (config.value.llmVisionModel) formData.append('llmVision', config.value.llmVisionModel)
      if (config.value.embeddingsConnectorsModel)
        formData.append('embeddingsConnectors', config.value.embeddingsConnectorsModel)
      if (config.value.clipModel) formData.append('clipL', config.value.clipModel)
      if (config.value.clipGModel) formData.append('clipG', config.value.clipGModel)
      if (config.value.clipVisionModel) formData.append('clipVision', config.value.clipVisionModel)
    }
    if (config.value.vaeModel) formData.append('vae', config.value.vaeModel)
    if (config.value.audioVaeModel) formData.append('audioVae', config.value.audioVaeModel)
    if (config.value.vaeFormat) formData.append('vaeFormat', config.value.vaeFormat)
    formData.append('samplingMethod', config.value.sampler)
    formData.append('scheduler', config.value.scheduler)
    if (config.value.imgCfgScale > 0)
      formData.append('imgCfgScale', config.value.imgCfgScale.toString())
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
    if (config.value.backendAssignment)
      formData.append('backendAssignment', config.value.backendAssignment)
    if (config.value.paramsBackendAssignment)
      formData.append('paramsBackendAssignment', config.value.paramsBackendAssignment)
    if (config.value.autoFit) formData.append('autoFit', 'true')
    if (config.value.splitMode) formData.append('splitMode', config.value.splitMode)
    if (config.value.threads > 0) formData.append('threads', config.value.threads.toString())
    if (config.value.maxVram !== 0) formData.append('maxVram', config.value.maxVram.toString())
    if (config.value.streamLayers) formData.append('streamLayers', 'true')
    if (config.value.mmap) formData.append('mmap', 'true')
    if (config.value.rngType) formData.append('rngType', config.value.rngType)
    if (config.value.samplerRngType) formData.append('samplerRngType', config.value.samplerRngType)
    if (config.value.loraApplyMode) formData.append('loraApplyMode', config.value.loraApplyMode)
    if (config.value.quantizationType)
      formData.append('quantizationType', config.value.quantizationType)
    if (config.value.predictionType) formData.append('predictionType', config.value.predictionType)
    if (config.value.cacheMode) formData.append('cacheMode', config.value.cacheMode)
    if (config.value.cacheOption) formData.append('cacheOption', config.value.cacheOption)
    if (config.value.scmMask) formData.append('scmMask', config.value.scmMask)
    if (config.value.scmPolicy) formData.append('scmPolicy', config.value.scmPolicy)
    if (config.value.flowShift) formData.append('flowShift', config.value.flowShift.toString())
    if (config.value.extraSampleArgs)
      formData.append('extraSampleArgs', config.value.extraSampleArgs)
    if (config.value.extraTilingArgs)
      formData.append('extraTilingArgs', config.value.extraTilingArgs)
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
      editImages.value = [
        result.filename,
        ...editImages.value.filter((img) => img !== result.filename)
      ]
      await useOutputImage(result.filename)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Inpainting failed'
    console.error('Inpainting error:', e)
  } finally {
    isGenerating.value = false
    progress.stop()
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
  progress.stop()
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
  handleWindowResize()
  window.addEventListener('resize', handleWindowResize)

  const editImage = sessionStorage.getItem('editImage')
  if (editImage) {
    sessionStorage.removeItem('editImage')
    // Create a fetch to get the file for upload
    fetch(editImage)
      .then((res) => res.blob())
      .then((blob) => {
        baseImageFile.value = new File([blob], 'image.png', { type: 'image/png' })
        currentEditFilename.value = null
        loadImage(editImage)
      })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  imageResizeObserver?.disconnect()
})
</script>

<template>
  <div class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <div class="relative flex-1 min-h-0 overflow-hidden p-1.5 md:p-6">
      <div
        v-if="error"
        class="absolute top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-sm"
      >
        {{ error }}
        <button @click="error = null" class="hover:opacity-70">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col">
        <div
          ref="containerRef"
          class="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden"
          @wheel="handleViewportWheel"
          @mousedown="startPanning"
          @mousemove="panViewport"
          @mouseup="stopPanning"
          @mouseleave="
            () => {
              stopDrawing()
              stopPanning()
            }
          "
          @contextmenu.prevent
        >
          <div
            v-if="!baseImage"
            class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
          >
            <div class="flex max-w-sm flex-col items-center">
              <h2 class="text-xl font-semibold tracking-tight">Start with an image</h2>
              <p class="mt-1 text-sm text-muted-foreground">Choose a source image to edit or paint a mask over.</p>
              <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                <label
                  class="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  Upload Image
                  <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
                </label>
                <button
                  type="button"
                  @click="goToGallery"
                  class="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Images class="h-3.5 w-3.5" />
                  Select from Gallery
                </button>
              </div>
            </div>
          </div>

          <div
            v-else
            class="animate-in fade-in duration-200 relative inline-block max-h-full max-w-full transition-transform duration-75"
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
              :class="maskMode === 'erase' ? 'cursor-cell' : ''"
              :style="canvasDisplayStyle"
              @pointerdown.prevent="startDrawing"
              @pointermove.prevent="draw"
              @pointerup="stopDrawing"
              @pointercancel="stopDrawing"
              @lostpointercapture="stopDrawing"
            ></canvas>
          </div>

          <div
            v-if="baseImage"
            class="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-background/80 p-0.5 shadow-sm backdrop-blur"
          >
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Remove source image"
              @click="removeBaseImage"
            >
              <X class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Clear mask"
              @click="clearMask"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
            <label
              class="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40"
              title="Replace image"
            >
              <Upload class="h-3.5 w-3.5" />
              <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
            </label>
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Select from gallery"
              @click="goToGallery"
            >
              <Images class="h-3.5 w-3.5" />
            </button>
            <span class="mx-1 h-5 w-px bg-border" aria-hidden="true"></span>
            <span class="px-1 text-xs text-muted-foreground">{{ Math.round(zoom * 100) }}%</span>
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              @click="resetViewport"
            >
              Reset
            </button>
          </div>
        </div>

        <GenerationProgressPill
          v-if="isGenerating"
          class="mt-2"
          loading-text="Loading model"
          fallback-label="INPAINT"
        />

        <div v-if="editImages.length > 0" class="mt-4 w-full shrink-0">
          <div class="mb-2 flex items-center justify-between px-1">
            <h3
              class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <Images class="h-3.5 w-3.5" /> Recent edits ({{ editImages.length }})
            </h3>
          </div>
          <div class="relative rounded-lg border border-border bg-card p-2">
            <div class="flex gap-2 overflow-x-auto p-1 snap-x scroll-smooth no-scrollbar md:gap-3">
              <button
                v-for="img in editImages"
                :key="img"
                class="relative h-16 w-16 shrink-0 snap-start overflow-hidden rounded-md border border-transparent transition-all md:h-20 md:w-20 focus:outline-none focus:ring-2 focus:ring-ring/40 hover:opacity-100"
                :class="
                  currentEditFilename === img ? 'border-foreground/80 ring-2 ring-ring/40 z-10' : 'opacity-70'
                "
                @click="useOutputImage(img)"
              >
                <img
                  :src="getOutputUrl(img)"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  :alt="img"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3 pt-2 md:px-8 md:pb-6 md:pt-3">
      <div class="relative mx-auto flex w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring/40">
        <!-- Top inline row: Positive/Negative + Brush/Strength controls -->
        <div class="flex flex-nowrap items-center gap-1 overflow-visible whitespace-nowrap px-2 pt-2 text-xs md:px-3 md:pt-3">
          <SegmentedControl
            :model-value="promptMode"
            :options="promptModeOptions"
            size="sm"
            aria-label="Prompt mode"
            @update:model-value="setPromptMode"
          />
          <div class="flex shrink-0 items-center gap-1 pl-1">
            <button
              type="button"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none"
              :class="maskMode === 'erase' ? 'bg-foreground text-background' : ''"
              :aria-pressed="maskMode === 'erase'"
              :title="maskMode === 'erase' ? 'Switch to mask paint' : 'Switch to mask erase'"
              @click="maskMode = maskMode === 'paint' ? 'erase' : 'paint'"
            >
              <Eraser v-if="maskMode === 'erase'" class="h-3.5 w-3.5" />
              <Brush v-else class="h-3.5 w-3.5" />
            </button>
            <label class="flex items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-muted">
              <span class="text-muted-foreground">Brush</span>
              <input
                v-model.number="brushSize"
                type="range"
                min="5"
                max="100"
                class="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
              />
            </label>
            <label class="flex items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-muted">
              <span class="text-muted-foreground">Strength</span>
              <input
                v-model.number="inpaintStrength"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
              />
            </label>
          </div>
        </div>

        <!-- Textarea + send/cancel -->
        <div class="flex items-end gap-2 px-2 pt-1.5 pb-2 md:px-3">
          <div class="relative flex-1">
            <textarea
              v-model="activePrompt"
              ref="promptInput"
              rows="1"
              :placeholder="
                promptMode === 'positive'
                  ? 'Describe what to generate in the masked area...'
                  : 'Describe what to avoid in the masked area...'
              "
              class="flex w-full resize-none rounded-md border-0 bg-transparent px-3 py-2.5 pr-14 text-[15px] leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:px-4 md:py-3 overflow-y-auto"
              :style="{
                minHeight: isMobile ? '72px' : '88px',
                maxHeight: isMobile ? '160px' : '220px'
              }"
              :disabled="isGenerating"
              @keydown="onPromptKeydown"
              @input="autoResize"
            ></textarea>
            <div class="absolute bottom-3 right-3 flex items-end">
              <button
                v-if="!isGenerating"
                @click="handleGenerate"
                :disabled="promptMode !== 'positive' || !prompt.trim() || !baseImage"
                class="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="Inpaint"
                aria-label="Inpaint"
              >
                <ArrowUp class="size-3.5 stroke-[2.5]" />
              </button>
              <button
                v-else
                @click="handleCancel"
                class="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-foreground transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="Cancel"
                aria-label="Cancel generation"
              >
                <X class="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Controls (Steps, CFG, Seed, Scheduler, Sampler, PromptPresets) below -->
        <div
          class="flex flex-nowrap items-center gap-1 overflow-visible whitespace-nowrap px-3 pb-2 text-xs"
        >
          <div class="h-5 w-px shrink-0 bg-border"></div>
          <div class="flex shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Steps</span>
            <input
              v-model.number="config.steps"
              type="number"
              min="1"
              max="150"
              aria-label="Steps"
              class="h-6 w-12 bg-transparent text-foreground focus:outline-none"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">CFG</span>
            <input
              v-model.number="config.cfgScale"
              type="number"
              min="0"
              max="30"
              step="0.5"
              aria-label="CFG scale"
              class="h-6 w-12 bg-transparent text-foreground focus:outline-none"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Seed</span>
            <input
              v-model.number="config.seed"
              type="number"
              min="-1"
              aria-label="Seed"
              title="Use -1 for a random seed"
              class="h-6 w-16 bg-transparent text-foreground focus:outline-none"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Scheduler</span>
            <Select
              v-model="config.scheduler"
              size="sm"
              aria-label="Scheduler"
              class="border-0 bg-transparent"
              :options="schedulerOptions"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Sampler</span>
            <Select
              v-model="config.sampler"
              size="sm"
              aria-label="Sampler"
              class="border-0 bg-transparent"
              :options="samplerOptions"
            />
          </div>

          <div class="h-5 w-px shrink-0 bg-border"></div>
          <PromptPresetControls
            v-model:prompt="prompt"
            v-model:negative-prompt="negativePrompt"
            compact
            class="shrink-0"
          />
        </div>
      </div>
    </div>
  </div>
</template>
