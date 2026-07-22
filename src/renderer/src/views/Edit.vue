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
  ChevronDown,
  ChevronUp,
  Crop,
  Eraser,
  Images,
  Loader2,
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
import Tooltip from '@/components/ui/Tooltip.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import RefSizePrompt from '@/components/RefSizePrompt.vue'
import ImageCropResizeDialog from '@/components/ImageCropResizeDialog.vue'
import {
  isAnyGenerationBusy,
  toastGenerationError,
  useGenerationStatus
} from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import { useJobQueue, type FormPart } from '@/composables/useJobQueue'
import { samplerOptions, schedulerOptions } from '@/lib/generationOptions'
import { resolutionPresets } from '@/lib/resolutionPresets'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import { useGenerationHistory } from '@/composables/useGenerationHistory'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import { readImageNaturalSize, useRefEditSizePrefs } from '@/composables/useRefEditSizePrefs'
import { LIVE_PREVIEW_METHOD_OPTIONS, useLivePreview } from '@/composables/useLivePreview'
import { REF_IMAGE_PRESET_OPTIONS, resolveRefImagePreset } from '../../../shared/refImageArgs'

const router = useRouter()
const toast = useToast()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { supportsRefImageArgs, refImageCliFlag, fetchCapabilities } = useBackendCapabilities()
const { refEditSizeMode, refSizePromptDisabled, setRefEditSizeMode, setRefSizePromptDisabled } =
  useRefEditSizePrefs()

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
const {
  previewImage,
  isLivePreview,
  startPreviewPolling,
  stopPreviewPolling,
  discardLivePreview,
  setFinalPreview
} = useLivePreview()

/** Show live/final preview over source/mask while generating or when a result frame is sticky. */
const showPreviewHero = computed(
  () => !!previewImage.value && (isLivePreview.value || isGenerating.value)
)

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
const showResolutionMenu = ref(false)

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

/** Ref Edit + Img2Img can choose studio W×H; Inpaint always follows source. */
const freeSizeMode = computed(() => editMode.value === 'ref' || editMode.value === 'img2img')

const matchSizeLabel = computed(() => (editMode.value === 'img2img' ? 'Match source' : 'Match ref'))

/** Effective output label: studio config or following image when match_ref. */
const generationStripLabel = computed(() => {
  const sizePart =
    refEditSizeMode.value === 'match_ref'
      ? effectiveMatchRefSize.value
        ? `${effectiveMatchRefSize.value.width}×${effectiveMatchRefSize.value.height} · ${
            editMode.value === 'img2img' ? 'src' : 'ref'
          }`
        : editMode.value === 'img2img'
          ? 'match source'
          : 'match ref'
      : `${config.value.width}×${config.value.height}`
  return `${config.value.steps} steps · ${sizePart}`
})

/** Cached natural size of first ref / base for strip + payload when match_ref. */
const effectiveMatchRefSize = ref<{ width: number; height: number } | null>(null)

async function refreshMatchRefSize(): Promise<void> {
  // Img2Img: base only. Ref Edit: first ref, then base fallback.
  const file =
    editMode.value === 'img2img'
      ? baseImageFile.value
      : refChips.value[0]?.file || baseImageFile.value
  if (!file) {
    if (imageElement?.naturalWidth && imageElement?.naturalHeight) {
      effectiveMatchRefSize.value = {
        width: imageElement.naturalWidth,
        height: imageElement.naturalHeight
      }
      return
    }
    effectiveMatchRefSize.value = null
    return
  }
  try {
    effectiveMatchRefSize.value = await readImageNaturalSize(file)
  } catch {
    effectiveMatchRefSize.value = null
  }
}

function selectResolution(preset: (typeof resolutionPresets)[number]): void {
  setRefEditSizeMode('studio')
  configStore.setDimensions(preset.width, preset.height)
  showResolutionMenu.value = false
}

function onMatchRefSizeClick(): void {
  setRefEditSizeMode('match_ref')
  void refreshMatchRefSize()
}

function applyCustomResolution(): void {
  setRefEditSizeMode('studio')
  configStore.setDimensions(
    Math.max(64, Number(config.value.width) || 1024),
    Math.max(64, Number(config.value.height) || 1024)
  )
  showResolutionMenu.value = false
}

/** Copy natural size from first ref/base into config W×H and switch to studio mode. */
async function matchRefResolution(): Promise<void> {
  const file =
    editMode.value === 'img2img'
      ? baseImageFile.value
      : refChips.value[0]?.file || baseImageFile.value
  try {
    if (file) {
      const size = await readImageNaturalSize(file)
      setRefEditSizeMode('studio')
      configStore.setDimensions(size.width, size.height)
      effectiveMatchRefSize.value = size
      showResolutionMenu.value = false
      return
    }
    if (imageElement?.naturalWidth && imageElement?.naturalHeight) {
      setRefEditSizeMode('studio')
      configStore.setDimensions(imageElement.naturalWidth, imageElement.naturalHeight)
      showResolutionMenu.value = false
      return
    }
    toast.error(
      editMode.value === 'img2img'
        ? 'Load a source image first'
        : 'Add a reference or source image first'
    )
  } catch {
    toast.error('Could not read image dimensions')
  }
}

// --- Size prompt + crop editor (Ref Edit + Img2Img) ---
const sizePrompt = ref<{
  open: boolean
  target: 'ref' | 'base'
  chipId?: string
  imageWidth: number
  imageHeight: number
} | null>(null)

const cropEditor = ref<{
  open: boolean
  target: 'ref' | 'base'
  chipId?: string
  imageUrl: string
} | null>(null)

const sizePromptDontAsk = ref(false)

async function maybePromptImageSize(
  source: { target: 'ref'; chip: RefChip } | { target: 'base'; file: File }
): Promise<void> {
  if (!freeSizeMode.value) return
  if (refEditSizeMode.value === 'match_ref') {
    await refreshMatchRefSize()
    return
  }
  if (refSizePromptDisabled.value) return
  try {
    const file = source.target === 'ref' ? source.chip.file : source.file
    const size = await readImageNaturalSize(file)
    if (size.width === config.value.width && size.height === config.value.height) {
      return
    }
    sizePrompt.value = {
      open: true,
      target: source.target,
      chipId: source.target === 'ref' ? source.chip.id : undefined,
      imageWidth: size.width,
      imageHeight: size.height
    }
  } catch {
    /* ignore unreadable files */
  }
}

/** @deprecated path — ref chips still call maybePromptImageSize via wrapper */
async function maybePromptRefSize(chip: RefChip): Promise<void> {
  await maybePromptImageSize({ target: 'ref', chip })
}

function closeSizePrompt(): void {
  if (sizePromptDontAsk.value) setRefSizePromptDisabled(true)
  sizePrompt.value = null
  sizePromptDontAsk.value = false
}

function onSizePromptUseImage(): void {
  if (!sizePrompt.value) return
  setRefEditSizeMode('studio')
  configStore.setDimensions(sizePrompt.value.imageWidth, sizePrompt.value.imageHeight)
  closeSizePrompt()
}

function onSizePromptKeep(): void {
  closeSizePrompt()
}

function onSizePromptFit(): void {
  if (!sizePrompt.value) return
  const prompt = sizePrompt.value
  closeSizePrompt()
  if (prompt.target === 'base') {
    openCropEditorBase()
    return
  }
  if (prompt.chipId) openCropEditor(prompt.chipId)
}

function openCropEditor(chipId: string): void {
  const chip = refChips.value.find((c) => c.id === chipId)
  if (!chip) {
    toast.error('Reference not found')
    return
  }
  cropEditor.value = {
    open: true,
    target: 'ref',
    chipId: chip.id,
    imageUrl: chip.url
  }
  showResolutionMenu.value = false
}

function openCropEditorFirstRef(): void {
  const chip = refChips.value[0]
  if (!chip) {
    toast.error('Add a reference first')
    return
  }
  openCropEditor(chip.id)
}

function openCropEditorBase(): void {
  if (!baseImage.value || !baseImageFile.value) {
    toast.error('Load a source image first')
    return
  }
  cropEditor.value = {
    open: true,
    target: 'base',
    imageUrl: baseImage.value
  }
  showResolutionMenu.value = false
}

/** Fit button in resolution menu: first ref or base depending on mode. */
function openCropEditorFromMenu(): void {
  if (editMode.value === 'img2img') {
    openCropEditorBase()
    return
  }
  openCropEditorFirstRef()
}

function onCropCancel(): void {
  cropEditor.value = null
}

async function onCropApply(payload: { file: File; width: number; height: number }): Promise<void> {
  if (!cropEditor.value) return
  const editor = cropEditor.value

  if (editor.target === 'base') {
    if (baseImage.value?.startsWith('blob:')) URL.revokeObjectURL(baseImage.value)
    const url = URL.createObjectURL(payload.file)
    baseImageFile.value = payload.file
    currentEditFilename.value = null
    loadImage(url)
    setRefEditSizeMode('studio')
    configStore.setDimensions(payload.width, payload.height)
    effectiveMatchRefSize.value = { width: payload.width, height: payload.height }
    cropEditor.value = null
    toast.success(`Source fitted to ${payload.width}×${payload.height}`)
    return
  }

  const chipId = editor.chipId
  if (!chipId) {
    cropEditor.value = null
    return
  }
  const idx = refChips.value.findIndex((c) => c.id === chipId)
  if (idx < 0) {
    cropEditor.value = null
    return
  }
  const old = refChips.value[idx]
  URL.revokeObjectURL(old.url)
  const url = URL.createObjectURL(payload.file)
  refChips.value[idx] = { id: chipId, url, file: payload.file }
  setRefEditSizeMode('studio')
  configStore.setDimensions(payload.width, payload.height)
  effectiveMatchRefSize.value = { width: payload.width, height: payload.height }
  cropEditor.value = null
  toast.success(`Ref fitted to ${payload.width}×${payload.height}`)
}

const showQwenZeroCondTip = computed(() => config.value.qwenImageZeroCondT)

/** Ref Edit can run from refs alone; other modes need a source image. */
const canSubmitEdit = computed(() => {
  if (!prompt.value.trim()) return false
  if (editMode.value === 'ref') {
    return refChips.value.length > 0 || !!baseImageFile.value
  }
  return !!baseImageFile.value
})

const suggestedRefPreset = computed(() =>
  resolveRefImagePreset({
    diffusionModel:
      config.value.loadMode === 'standard'
        ? config.value.standardModel
        : config.value.diffusionModel,
    uncondDiffusionModel: config.value.uncondDiffusionModel
  })
)

const refImagePresetOptions = computed(() => {
  const base = REF_IMAGE_PRESET_OPTIONS.map((o) => ({ ...o }))
  if (suggestedRefPreset.value) {
    const auto = base.find((o) => o.value === 'auto')
    if (auto) auto.label = `Auto (${suggestedRefPreset.value})`
  }
  if (!supportsRefImageArgs.value) {
    return base.map((o) =>
      o.value === 'off' ? { ...o, label: 'Off (no --ref-image-args on this binary)' } : o
    )
  }
  return base
})

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

async function handleRefUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  const added: RefChip[] = []
  for (const file of Array.from(files)) {
    const chip: RefChip = {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: URL.createObjectURL(file),
      file
    }
    refChips.value.push(chip)
    added.push(chip)
  }
  input.value = ''
  await refreshMatchRefSize()
  // Prompt only for the first new ref that differs from studio size
  if (added[0]) await maybePromptRefSize(added[0])
}

function removeRefChip(id: string): void {
  const chip = refChips.value.find((c) => c.id === id)
  if (chip) URL.revokeObjectURL(chip.url)
  refChips.value = refChips.value.filter((c) => c.id !== id)
  void refreshMatchRefSize()
}

function clearRefChips(): void {
  for (const chip of refChips.value) URL.revokeObjectURL(chip.url)
  refChips.value = []
  effectiveMatchRefSize.value = null
}

/** Promote current base image into the multi-ref list (Kontext/Qwen workflows). */
async function addBaseAsRef(): Promise<void> {
  if (!baseImageFile.value) return
  const chip: RefChip = {
    id: `ref-${Date.now()}-base`,
    url: baseImage.value || URL.createObjectURL(baseImageFile.value),
    file: baseImageFile.value
  }
  refChips.value.push(chip)
  await refreshMatchRefSize()
  await maybePromptRefSize(chip)
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
async function handleImageUpload(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  target.value = ''
  stopPreviewPolling({ clearFrame: true })
  const previousBaseImage = baseImage.value
  baseImageFile.value = file
  currentEditFilename.value = null
  const url = URL.createObjectURL(file)
  loadImage(url)
  if (previousBaseImage?.startsWith('blob:')) URL.revokeObjectURL(previousBaseImage)
  await refreshMatchRefSize()
  // Size prompt only for Img2Img (Inpaint always follows source; no resolution UI)
  if (editMode.value === 'img2img') {
    await maybePromptImageSize({ target: 'base', file })
  }
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
  if (!prompt.value.trim()) {
    toast.error('Enter a prompt to generate')
    return
  }

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
  // Inpaint: always source natural (mask alignment).
  // Ref Edit / Img2Img: studio config W×H, or match image when policy is match_ref.
  let outW = imageElement?.naturalWidth || config.value.width
  let outH = imageElement?.naturalHeight || config.value.height
  if (editMode.value === 'ref' || editMode.value === 'img2img') {
    if (refEditSizeMode.value === 'match_ref') {
      await refreshMatchRefSize()
      outW = effectiveMatchRefSize.value?.width || config.value.width
      outH = effectiveMatchRefSize.value?.height || config.value.height
    } else {
      outW = config.value.width
      outH = config.value.height
    }
  }
  const payload = buildGenerationPayload(config.value, {
    prompt: promptSnap,
    negativePrompt: negSnap,
    width: outW,
    height: outH,
    extra: {
      strength: inpaintStrength.value,
      img2imgStrength: inpaintStrength.value
    }
  })

  // Old binaries / Off: never send the unified flag (unknown flag fails the run)
  if (!supportsRefImageArgs.value || config.value.refImagePreset === 'off') {
    delete payload.refImageArgs
    delete payload.refImageCliFlag
  } else if (payload.refImageArgs && refImageCliFlag.value) {
    payload.refImageCliFlag = refImageCliFlag.value
  }

  let endpoint = '/api/inpaint'
  const formParts = payloadToFormParts(payload)

  if (editMode.value === 'inpaint') {
    const maskDataUrl = getMaskDataUrl()
    if (!maskDataUrl || maskDataUrl === 'data:,') {
      error.value = 'Paint a mask on the areas to edit'
      toast.error(error.value)
      return
    }
    formParts.push({ name: 'initImage', type: 'file', file: baseImageFile.value! })
    formParts.push({ name: 'strength', type: 'text', value: String(inpaintStrength.value) })
    formParts.push({
      name: 'img2imgStrength',
      type: 'text',
      value: String(inpaintStrength.value)
    })
    const response = await fetch(maskDataUrl)
    const blob = await response.blob()
    formParts.push({
      name: 'mask',
      type: 'file',
      file: new File([blob], 'mask.png', { type: 'image/png' })
    })
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
  const livePreviewMethodSnap = config.value.livePreviewMethod

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
    onStart: () => {
      progress.start()
      if (livePreviewMethodSnap) {
        startPreviewPolling(() => isGenerating.value)
      }
    },
    onSuccess: async (result) => {
      const filename = result.filename || result.filenames?.[0]
      if (filename) {
        setFinalPreview(getOutputUrl(filename))
        editImages.value = [filename, ...editImages.value.filter((img) => img !== filename)]
        await useOutputImage(filename)
        // After loading result as base, drop sticky preview so source UI returns
        stopPreviewPolling({ clearFrame: true })
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
      } else {
        discardLivePreview()
      }
    },
    onError: (msg) => {
      discardLivePreview()
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
    onSettled: () => {
      progress.stop()
      // Ensure polling stops if still running (success already stopped)
      if (!isGenerating.value) {
        stopPreviewPolling({ clearFrame: isLivePreview.value })
      }
    }
  })

  if (busy) toast.info(`Queued · ${pendingCount.value} waiting`)
}

async function handleCancel(): Promise<void> {
  await cancelCurrent()
  toast.warning('Cancelling current job…')
  discardLivePreview()
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
    .then(async (blob) => {
      const file = new File([blob], 'image.png', { type: 'image/png' })
      baseImageFile.value = file
      currentEditFilename.value = null
      loadImage(editImage)
      await refreshMatchRefSize()
      if (editMode.value === 'img2img') {
        await maybePromptImageSize({ target: 'base', file })
      }
    })
    .catch((e) => {
      console.error('Failed to load image from gallery:', e)
    })
}

// Check for image from gallery on mount
// When the binary lacks --ref-image-args, force legacy (off) so we never send the flag.
watch(
  supportsRefImageArgs,
  (ok) => {
    if (!ok && config.value.refImagePreset !== 'off') {
      // Keep user choice in memory for when they upgrade; only strip at send time.
      // Prefer showing Off as effective default when unsupported:
      if (!config.value.refImagePreset || config.value.refImagePreset === 'auto') {
        config.value.refImagePreset = 'off'
      }
    }
  },
  { immediate: true }
)

function handleResolutionMenuClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.resolution-menu')) showResolutionMenu.value = false
}

function handleResolutionKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && showResolutionMenu.value) {
    showResolutionMenu.value = false
  }
}

onMounted(() => {
  void fetchCapabilities()
  handleWindowResize()
  window.addEventListener('resize', handleWindowResize)
  document.addEventListener('click', handleResolutionMenuClick)
  window.addEventListener('keydown', handleResolutionKeydown)
  consumeGalleryHandoff()
})

onActivated(() => {
  consumeGalleryHandoff()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  document.removeEventListener('click', handleResolutionMenuClick)
  window.removeEventListener('keydown', handleResolutionKeydown)
  imageResizeObserver?.disconnect()
  discardLivePreview()
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
          <!-- Live / sticky generation preview (same endpoint as Text2Image) -->
          <div
            v-if="showPreviewHero && previewImage"
            class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both absolute inset-0 z-[5] flex h-full w-full items-center justify-center p-1 duration-200 md:p-2"
          >
            <img
              :src="previewImage"
              class="h-full max-h-full w-full max-w-full rounded-2xl object-contain"
              :alt="isLivePreview ? 'Live preview' : 'Edit result preview'"
            />
          </div>

          <div
            v-else-if="!baseImage && !(editMode === 'ref' && refChips.length)"
            class="fade-in slide-in-from-bottom-1 animate-in absolute inset-0 flex flex-col items-center justify-center px-6 text-center duration-200"
          >
            <div class="content-item flex max-w-sm flex-col items-center">
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Edit workspace
              </p>
              <h2 class="mt-2 text-base font-medium tracking-tight text-foreground">
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

          <!-- Busy overlay only until live frames arrive (matches Text2Image empty-hero style) -->
          <div
            v-if="isGenerating && !isLivePreview && !showPreviewHero"
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
            v-if="baseImage && !showPreviewHero"
            class="fade-in slide-in-from-top-1 animate-in absolute right-3 top-3 flex items-center gap-0.5 rounded-full border border-border/70 bg-background/85 p-1 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl duration-200"
          >
            <Tooltip text="Remove source image" position="bottom">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Remove source image"
                @click="removeBaseImage"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip text="Clear mask" position="bottom">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Clear mask"
                @click="clearMask"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip text="Replace image" position="bottom">
              <label
                class="aui-icon-button inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40"
                aria-label="Replace image"
              >
                <Upload class="h-3.5 w-3.5" />
                <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
              </label>
            </Tooltip>
            <Tooltip text="Select from gallery" position="bottom">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Select from gallery"
                @click="goToGallery"
              >
                <Images class="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true"></span>
            <span class="px-1 text-xs tabular-nums text-muted-foreground"
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
          :live-preview="isLivePreview"
          :fallback-label="
            editMode === 'ref' ? 'Ref edit' : editMode === 'img2img' ? 'Img2Img' : 'Inpaint'
          "
        />

        <div v-if="editImages.length > 0" class="mt-3 w-full shrink-0">
          <div class="mb-1.5 flex items-center justify-between px-2">
            <h3
              class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground"
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
        <!-- Top inline row: modes + tools + live preview (same as Image) -->
        <div class="flex flex-wrap items-center gap-2 px-3 pt-3 text-xs md:px-4">
          <SegmentedControl
            :model-value="editMode"
            :options="editModeOptions"
            size="sm"
            aria-label="Edit mode"
            @update:model-value="setEditMode"
          />
          <label
            class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:bg-accent hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40"
            :class="isGenerating ? 'pointer-events-none opacity-50' : ''"
            :aria-disabled="isGenerating"
          >
            <Upload class="h-3.5 w-3.5" />
            <span>
              {{
                editMode === 'ref'
                  ? 'Add references'
                  : baseImage
                    ? 'Replace image'
                    : 'Upload image'
              }}
            </span>
            <input
              :key="editMode"
              type="file"
              accept="image/*"
              class="hidden"
              :multiple="editMode === 'ref'"
              :disabled="isGenerating"
              @change="editMode === 'ref' ? handleRefUpload($event) : handleImageUpload($event)"
            />
          </label>
          <SegmentedControl
            :model-value="promptMode"
            :options="promptModeOptions"
            size="md"
            aria-label="Prompt mode"
            @update:model-value="setPromptMode"
          />
          <div v-if="editMode === 'inpaint'" class="flex shrink-0 items-center gap-1 pl-0.5">
            <Tooltip
              :text="maskMode === 'erase' ? 'Switch to mask paint' : 'Switch to mask erase'"
              position="top"
            >
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all duration-150 hover:border-border hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                :class="
                  maskMode === 'erase'
                    ? 'border-foreground bg-foreground text-background shadow-sm'
                    : ''
                "
                :aria-pressed="maskMode === 'erase'"
                :aria-label="maskMode === 'erase' ? 'Switch to mask paint' : 'Switch to mask erase'"
                @click="maskMode = maskMode === 'paint' ? 'erase' : 'paint'"
              >
                <Eraser v-if="maskMode === 'erase'" class="h-3.5 w-3.5" />
                <Brush v-else class="h-3.5 w-3.5" />
              </button>
            </Tooltip>
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
          <div v-else-if="editMode === 'img2img'" class="flex shrink-0 items-center gap-1 pl-0.5">
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
              <span class="tabular-nums text-muted-foreground">{{
                inpaintStrength.toFixed(2)
              }}</span>
            </label>
            <Tooltip v-if="baseImage" text="Fit source to output size" position="top">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all duration-150 hover:border-border hover:bg-background hover:text-foreground"
                aria-label="Fit source to output size"
                @click="openCropEditorBase"
              >
                <Crop class="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
          <p
            v-if="showQwenZeroCondTip"
            class="w-full text-xs text-muted-foreground md:w-auto"
            title="Required for Qwen Image Edit 2511 quality"
          >
            Qwen zero-cond-t is on (Edit 2511)
          </p>
          <Select
            v-model="config.livePreviewMethod"
            label="Preview"
            size="sm"
            placeholder="None"
            aria-label="Live preview"
            class="ml-auto w-auto shrink-0 rounded-full border-0 bg-transparent shadow-none hover:bg-accent"
            :options="[...LIVE_PREVIEW_METHOD_OPTIONS]"
          />
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
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Fit to output size"
              aria-label="Fit reference to output size"
              @click="openCropEditor(chip.id)"
            >
              <Crop class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              @click="removeRefChip(chip.id)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
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
          <div
            class="ml-auto w-[min(100%,14rem)] shrink-0"
            :title="
              supportsRefImageArgs
                ? 'PR #1780: --ref-image-args preset for multi-ref DiT edit'
                : 'This sd-cli has no --ref-image-args; omit flag (CLI / legacy path)'
            "
          >
            <Select
              v-model="config.refImagePreset"
              size="sm"
              class="w-full"
              aria-label="Reference processing preset"
              :disabled="!supportsRefImageArgs"
              :options="refImagePresetOptions"
            />
          </div>
          <p
            v-if="!supportsRefImageArgs"
            class="w-full text-xs leading-relaxed text-muted-foreground"
          >
            Reference presets need a post-#1780 sd-cli. Flag omitted; refs still use -r.
          </p>
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

        <!-- Quick controls: resolution (Ref Edit + Img2Img) + generation settings -->
        <div class="flex items-center gap-1 rounded-b-[2rem] px-3 py-2 text-xs md:px-4">
          <div v-if="freeSizeMode" class="relative shrink-0">
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1 rounded-full border border-transparent px-2 font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="
                showResolutionMenu
                  ? 'border-border bg-background text-foreground shadow-sm'
                  : 'hover:border-border hover:bg-background/70'
              "
              :aria-expanded="showResolutionMenu"
              aria-label="Output resolution"
              :title="
                editMode === 'img2img'
                  ? 'Output size for Img2Img (-W / -H)'
                  : 'Output size for Ref Edit (-W / -H)'
              "
              @click.stop="showResolutionMenu = !showResolutionMenu"
            >
              <span class="flex h-4 w-5 items-center justify-center" aria-hidden="true">
                <span
                  class="block rounded-[2px] border border-current opacity-70"
                  :class="config.width >= config.height ? 'w-4' : 'h-4'"
                  :style="{ aspectRatio: `${config.width} / ${config.height}` }"
                ></span>
              </span>
              <span class="tabular-nums">{{ generationStripLabel }}</span>
              <ChevronUp v-if="showResolutionMenu" class="h-3 w-3" />
              <ChevronDown v-else class="h-3 w-3" />
            </button>
            <div
              v-if="showResolutionMenu"
              class="resolution-menu fade-in slide-in-from-bottom-1 animate-in absolute bottom-full left-0 z-[100] mb-2 w-[min(16rem,calc(100vw-1.5rem))] max-h-[min(60vh,22rem)] overflow-y-auto rounded-xl border border-border/70 bg-popover/95 p-2 text-popover-foreground shadow-lg backdrop-blur-xl duration-150 md:left-0"
              @click.stop
            >
              <div class="mb-2 px-1">
                <p class="text-xs font-medium text-foreground">Output size</p>
                <p class="text-xs text-muted-foreground">
                  Ref Edit and Img2Img. Inpaint always follows the source (mask alignment).
                </p>
              </div>
              <div class="mb-2 flex rounded-lg border border-border/70 p-0.5 text-xs">
                <button
                  type="button"
                  class="flex-1 rounded-md px-2 py-1.5 font-medium transition-colors"
                  :class="
                    refEditSizeMode === 'studio'
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground'
                  "
                  title="Use studio W×H from Image/Edit settings"
                  @click="setRefEditSizeMode('studio')"
                >
                  Studio size
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-md px-2 py-1.5 font-medium transition-colors"
                  :class="
                    refEditSizeMode === 'match_ref'
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground'
                  "
                  :title="
                    editMode === 'img2img'
                      ? 'Output size follows the source image natural pixels'
                      : 'Output size follows the first reference natural pixels'
                  "
                  @click="onMatchRefSizeClick"
                >
                  {{ matchSizeLabel }}
                </button>
              </div>
              <div
                v-if="refEditSizeMode === 'match_ref'"
                class="mb-2 rounded-lg bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground"
              >
                {{ editMode === 'img2img' ? 'Following source' : 'Following first ref' }}
                <span v-if="effectiveMatchRefSize" class="font-mono text-foreground">
                  ({{ effectiveMatchRefSize.width }}×{{ effectiveMatchRefSize.height }})
                </span>
                · switch to Studio to pick a frame.
              </div>
              <template v-else>
                <div class="grid grid-cols-2 gap-1">
                  <button
                    v-for="preset in resolutionPresets"
                    :key="preset.label"
                    type="button"
                    class="flex h-11 items-center gap-2 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-accent"
                    :class="
                      config.width === preset.width && config.height === preset.height
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground'
                    "
                    @click="selectResolution(preset)"
                  >
                    <span
                      class="flex h-7 w-8 shrink-0 items-center justify-center"
                      aria-hidden="true"
                    >
                      <span
                        class="block rounded-[2px] border border-current"
                        :class="preset.width >= preset.height ? 'w-7' : 'h-7'"
                        :style="{ aspectRatio: `${preset.width} / ${preset.height}` }"
                      ></span>
                    </span>
                    <span class="font-mono text-xs tracking-tight"
                      >{{ preset.width }}×{{ preset.height }}</span
                    >
                  </button>
                </div>
                <div class="mt-2 border-t border-border/70 pt-2">
                  <div class="flex items-center gap-1.5">
                    <input
                      v-model.number="config.width"
                      type="number"
                      min="64"
                      step="64"
                      aria-label="Custom width"
                      class="aui-field h-8 w-[4.5rem] rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <span class="text-muted-foreground">×</span>
                    <input
                      v-model.number="config.height"
                      type="number"
                      min="64"
                      step="64"
                      aria-label="Custom height"
                      class="aui-field h-8 w-[4.5rem] rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <button
                      type="button"
                      class="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-colors duration-150 hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      @click="applyCustomResolution"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </template>
              <div class="mt-2 space-y-1.5 border-t border-border/70 pt-2">
                <button
                  type="button"
                  class="inline-flex h-8 w-full items-center justify-center rounded-md border border-border/70 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  :title="
                    editMode === 'img2img'
                      ? 'Copy source natural size into studio W×H'
                      : 'Copy first ref natural size into studio W×H'
                  "
                  @click="matchRefResolution"
                >
                  {{
                    editMode === 'img2img' ? 'Use source size as studio' : 'Use ref size as studio'
                  }}
                </button>
                <button
                  type="button"
                  class="inline-flex h-8 w-full items-center justify-center rounded-md border border-border/70 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  :title="
                    editMode === 'img2img'
                      ? 'Fit source into the current studio frame'
                      : 'Fit first reference into the current studio frame'
                  "
                  @click="openCropEditorFromMenu"
                >
                  {{
                    editMode === 'img2img'
                      ? `Fit source to ${config.width}×${config.height}…`
                      : `Fit first ref to ${config.width}×${config.height}…`
                  }}
                </button>
              </div>
            </div>
          </div>
          <span
            v-else
            class="tabular-nums text-muted-foreground"
            :title="`Steps from generation settings · size follows source image (no resolution selector in Inpaint)`"
          >
            {{ config.steps }} steps
          </span>

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
                  title="Generation settings — steps, CFG, seed, sampler"
                  aria-label="Generation settings"
                >
                  <SlidersHorizontal class="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" :side-offset="8" class="w-72 p-3">
                <div class="mb-3">
                  <p class="text-sm font-medium">Generation settings</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Shared with Image · steps, CFG, seed, sampling
                  </p>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <label class="text-sm font-medium text-muted-foreground">
                    Steps
                    <input
                      v-model.number="config.steps"
                      type="number"
                      min="1"
                      max="150"
                      class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
                    />
                  </label>
                  <label class="text-sm font-medium text-muted-foreground">
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
                  <label class="text-sm font-medium text-muted-foreground">
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

                <div v-if="freeSizeMode" class="mt-3 space-y-2 border-t border-border/60 pt-3">
                  <p class="text-xs font-medium text-muted-foreground">
                    Output size ({{ editMode === 'img2img' ? 'Img2Img' : 'Ref Edit' }})
                  </p>
                  <div class="flex rounded-lg border border-border/70 p-0.5 text-xs">
                    <button
                      type="button"
                      class="flex-1 rounded-md px-2 py-1.5 font-medium transition-colors"
                      :class="
                        refEditSizeMode === 'studio'
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground'
                      "
                      @click="setRefEditSizeMode('studio')"
                    >
                      Studio
                    </button>
                    <button
                      type="button"
                      class="flex-1 rounded-md px-2 py-1.5 font-medium transition-colors"
                      :class="
                        refEditSizeMode === 'match_ref'
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground'
                      "
                      @click="onMatchRefSizeClick"
                    >
                      {{ matchSizeLabel }}
                    </button>
                  </div>
                  <div v-if="refEditSizeMode === 'studio'" class="grid grid-cols-2 gap-2">
                    <label class="text-sm font-medium text-muted-foreground">
                      Width
                      <input
                        v-model.number="config.width"
                        type="number"
                        min="64"
                        step="64"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
                      />
                    </label>
                    <label class="text-sm font-medium text-muted-foreground">
                      Height
                      <input
                        v-model.number="config.height"
                        type="number"
                        min="64"
                        step="64"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
                      />
                    </label>
                  </div>
                  <p v-else class="text-xs text-muted-foreground">
                    Using
                    {{ editMode === 'img2img' ? 'source' : 'first ref' }} natural size
                    <span v-if="effectiveMatchRefSize" class="font-mono">
                      ({{ effectiveMatchRefSize.width }}×{{ effectiveMatchRefSize.height }})
                    </span>
                  </p>
                </div>
                <p
                  v-else
                  class="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground"
                >
                  Output size follows the source image in Inpaint (no resolution selector).
                </p>

                <div class="mt-3 space-y-2">
                  <label class="block text-sm font-medium text-muted-foreground">
                    Scheduler
                    <Select
                      v-model="config.scheduler"
                      size="sm"
                      aria-label="Scheduler"
                      class="mt-1"
                      :options="schedulerOptions"
                    />
                  </label>
                  <label class="block text-sm font-medium text-muted-foreground">
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
              <Tooltip v-if="isGenerating" text="Cancel current job" position="top">
                <button
                  type="button"
                  @click="handleCancel"
                  class="aui-icon-button inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-colors hover:bg-muted active:scale-95 focus-visible:outline-none"
                  aria-label="Cancel current job"
                >
                  <Square class="size-3.5 fill-current" />
                </button>
              </Tooltip>
              <Tooltip
                :text="
                  !canSubmitEdit
                    ? editMode === 'ref'
                      ? 'Add a prompt and at least one reference'
                      : 'Add a prompt and a source image'
                    : isGenerating
                      ? 'Add to queue'
                      : 'Generate edit'
                "
                position="top"
              >
                <button
                  type="button"
                  @click="handleGenerate"
                  :disabled="!canSubmitEdit"
                  class="aui-icon-button inline-flex size-10 items-center justify-center rounded-full bg-[#103e31] text-[#f2f7f3] transition-colors hover:bg-[#0a241c] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-[#b8d5ad] dark:text-[#07140c] dark:hover:bg-[#dfead9] focus-visible:outline-none"
                  :aria-label="isGenerating ? 'Add to queue' : 'Generate edit'"
                >
                  <ArrowUp class="size-4 stroke-[2.5]" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>

    <RefSizePrompt
      :open="!!sizePrompt?.open"
      :image-width="sizePrompt?.imageWidth ?? 0"
      :image-height="sizePrompt?.imageHeight ?? 0"
      :target-width="config.width"
      :target-height="config.height"
      @use-image-size="onSizePromptUseImage"
      @keep-output="onSizePromptKeep"
      @fit-to-target="onSizePromptFit"
      @dismiss="closeSizePrompt"
      @update:dont-ask="sizePromptDontAsk = $event"
    />

    <ImageCropResizeDialog
      :open="!!cropEditor?.open"
      :image-url="cropEditor?.imageUrl ?? ''"
      :initial-width="config.width"
      :initial-height="config.height"
      @cancel="onCropCancel"
      @apply="onCropApply"
    />
  </div>
</template>
