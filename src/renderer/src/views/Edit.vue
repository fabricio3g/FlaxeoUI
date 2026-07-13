<script setup lang="ts">
import { ref, onMounted, onUnmounted, onActivated, computed, nextTick, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { authenticatedFetch, getOutputUrl } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { buildGenerationPayload, type GenerationPayload } from '@/lib/generationPayload'
import { pickConfigSnapshot } from '@/lib/configSnapshot'
import {
  ArrowUp,
  Brush,
  Eraser,
  Images,
  Loader2,
  Plus,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  X
} from '@/lib/icons'
import { useRouter } from 'vue-router'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import BrandMark from '@/components/BrandMark.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  isAnyGenerationBusy,
  toastGenerationError,
  useGenerationStatus
} from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import { useJobQueue, type FormPart } from '@/composables/useJobQueue'
import { samplerOptions, schedulerOptions } from '@/lib/generationOptions'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import { useGenerationHistory } from '@/composables/useGenerationHistory'

const router = useRouter()
const toast = useToast()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

type EditMode = 'inpaint' | 'ref' | 'img2img'

// Edit workspace state
const prompt = ref('')
const negativePrompt = ref('')
const editImages = ref<string[]>([])
const currentEditFilename = ref<string | null>(null)
const { isGenerating } = useGenerationStatus('edit')
const progress = useGenerationProgress()
const { addEntry: addHistoryEntry } = useGenerationHistory()
const { enqueue, cancelCurrent, pendingCount } = useJobQueue()
const error = ref<string | null>(null)

function payloadToFormParts(payload: GenerationPayload): FormPart[] {
  const parts: FormPart[] = []
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'object') {
      parts.push({ name: key, type: 'text', value: JSON.stringify(value) })
      continue
    }
    if (value === '' && key !== 'prompt' && key !== 'negative_prompt') continue
    parts.push({ name: key, type: 'text', value: String(value) })
  }
  return parts
}
const promptInput = ref<HTMLTextAreaElement | null>(null)
const isMobile = ref(false)
const promptMode = ref<'positive' | 'negative'>('positive')
const editMode = ref<EditMode>('inpaint')

const promptModeOptions = [
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' }
]

const editModeOptions = [
  { value: 'inpaint', label: 'Inpaint' },
  { value: 'ref', label: 'Ref Edit' },
  { value: 'img2img', label: 'Img2Img' }
]

/** Multi-ref chips for Kontext / Qwen Image Edit */
interface RefChip {
  id: string
  url: string
  file: File
}
const refChips = ref<RefChip[]>([])
const showQwenZeroCondTip = computed(() => config.value.qwenImageZeroCondT)

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
  // Enter generates from either tab — both prompts are shared in the payload
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleGenerate()
  }
}

function setPromptMode(value: string): void {
  if (value === 'positive' || value === 'negative') promptMode.value = value
}

function setEditMode(value: string): void {
  if (value === 'inpaint' || value === 'ref' || value === 'img2img') editMode.value = value
}

watch(editMode, async (mode) => {
  if (mode === 'inpaint' && baseImage.value && imageElement) {
    await nextTick()
    initializeMaskCanvas()
    syncCanvasToDisplayedImage()
  }
})

function handleRefUpload(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  for (const file of Array.from(files)) {
    refChips.value.push({
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: URL.createObjectURL(file),
      file
    })
  }
  input.value = ''
}

function removeRefChip(id: string): void {
  const chip = refChips.value.find((c) => c.id === id)
  if (chip) URL.revokeObjectURL(chip.url)
  refChips.value = refChips.value.filter((c) => c.id !== id)
}

function clearRefChips(): void {
  for (const chip of refChips.value) URL.revokeObjectURL(chip.url)
  refChips.value = []
}

/** Promote current base image into the multi-ref list (Kontext/Qwen workflows). */
async function addBaseAsRef(): Promise<void> {
  if (!baseImageFile.value) return
  refChips.value.push({
    id: `ref-${Date.now()}-base`,
    url: baseImage.value || URL.createObjectURL(baseImageFile.value),
    file: baseImageFile.value
  })
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
  const response = await authenticatedFetch(url)
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
 * handleGenerate() - Snapshot + enqueue edit job
 */
async function handleGenerate(): Promise<void> {
  if (!prompt.value.trim()) return

  if (editMode.value === 'ref') {
    if (!refChips.value.length && !baseImageFile.value) {
      error.value = 'Add at least one reference image for Ref Edit'
      toast.error(error.value)
      return
    }
  } else if (!baseImageFile.value) {
    error.value = 'Load a source image first'
    toast.error(error.value)
    return
  }

  const snapshot = pickConfigSnapshot(config.value)
  const promptSnap = prompt.value
  const negSnap = negativePrompt.value
  const seedSnap = config.value.seed
  const payload = buildGenerationPayload(config.value, {
    prompt: promptSnap,
    negativePrompt: negSnap,
    width: imageElement?.naturalWidth || config.value.width,
    height: imageElement?.naturalHeight || config.value.height,
    extra: {
      strength: inpaintStrength.value,
      img2imgStrength: inpaintStrength.value
    }
  })

  let endpoint = '/api/inpaint'
  const formParts = payloadToFormParts(payload)

  if (editMode.value === 'inpaint') {
    formParts.push({ name: 'initImage', type: 'file', file: baseImageFile.value! })
    formParts.push({ name: 'strength', type: 'text', value: String(inpaintStrength.value) })
    const maskDataUrl = getMaskDataUrl()
    if (maskDataUrl && maskDataUrl !== 'data:,') {
      const response = await fetch(maskDataUrl)
      const blob = await response.blob()
      formParts.push({
        name: 'mask',
        type: 'file',
        file: new File([blob], 'mask.png', { type: 'image/png' })
      })
    }
    endpoint = '/api/inpaint'
  } else if (editMode.value === 'img2img') {
    formParts.push({ name: 'initImage', type: 'file', file: baseImageFile.value! })
    formParts.push({
      name: 'img2imgStrength',
      type: 'text',
      value: String(inpaintStrength.value)
    })
    formParts.push({ name: 'strength', type: 'text', value: String(inpaintStrength.value) })
    endpoint = '/api/generate-cli'
  } else {
    const refs =
      refChips.value.length > 0
        ? refChips.value
        : baseImageFile.value
          ? [{ id: 'base', url: baseImage.value || '', file: baseImageFile.value }]
          : []
    for (const chip of refs) {
      formParts.push({ name: 'kontextRefImage', type: 'file', file: chip.file })
    }
    endpoint = '/api/generate-cli'
  }

  const busy = isAnyGenerationBusy()
  error.value = null

  enqueue({
    surface: 'edit',
    label: promptSnap,
    prompt: promptSnap,
    negativePrompt: negSnap,
    seed: seedSnap,
    configSnapshot: snapshot,
    kind: 'form',
    endpoint,
    formParts,
    onStart: () => progress.start(),
    onSuccess: async (result) => {
      const filename = result.filename || result.filenames?.[0]
      if (filename) {
        editImages.value = [filename, ...editImages.value.filter((img) => img !== filename)]
        await useOutputImage(filename)
        toast.success('Edit complete')
        addHistoryEntry({
          surface: 'edit',
          status: 'success',
          prompt: promptSnap,
          negativePrompt: negSnap,
          seed: seedSnap,
          filename,
          configSnapshot: snapshot
        })
      }
    },
    onError: (msg) => {
      if (msg === 'Cancelled') {
        toast.warning('Edit cancelled')
        return
      }
      error.value = msg
      toastGenerationError(toast, msg, 'Edit failed')
      addHistoryEntry({
        surface: 'edit',
        status: 'failed',
        prompt: promptSnap,
        error: msg,
        configSnapshot: snapshot
      })
    },
    onSettled: () => progress.stop()
  })

  if (busy) toast.info(`Queued · ${pendingCount.value} waiting`)
}

async function handleCancel(): Promise<void> {
  await cancelCurrent()
  toast.warning('Cancelling current job…')
  progress.stop()
}

/**
 * goToGallery() - Open gallery to select an image
 */
function goToGallery(): void {
  router.push({ name: 'Gallery' })
}

/**
 * consumeGalleryHandoff() - Reads the gallery handoff payload and loads it
 */
function consumeGalleryHandoff(): void {
  const editImage = sessionStorage.getItem('editImage')
  if (!editImage) return

  sessionStorage.removeItem('editImage')
  // Create a fetch to get the file for upload
  authenticatedFetch(editImage)
    .then((res) => res.blob())
    .then((blob) => {
      baseImageFile.value = new File([blob], 'image.png', { type: 'image/png' })
      currentEditFilename.value = null
      loadImage(editImage)
    })
    .catch((e) => {
      console.error('Failed to load image from gallery:', e)
    })
}

// Check for image from gallery on mount
onMounted(() => {
  handleWindowResize()
  window.addEventListener('resize', handleWindowResize)
  consumeGalleryHandoff()
})

onActivated(() => {
  consumeGalleryHandoff()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  imageResizeObserver?.disconnect()
})
</script>

<template>
  <div
    class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <div class="relative min-h-0 flex-1 overflow-hidden px-3 pt-3 md:px-6 md:pt-6">
      <div
        v-if="error"
        class="aui-alert fade-in slide-in-from-top-1 animate-in absolute left-1/2 top-4 z-50 flex max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-destructive/20 bg-background/95 px-4 py-3 text-sm text-destructive shadow-[0_2px_4px_rgb(0_0_0/0.05),0_12px_32px_rgb(0_0_0/0.1)] backdrop-blur-xl duration-200"
      >
        {{ error }}
        <button
          class="aui-icon-button -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-destructive/10"
          aria-label="Dismiss error"
          @click="error = null"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mx-auto flex h-full min-h-0 w-full max-w-[90rem] flex-col">
        <div
          ref="containerRef"
          class="group/canvas relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-border/60 bg-background/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_1px_2px_rgb(0_0_0/0.03)]"
          :class="
            !baseImage && !isGenerating ? 'border-transparent bg-transparent shadow-none' : ''
          "
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
            v-if="!baseImage && !(editMode === 'ref' && refChips.length)"
            class="fade-in slide-in-from-bottom-1 animate-in absolute inset-0 flex flex-col items-center justify-center px-6 text-center duration-200"
          >
            <div class="content-item flex max-w-sm flex-col items-center">
              <BrandMark size="lg" class="text-foreground" />
              <h2 class="mt-5 text-xl font-light tracking-[-0.03em]">
                {{
                  editMode === 'ref'
                    ? 'Add reference images'
                    : editMode === 'img2img'
                      ? 'Start with a source image'
                      : 'Start with an image'
                }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-muted-foreground">
                {{
                  editMode === 'ref'
                    ? 'Kontext / Qwen Image Edit use one or more reference images with your prompt.'
                    : editMode === 'img2img'
                      ? 'Upload a source image, set strength, and describe the transformation.'
                      : 'Choose a source image, then paint the area you want to transform.'
                }}
              </p>
              <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                <label
                  class="inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-[#0d0d0d] shadow-sm transition-all duration-150 hover:bg-white/90 focus-within:outline-none focus-within:ring-2 focus-within:ring-white/40"
                >
                  {{ editMode === 'ref' ? 'Upload references' : 'Upload Image' }}
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    :multiple="editMode === 'ref'"
                    @change="
                      editMode === 'ref' ? handleRefUpload($event) : handleImageUpload($event)
                    "
                  />
                </label>
                <button
                  type="button"
                  @click="goToGallery"
                  class="inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-background px-4 text-sm font-medium transition-all duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Images class="h-3.5 w-3.5" />
                  Select from Gallery
                </button>
              </div>
            </div>
          </div>

          <div
            v-else-if="baseImage"
            class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both relative inline-block max-h-full max-w-full transition-transform duration-200"
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
              v-if="editMode === 'inpaint'"
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
            v-else-if="editMode === 'ref' && refChips.length"
            class="fade-in flex max-h-full max-w-full flex-wrap items-center justify-center gap-3 p-4"
          >
            <div
              v-for="chip in refChips"
              :key="chip.id"
              class="relative size-40 overflow-hidden rounded-2xl border border-border/70 shadow-sm md:size-52"
            >
              <img :src="chip.url" class="h-full w-full object-cover" :alt="chip.file.name" />
            </div>
          </div>

          <div
            v-if="isGenerating"
            class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/45 backdrop-blur-[2px]"
          >
            <div
              class="aui-status-badge fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3.5 py-2 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl duration-200"
            >
              <Loader2 class="size-4 animate-spin text-muted-foreground" />
              <span class="font-medium text-foreground">
                {{
                  editMode === 'ref'
                    ? 'Editing with references'
                    : editMode === 'img2img'
                      ? 'Transforming image'
                      : 'Inpainting image'
                }}
              </span>
            </div>
          </div>

          <div
            v-if="baseImage"
            class="fade-in slide-in-from-top-1 animate-in absolute right-3 top-3 flex items-center gap-0.5 rounded-full border border-border/70 bg-background/85 p-1 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl duration-200"
          >
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Remove source image"
              @click="removeBaseImage"
            >
              <X class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Clear mask"
              @click="clearMask"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
            <label
              class="aui-icon-button inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40"
              title="Replace image"
            >
              <Upload class="h-3.5 w-3.5" />
              <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
            </label>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Select from gallery"
              @click="goToGallery"
            >
              <Images class="h-3.5 w-3.5" />
            </button>
            <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true"></span>
            <span class="px-1 text-[11px] tabular-nums text-muted-foreground"
              >{{ Math.round(zoom * 100) }}%</span
            >
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              @click="resetViewport"
            >
              Reset
            </button>
          </div>
        </div>

        <GenerationProgressPill
          v-if="isGenerating"
          class="mt-2 self-center"
          loading-text="Loading model"
          :fallback-label="
            editMode === 'ref' ? 'Ref edit' : editMode === 'img2img' ? 'Img2Img' : 'Inpaint'
          "
        />

        <div v-if="editImages.length > 0" class="mt-3 w-full shrink-0">
          <div class="mb-1.5 flex items-center justify-between px-2">
            <h3
              class="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground"
            >
              <Images class="h-3.5 w-3.5" /> Recent edits ({{ editImages.length }})
            </h3>
          </div>
          <div
            class="aui-media-strip relative rounded-[18px] border border-border/60 bg-background/60 p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.03)]"
          >
            <div class="no-scrollbar flex snap-x gap-2 overflow-x-auto scroll-smooth p-0.5">
              <button
                v-for="img in editImages"
                :key="img"
                class="relative size-14 shrink-0 snap-start overflow-hidden rounded-xl border border-transparent transition-all duration-150 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40 md:size-16"
                :class="
                  currentEditFilename === img
                    ? 'border-foreground/80 ring-2 ring-ring/40 z-10'
                    : 'opacity-70'
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
      <div
        class="aui-composer flaxeo-composer relative mx-auto flex w-full max-w-4xl flex-col overflow-visible"
      >
        <!-- Top inline row: modes + tools -->
        <div class="flex flex-wrap items-center gap-2 px-3 pt-3 text-xs md:px-4">
          <SegmentedControl
            :model-value="editMode"
            :options="editModeOptions"
            size="sm"
            aria-label="Edit mode"
            @update:model-value="setEditMode"
          />
          <SegmentedControl
            :model-value="promptMode"
            :options="promptModeOptions"
            size="md"
            aria-label="Prompt mode"
            @update:model-value="setPromptMode"
          />
          <div v-if="editMode === 'inpaint'" class="flex shrink-0 items-center gap-1 pl-0.5">
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all duration-150 hover:border-border hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="
                maskMode === 'erase'
                  ? 'border-foreground bg-foreground text-background shadow-sm'
                  : ''
              "
              :aria-pressed="maskMode === 'erase'"
              :title="maskMode === 'erase' ? 'Switch to mask paint' : 'Switch to mask erase'"
              @click="maskMode = maskMode === 'paint' ? 'erase' : 'paint'"
            >
              <Eraser v-if="maskMode === 'erase'" class="h-3.5 w-3.5" />
              <Brush v-else class="h-3.5 w-3.5" />
            </button>
            <label
              class="flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
            >
              <span class="text-muted-foreground">Brush</span>
              <input
                v-model.number="brushSize"
                type="range"
                min="5"
                max="100"
                class="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
              />
            </label>
            <label
              class="flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
            >
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
          <label
            v-else-if="editMode === 'img2img'"
            class="flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
          >
            <span class="text-muted-foreground">Strength</span>
            <input
              v-model.number="inpaintStrength"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
            />
            <span class="tabular-nums text-muted-foreground">{{ inpaintStrength.toFixed(2) }}</span>
          </label>
          <p
            v-if="showQwenZeroCondTip"
            class="w-full text-[10px] text-muted-foreground md:w-auto"
            title="Required for Qwen Image Edit 2511 quality"
          >
            Qwen zero-cond-t is on (Edit 2511)
          </p>
        </div>

        <!-- Multi-ref chips (Ref Edit) -->
        <div v-if="editMode === 'ref'" class="flex flex-wrap items-center gap-2 px-3 pb-1 md:px-4">
          <div
            v-for="chip in refChips"
            :key="chip.id"
            class="aui-media-strip inline-flex max-w-full items-center gap-2 rounded-2xl border border-border/70 bg-muted/40 p-1.5"
          >
            <div
              class="relative size-10 shrink-0 overflow-hidden rounded-xl border border-border bg-background"
            >
              <img :src="chip.url" class="h-full w-full object-cover" />
            </div>
            <button
              type="button"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              @click="removeRefChip(chip.id)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
          <label
            class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground"
          >
            <Plus class="h-3.5 w-3.5" />
            Add ref
            <input type="file" accept="image/*" multiple class="hidden" @change="handleRefUpload" />
          </label>
          <button
            v-if="baseImageFile"
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            @click="addBaseAsRef"
          >
            Use source as ref
          </button>
          <button
            v-if="refChips.length"
            type="button"
            class="inline-flex h-8 items-center rounded-full px-2 text-xs text-muted-foreground hover:text-destructive"
            @click="clearRefChips"
          >
            Clear refs
          </button>
        </div>

        <!-- Textarea + send/cancel -->
        <div class="flex items-end gap-2 px-3 pb-2 pt-1 md:px-4">
          <div class="relative flex-1">
            <textarea
              v-model="activePrompt"
              ref="promptInput"
              rows="1"
              :placeholder="
                promptMode === 'positive'
                  ? editMode === 'ref'
                    ? 'Describe the edit relative to the reference images...'
                    : editMode === 'img2img'
                      ? 'Describe how to transform the image...'
                      : 'Describe what to generate in the masked area...'
                  : 'Describe what to avoid...'
              "
              class="flex w-full resize-none overflow-y-auto rounded-2xl border-0 bg-transparent px-1 py-3 text-base leading-7 text-foreground outline-none transition-colors placeholder:text-transparent focus:outline-none focus-visible:outline-none md:py-3.5 md:text-[17px] md:leading-7"
              :style="{
                minHeight: isMobile ? '72px' : '88px',
                maxHeight: isMobile ? '160px' : '220px'
              }"
              @keydown="onPromptKeydown"
              @input="autoResize"
            ></textarea>
            <span
              v-if="!activePrompt || activePrompt.trim().length === 0"
              class="shimmer-text pointer-events-none absolute inset-0 px-1 py-3 text-base leading-7 md:py-3.5 md:text-[17px] md:leading-7"
              aria-hidden="true"
              >{{
                promptMode === 'positive'
                  ? editMode === 'ref'
                    ? 'Describe the edit relative to the reference images...'
                    : editMode === 'img2img'
                      ? 'Describe how to transform the image...'
                      : 'Describe what to generate in the masked area...'
                  : 'Describe what to avoid...'
              }}</span
            >
          </div>
        </div>

        <!-- Quick Controls (Steps, CFG, Seed, Scheduler, Sampler, PromptPresets) below -->
        <div class="flex items-center gap-1 rounded-b-[2rem] px-3 py-2 text-xs md:px-4">
          <div class="ml-auto flex shrink-0 items-center gap-1">
            <PromptPresetControls
              v-model:prompt="prompt"
              v-model:negative-prompt="negativePrompt"
              compact
              class="shrink-0"
            />

            <Popover>
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="aui-icon-button inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all duration-150 hover:border-border hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="Inpaint settings"
                  title="Inpaint settings"
                >
                  <SlidersHorizontal class="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" :side-offset="8" class="w-72 p-3">
                <div class="mb-3">
                  <p class="text-sm font-medium">Inpaint settings</p>
                  <p class="mt-0.5 text-[11px] text-muted-foreground">Sampling and seed controls</p>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <label class="text-[10px] font-medium text-muted-foreground">
                    Steps
                    <input
                      v-model.number="config.steps"
                      type="number"
                      min="1"
                      max="150"
                      class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
                    />
                  </label>
                  <label class="text-[10px] font-medium text-muted-foreground">
                    CFG
                    <input
                      v-model.number="config.cfgScale"
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
                    />
                  </label>
                  <label class="text-[10px] font-medium text-muted-foreground">
                    Seed
                    <input
                      v-model.number="config.seed"
                      type="number"
                      min="-1"
                      title="Use -1 for a random seed"
                      class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
                    />
                  </label>
                </div>

                <div class="mt-3 space-y-2">
                  <label class="block text-[10px] font-medium text-muted-foreground">
                    Scheduler
                    <Select
                      v-model="config.scheduler"
                      size="sm"
                      aria-label="Scheduler"
                      class="mt-1"
                      :options="schedulerOptions"
                    />
                  </label>
                  <label class="block text-[10px] font-medium text-muted-foreground">
                    Sampler
                    <Select
                      v-model="config.sampler"
                      size="sm"
                      aria-label="Sampler"
                      class="mt-1"
                      :options="samplerOptions"
                    />
                  </label>
                </div>
              </PopoverContent>
            </Popover>

            <div class="flex shrink-0 items-center gap-1.5">
              <button
                v-if="isGenerating"
                type="button"
                @click="handleCancel"
                class="aui-icon-button inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-colors hover:bg-muted active:scale-95 focus-visible:outline-none"
                title="Cancel current job"
                aria-label="Cancel current job"
              >
                <Square class="size-3.5 fill-current" />
              </button>
              <button
                type="button"
                @click="handleGenerate"
                :disabled="!prompt.trim() || !baseImage"
                class="aui-icon-button inline-flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none"
                :title="isGenerating ? 'Add to queue' : 'Generate'"
                :aria-label="isGenerating ? 'Add to queue' : 'Generate edit'"
              >
                <ArrowUp class="size-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
