<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, onActivated } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, apiGet, authenticatedFetch, getOutputUrl, getApiBase } from '@/services/api'
import {
  ArrowUp,
  Copy,
  Dices,
  Download,
  Trash2,
  X,
  User,
  Activity,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  Image,
  Lock,
  LockOpen,
  SlidersHorizontal,
  Square
} from '@/lib/icons'
import { useToast } from '@/composables/useToast'
import {
  isAnyGenerationBusy,
  toastGenerationError,
  useGeneration
} from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import { useJobQueue, type FormPart } from '@/composables/useJobQueue'
import { useModels } from '@/composables/useModels'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import RecipeLibrary from '@/components/RecipeLibrary.vue'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import AdvancedToolPanel, { type AdvancedToolTab } from '@/components/AdvancedToolPanel.vue'
import ImageCropResizeDialog from '@/components/ImageCropResizeDialog.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import BrandMark from '@/components/BrandMark.vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { samplerOptions, schedulerOptions } from '@/lib/generationOptions'
import { useGenerationHistory } from '@/composables/useGenerationHistory'
import { normalizeImageParams } from '@/lib/imageParams'
import { buildGenerationPayload, type GenerationPayload } from '@/lib/generationPayload'
import { pickConfigSnapshot } from '@/lib/configSnapshot'
import { useSetup } from '@/composables/useSetup'
import { useRemoteSession } from '@/composables/useRemoteSession'
import { onStarterPrompt } from '@/lib/appEvents'
import { requestConfirm } from '@/composables/useConfirm'
import { downloadOutputAsFormat } from '@/lib/mediaExport'
import { useOutputPreferences, type ArchiveImageFormat } from '@/composables/useOutputPreferences'

const toast = useToast()
const { markFirstImageDone } = useSetup()
const { enqueue, cancelCurrent, pendingCount } = useJobQueue()
const { models } = useModels()
const {
  supportsUpscale,
  supportsAdetailer,
  supportsRefImageArgs,
  refImageCliFlag,
  fetchCapabilities
} = useBackendCapabilities()
const { isRemote } = useRemoteSession()
const { defaultSaveFormat, autoDownloadGenerated } = useOutputPreferences()
/** When set, queue an upscale job after each successful single (or first) output */
const queueUpscaleAfter = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem('flaxeo-queue-upscale-after') === '1'
)

watch(queueUpscaleAfter, (v) => {
  try {
    localStorage.setItem('flaxeo-queue-upscale-after', v ? '1' : '0')
  } catch {
    /* ignore */
  }
})

function enqueueUpscaleForFile(filename: string): void {
  if (!supportsUpscale.value) {
    toast.error('Upscale not supported by this backend')
    return
  }
  const upscaleModel = models.value.upscale[0]
  if (!upscaleModel) {
    toast.error('No upscale model in models/upscale')
    return
  }
  enqueue({
    surface: 'upscale',
    label: `Upscale ${filename}`,
    prompt: `Upscale ${filename}`,
    kind: 'json',
    endpoint: '/api/upscale',
    jsonBody: {
      filename,
      upscaleModel,
      upscaleRepeats: 1,
      upscaleTileSize: 128,
      offloadToCpu: config.value.cpuOffload,
      diffusionFa: config.value.flashAttention,
      streamLayers: config.value.streamLayers,
      maxVram: config.value.maxVram,
      threads: config.value.threads
    },
    onSuccess: (result) => {
      const out = result.filename || result.filenames?.[0]
      if (out) {
        galleryImages.value = [out, ...galleryImages.value]
        toast.success(`Upscale complete · ${out}`)
      }
    },
    onError: (msg) => {
      if (msg !== 'Cancelled') toastGenerationError(toast, msg, 'Upscale failed')
    }
  })
}

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

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { isGenerating } = useGeneration()
const progress = useGenerationProgress()
const { addEntry: addHistoryEntry } = useGenerationHistory()

const adetailerModelOptions = computed(() => [
  {
    label: models.value.adetailer?.length ? 'Select detector…' : 'No models in models/adetailer',
    value: ''
  },
  ...(models.value.adetailer || []).map((m) => ({ label: m, value: m }))
])

const adetailerMaskModeOptions = [
  { label: 'None (per detection)', value: 'none' },
  { label: 'Merge masks', value: 'merge' },
  { label: 'Merge + invert', value: 'merge_invert' }
]

// Form state
const prompt = ref('')
const negativePrompt = ref('') // Matches template usage
const previewImage = ref<string | null>(null)
const previewObjectUrl = ref<string | null>(null)
const galleryImages = ref<string[]>([])
const error = ref<string | null>(null)
const serverOnline = ref(false)
const currentImageFilename = ref<string | null>(null)
/** Idle stage selection (filename); independent of live blob URLs */
const selectedFilename = ref<string | null>(null)
const isLivePreview = ref(false)
const showImageViewer = ref(false)
/** Fullscreen modal — separate from stage so browsing never steals live preview */
const viewerSrc = ref<string | null>(null)
const viewerFilename = ref<string | null>(null)
/** Last successful batch size — drives multi-tile grid layout */
const lastBatchSize = ref(1)
const showBatchGrid = ref(false)

interface AdvancedUploadSnapshot {
  kontextRef: File | null
  controlNet: File | null
  initImage: File | null
  photoMaker: File[]
}

function appendAdvancedUploads(parts: FormPart[], uploads: AdvancedUploadSnapshot): void {
  if (uploads.kontextRef) {
    parts.push({ name: 'kontextRefImage', type: 'file', file: uploads.kontextRef })
  }
  if (uploads.controlNet) {
    parts.push({ name: 'controlNetImage', type: 'file', file: uploads.controlNet })
  }
  if (uploads.initImage) {
    parts.push({ name: 'initImage', type: 'file', file: uploads.initImage })
  }
  uploads.photoMaker.forEach((file) => parts.push({ name: 'pmImages', type: 'file', file }))
}

// Preview polling (only while generating; 304/ETag avoids re-decoding unchanged frames)
let previewPollInterval: ReturnType<typeof setInterval> | null = null
let previewEtag: string | null = null

/**
 * getPreviewImageUrl() - Live preview endpoint
 */
function getPreviewImageUrl(): string {
  return `${getApiBase()}/api/preview-image`
}

/**
 * startPreviewPolling() - Poll for live preview frames.
 * Keeps the previous final on stage until the first live blob arrives (no empty flash).
 */
function startPreviewPolling(): void {
  stopPreviewPolling({ clearFrame: false })
  // Do not clear isLivePreview/previewImage here — leave last final until first frame
  isLivePreview.value = false
  previewEtag = null
  previewPollInterval = setInterval(async () => {
    // Guard: never poll when generation already finished
    if (!isGenerating.value) {
      stopPreviewPolling({ clearFrame: false })
      return
    }
    try {
      const headers: HeadersInit = {}
      if (previewEtag) headers['If-None-Match'] = previewEtag
      const response = await authenticatedFetch(getPreviewImageUrl(), { headers })
      if (response.status === 304) return
      if (!response.ok) return
      const nextEtag = response.headers.get('ETag')
      if (nextEtag) previewEtag = nextEtag
      const blob = await response.blob()
      if (blob.size > 0) {
        const oldUrl = previewObjectUrl.value
        const newUrl = URL.createObjectURL(blob)
        previewObjectUrl.value = newUrl
        previewImage.value = newUrl
        isLivePreview.value = true
        if (oldUrl && oldUrl !== newUrl) URL.revokeObjectURL(oldUrl)
      }
    } catch {
      // Preview not available yet, silently ignore
    }
  }, 750)
}

/**
 * stopPreviewPolling() - Stop polling.
 * clearFrame: drop live blob from the hero (cancel / failed / aborted).
 * Leave the canvas alone when clearFrame is false (e.g. success already set a final file URL).
 */
function stopPreviewPolling(opts?: { clearFrame?: boolean }): void {
  const clearFrame = opts?.clearFrame !== false
  if (previewPollInterval) {
    clearInterval(previewPollInterval)
    previewPollInterval = null
  }
  previewEtag = null
  const blobUrl = previewObjectUrl.value
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl)
    previewObjectUrl.value = null
    if (clearFrame && previewImage.value === blobUrl) {
      previewImage.value = null
    }
  } else if (clearFrame && isLivePreview.value) {
    // Live flag without blob (shouldn't happen) — still clear sticky preview
    previewImage.value = null
  }
  isLivePreview.value = false
}

/** Clear live preview canvas after cancel / failed gen (not after success). */
function discardLivePreview(): void {
  stopPreviewPolling({ clearFrame: true })
}

// File uploads (store actual File objects for proper upload)
// Map to store File objects for PhotoMaker web/mobile uploads (blobUrl -> File)
const pmFileMap = new Map<string, File>()
const kontextRefFile = ref<File | null>(null)
const controlNetFile = ref<File | null>(null)
const initImageFile = ref<File | null>(null)

// Advanced tool float (PhotoMaker / ControlNet / Img2Img / Reference)
const activeTab = ref<AdvancedToolTab | ''>('')
const advancedToolbarRef = ref<HTMLElement | null>(null)
const advancedAnchor = ref<{
  top: number
  left: number
  right: number
  bottom: number
  width: number
} | null>(null)
const promptMode = ref<'positive' | 'negative'>('positive')
const showResolutionMenu = ref(false)
const promptInput = ref<HTMLTextAreaElement | null>(null)
const isMobile = ref(false)

function updateAdvancedAnchor(): void {
  const el = advancedToolbarRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  advancedAnchor.value = {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width
  }
}

function toggleAdvancedTab(tab: AdvancedToolTab): void {
  if (activeTab.value === tab) {
    activeTab.value = ''
    return
  }
  updateAdvancedAnchor()
  activeTab.value = tab
}

function closeAdvancedPanel(): void {
  activeTab.value = ''
}

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

const STARTER_PROMPT =
  'Cinematic mountain landscape at dawn, low clouds, atmospheric depth, detailed composition'

const promptSuggestions = [
  {
    label: 'Starter',
    prompt: STARTER_PROMPT,
    starter: true
  },
  {
    label: 'Editorial portrait',
    prompt:
      'Editorial portrait of a person in soft window light, 85mm photography, natural skin texture'
  },
  {
    label: 'Product concept',
    prompt: 'Premium product concept on a sculptural pedestal, studio lighting, clean art direction'
  },
  {
    label: 'Abstract poster',
    prompt:
      'Bold abstract poster with geometric forms, tactile paper texture, precise editorial layout'
  }
]

function autoResize(): void {
  const el = promptInput.value
  if (el) {
    el.style.height = 'auto'
    const limit = isMobile.value ? 160 : 360
    el.style.height = Math.min(el.scrollHeight, limit) + 'px'
  }
}

function onPromptKeydown(e: KeyboardEvent): void {
  // Enter generates from either tab — positive + negative both go in the payload
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleGenerate()
  }
}

function setPromptMode(value: string): void {
  if (value === 'positive' || value === 'negative') promptMode.value = value
}

function usePromptSuggestion(suggestion: string): void {
  prompt.value = suggestion
  requestAnimationFrame(() => promptInput.value?.focus())
}

/** Power-of-two squares + standard frames (capability labels, not vertical brands) */
const resolutionPresets = [
  { label: '512²', width: 512, height: 512 },
  { label: '768²', width: 768, height: 768 },
  { label: '1024²', width: 1024, height: 1024 },
  { label: '1536²', width: 1536, height: 1536 },
  { label: '2048²', width: 2048, height: 2048 },
  { label: '1:1', width: 1024, height: 1024 },
  { label: '4:3', width: 1024, height: 768 },
  { label: '3:2', width: 1152, height: 768 },
  { label: '16:9', width: 1344, height: 768 },
  { label: '9:16', width: 768, height: 1344 },
  { label: '2:3', width: 832, height: 1216 },
  { label: '3:4', width: 896, height: 1152 }
]

const resolutionLabel = computed(() => {
  return `${config.value.width}×${config.value.height}`
})

function selectResolution(preset: (typeof resolutionPresets)[number]): void {
  configStore.setDimensions(preset.width, preset.height)
  showResolutionMenu.value = false
}

function applyCustomResolution(): void {
  configStore.setDimensions(
    Math.max(64, Number(config.value.width) || 1024),
    Math.max(64, Number(config.value.height) || 1024)
  )
  showResolutionMenu.value = false
}

function advancedConfigured(tab: string): boolean {
  if (tab === 'photomaker') {
    return (
      config.value.photoMakerImages.length > 0 ||
      !!config.value.photoMakerModel ||
      !!config.value.photoMakerIdEmbedsPath
    )
  }
  if (tab === 'controlnet') {
    return !!config.value.controlImagePath || !!config.value.controlNetModel
  }
  if (tab === 'img2img') {
    return !!config.value.initImagePath
  }
  if (tab === 'kontext') {
    return !!config.value.kontextRefImage
  }
  return false
}

function advancedButtonClass(tab: string): string {
  if (activeTab.value === tab || advancedConfigured(tab)) return 'text-foreground'
  return 'text-muted-foreground hover:text-foreground'
}

function clearControlNetImage(): void {
  config.value.controlImagePath = ''
  controlNetFile.value = null
}

function clearInitImage(): void {
  config.value.initImagePath = ''
  initImageFile.value = null
}

function clearKontextImage(): void {
  config.value.kontextRefImage = ''
  kontextRefFile.value = null
}

// Handle file uploads
function handlePMUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    for (let i = 0; i < input.files.length; i++) {
      if (config.value.photoMakerImages.length < 4) {
        const file = input.files[i]
        const blobUrl = URL.createObjectURL(file)
        config.value.photoMakerImages.push(blobUrl)
        pmFileMap.set(blobUrl, file)
      }
    }
  }
}

function removePMImage(index: number) {
  const imgUrl = config.value.photoMakerImages[index]
  if (pmFileMap.has(imgUrl)) {
    pmFileMap.delete(imgUrl)
    URL.revokeObjectURL(imgUrl) // Clean up memory
  }
  config.value.photoMakerImages.splice(index, 1)
}

function handleCNUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    controlNetFile.value = file
    config.value.controlImagePath = URL.createObjectURL(file)
  }
}

function handleKontextUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    if (config.value.kontextRefImage?.startsWith('blob:')) {
      URL.revokeObjectURL(config.value.kontextRefImage)
    }
    kontextRefFile.value = file
    config.value.kontextRefImage = URL.createObjectURL(file)
  }
}

function handleInitImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    if (config.value.initImagePath?.startsWith('blob:')) {
      URL.revokeObjectURL(config.value.initImagePath)
    }
    initImageFile.value = file
    config.value.initImagePath = URL.createObjectURL(file)
  }
}

/** Fit-to-target editor for Image advanced tools (Img2Img init / Reference). */
const imageToolCrop = ref<{
  open: boolean
  target: 'init' | 'ref'
  imageUrl: string
} | null>(null)

function openInitFitEditor(): void {
  if (!config.value.initImagePath) {
    toast.error('Upload an initial image first')
    return
  }
  imageToolCrop.value = {
    open: true,
    target: 'init',
    imageUrl: config.value.initImagePath
  }
}

function openRefFitEditor(): void {
  if (!config.value.kontextRefImage) {
    toast.error('Upload a reference image first')
    return
  }
  imageToolCrop.value = {
    open: true,
    target: 'ref',
    imageUrl: config.value.kontextRefImage
  }
}

function onImageToolCropCancel(): void {
  imageToolCrop.value = null
}

function onImageToolCropApply(payload: { file: File; width: number; height: number }): void {
  if (!imageToolCrop.value) return
  const target = imageToolCrop.value.target
  const url = URL.createObjectURL(payload.file)
  if (target === 'init') {
    if (config.value.initImagePath?.startsWith('blob:')) {
      URL.revokeObjectURL(config.value.initImagePath)
    }
    initImageFile.value = payload.file
    config.value.initImagePath = url
  } else {
    if (config.value.kontextRefImage?.startsWith('blob:')) {
      URL.revokeObjectURL(config.value.kontextRefImage)
    }
    kontextRefFile.value = payload.file
    config.value.kontextRefImage = url
  }
  configStore.setDimensions(payload.width, payload.height)
  imageToolCrop.value = null
  toast.success(
    target === 'init'
      ? `Init image fitted to ${payload.width}×${payload.height}`
      : `Reference fitted to ${payload.width}×${payload.height}`
  )
}

// Helper to get params from image
async function sendToParams(imagePath: string) {
  try {
    let relativePath = imagePath
    if (imagePath.startsWith('http')) {
      const url = new URL(imagePath)
      relativePath = decodeURIComponent(url.pathname.replace(/^\/output\//, ''))
    } else if (imagePath.includes('/output/')) {
      relativePath = imagePath.split('/output/').pop() || imagePath
    }

    const data = await apiPost<Record<string, unknown>>('/api/image/params', {
      path: relativePath
    })
    const params = normalizeImageParams(data)

    if (params.prompt) prompt.value = params.prompt
    if (params.negativePrompt || params.negative_prompt) {
      negativePrompt.value = params.negativePrompt || params.negative_prompt || ''
    }
    configStore.applyImageParams(params, 'all')
    toast.success('Parameters restored from image')
  } catch (e) {
    console.error('Failed to restore params:', e)
    toast.error('Could not read parameters from image')
  }
}

function clampBatchCount(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(16, Math.max(1, Math.round(value)))
}

function randomizeSeed(): void {
  // Positive 31-bit int; CLI uses random when seed < 0
  const next = Math.floor(Math.random() * 2_147_483_647)
  configStore.updateConfig({ seed: next, seedLocked: true })
  toast.info(`Seed ${next} (locked)`)
}

function toggleSeedLock(): void {
  const next = !config.value.seedLocked
  if (next && config.value.seed < 0) {
    // Locking while random: materialize a seed so re-runs are reproducible
    randomizeSeed()
    return
  }
  configStore.updateConfig({ seedLocked: next })
  toast.info(next ? 'Seed locked' : 'Seed unlocked (random next gen)')
}

async function copySeed(): Promise<void> {
  try {
    await navigator.clipboard.writeText(String(config.value.seed))
    toast.success(`Seed ${config.value.seed} copied`)
  } catch {
    toast.error('Could not copy seed')
  }
}

/**
 * handleGenerate() - Snapshot settings and enqueue (runs immediately if idle)
 * opts.seedOverride — force a specific seed (e.g. multi-variant queue)
 * opts.batchCountOverride — force batch size (variants use 1)
 * opts.quiet — skip “queued” toast (caller toasts once)
 */
async function handleGenerate(opts?: {
  seedOverride?: number
  batchCountOverride?: number
  quiet?: boolean
}): Promise<void> {
  if (!prompt.value.trim()) {
    toast.error('Enter a prompt to generate')
    return
  }

  // Close advanced tools so they never block the send action
  if (activeTab.value) closeAdvancedPanel()

  const jobConfig = JSON.parse(JSON.stringify(config.value)) as typeof config.value
  const uploads: AdvancedUploadSnapshot = {
    kontextRef: kontextRefFile.value,
    controlNet: controlNetFile.value,
    initImage: initImageFile.value,
    photoMaker: jobConfig.photoMakerImages
      .map((image) => pmFileMap.get(image))
      .filter((file): file is File => !!file)
  }

  const model =
    jobConfig.loadMode === 'standard' ? jobConfig.standardModel : jobConfig.diffusionModel
  if (!model) {
    toast.error('No model selected — open Model setup or the Model Hub')
    return
  }

  const batchCount = clampBatchCount(opts?.batchCountOverride ?? jobConfig.batchCount)
  if (opts?.batchCountOverride == null && batchCount !== jobConfig.batchCount) {
    configStore.updateConfig({ batchCount })
  }
  const seedForJob =
    opts?.seedOverride != null
      ? opts.seedOverride
      : jobConfig.seedLocked
        ? Math.max(0, jobConfig.seed)
        : -1
  const snapshot = pickConfigSnapshot({
    ...jobConfig,
    batchCount,
    seed: seedForJob,
    seedLocked: opts?.seedOverride != null ? true : jobConfig.seedLocked
  })
  const promptSnap = prompt.value
  const negSnap = negativePrompt.value
  const widthSnap = jobConfig.width
  const heightSnap = jobConfig.height
  const livePreviewMethodSnap = jobConfig.livePreviewMethod

  await checkServerStatus()

  const params = buildGenerationPayload(
    { ...jobConfig, batchCount, seed: seedForJob },
    { prompt: promptSnap, negativePrompt: negSnap }
  )

  // Old binaries / Off: never send the unified flag
  if (!supportsRefImageArgs.value || jobConfig.refImagePreset === 'off') {
    delete params.refImageArgs
    delete params.refImageCliFlag
  } else if (params.refImageArgs && refImageCliFlag.value) {
    params.refImageCliFlag = refImageCliFlag.value
  }

  let endpoint = '/api/generate-cli'
  let kind: 'json' | 'form' = 'json'
  let jsonBody: Record<string, unknown> | undefined = params as Record<string, unknown>
  let formParts: FormPart[] | undefined

  const hasPMFiles = uploads.photoMaker.length > 0
  const needsFormData =
    !!uploads.kontextRef || !!uploads.controlNet || !!uploads.initImage || hasPMFiles

  const wantsServer =
    jobConfig.backendMode === 'server' &&
    serverOnline.value &&
    batchCount === 1 &&
    !jobConfig.photoMakerImages?.length &&
    !jobConfig.controlImagePath &&
    !jobConfig.initImagePath &&
    !jobConfig.kontextRefImage

  if (jobConfig.backendMode === 'server' && serverOnline.value && !wantsServer) {
    toast.info('Using CLI for this job — Server mode is core T2I only')
  }

  if (wantsServer) {
    endpoint = '/api/generate'
    jsonBody = {
      prompt: params.prompt,
      negative_prompt: params.negative_prompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg_scale: params.cfg_scale,
      seed: params.seed,
      guidance: params.guidance,
      batch_size: 1,
      clip_skip: params.clipSkip
    }
  } else if (needsFormData) {
    kind = 'form'
    formParts = payloadToFormParts(params)
    appendAdvancedUploads(formParts, uploads)
    jsonBody = undefined
  }

  const busy = isAnyGenerationBusy()
  error.value = null

  const jobLabel =
    opts?.seedOverride != null ? `${promptSnap.slice(0, 32)} · s${seedForJob}` : promptSnap

  enqueue({
    surface: 'text2image',
    label: jobLabel,
    prompt: promptSnap,
    negativePrompt: negSnap,
    seed: seedForJob,
    width: widthSnap,
    height: heightSnap,
    configSnapshot: snapshot,
    kind,
    endpoint,
    jsonBody,
    formParts,
    onStart: () => {
      progress.start()
      if (livePreviewMethodSnap) startPreviewPolling()
    },
    onSuccess: (result) => {
      const names = result.filenames?.length
        ? result.filenames
        : result.filename
          ? [result.filename]
          : []
      if (names.length > 0) {
        // Swap to final output first, then stop polling without wiping the canvas
        const blobUrl = previewObjectUrl.value
        galleryImages.value = [...names, ...galleryImages.value]
        previewImage.value = getOutputUrl(names[0])
        currentImageFilename.value = names[0]
        selectedFilename.value = names[0]
        isLivePreview.value = false
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl)
          previewObjectUrl.value = null
        }
        lastBatchSize.value = names.length
        showBatchGrid.value = names.length > 1
        toast.success(
          names.length > 1 ? `Batch complete — ${names.length} images` : 'Generation complete!'
        )
        markFirstImageDone()
        for (const filename of names) {
          addHistoryEntry({
            surface: 'text2image',
            status: 'success',
            prompt: promptSnap,
            negativePrompt: negSnap,
            seed: seedForJob,
            width: widthSnap,
            height: heightSnap,
            filename,
            configSnapshot: snapshot
          })
        }
        // Optional linear step: queue upscale for the primary output
        if (queueUpscaleAfter.value && names[0]) {
          enqueueUpscaleForFile(names[0])
          toast.info('Upscale queued after generate')
        }
        void autoDownloadOutputs(names)
      } else if (result.message === 'Cancelled') {
        discardLivePreview()
        addHistoryEntry({
          surface: 'text2image',
          status: 'cancelled',
          prompt: promptSnap,
          seed: seedForJob,
          configSnapshot: snapshot
        })
      } else {
        // No output files — drop live frames
        discardLivePreview()
      }
    },
    onError: (msg) => {
      discardLivePreview()
      if (msg === 'Cancelled') {
        toast.warning('Generation cancelled')
        addHistoryEntry({
          surface: 'text2image',
          status: 'cancelled',
          prompt: promptSnap,
          seed: seedForJob,
          configSnapshot: snapshot
        })
        return
      }
      error.value = msg
      toastGenerationError(toast, msg)
      addHistoryEntry({
        surface: 'text2image',
        status: 'failed',
        prompt: promptSnap,
        seed: seedForJob,
        error: msg,
        configSnapshot: snapshot
      })
    },
    onSettled: () => {
      // Stop poller; only clear canvas if still on a live blob (success already swapped)
      stopPreviewPolling({ clearFrame: isLivePreview.value || !!previewObjectUrl.value })
      progress.stop()
    }
  })

  if (busy && !opts?.quiet) {
    toast.info(`Queued · ${pendingCount.value} waiting`)
  }
}

/** Enqueue N single-image jobs with different random seeds (production variants). */
async function queueSeedVariants(count = 4): Promise<void> {
  if (!prompt.value.trim()) {
    toast.error('Write a positive prompt first')
    return
  }
  const n = Math.min(8, Math.max(2, Math.round(count)))
  for (let i = 0; i < n; i++) {
    const seed = Math.floor(Math.random() * 2_147_483_647)
    await handleGenerate({
      seedOverride: seed,
      batchCountOverride: 1,
      quiet: true
    })
  }
  toast.info(`Queued ${n} seed variants`)
}

/**
 * handleCancel() - Cancels the current queue job
 */
async function handleCancel(): Promise<void> {
  await cancelCurrent()
  toast.warning('Cancelling current job…')
  progress.stop()
  discardLivePreview()
}

/**
 * selectGalleryImage() - Put a finished session image on the stage (idle only).
 */
function selectGalleryImage(filename: string): void {
  // Never steal the stage while generating (use modal instead)
  if (isGenerating.value) return
  previewImage.value = getOutputUrl(filename)
  currentImageFilename.value = filename
  selectedFilename.value = filename
  isLivePreview.value = false
  // Single-select from strip exits batch grid overview
  showBatchGrid.value = false
}

/** Open fullscreen modal without changing the stage (used while generating). */
function openViewerModal(filename: string): void {
  viewerFilename.value = filename
  viewerSrc.value = getOutputUrl(filename)
  showImageViewer.value = true
}

/**
 * Strip / grid click: idle → stage; generating → modal only (never interrupt live).
 */
function onSessionThumbClick(filename: string): void {
  if (isGenerating.value) {
    openViewerModal(filename)
    return
  }
  selectGalleryImage(filename)
}

function openGalleryImageFullscreen(filename: string): void {
  if (isGenerating.value) {
    openViewerModal(filename)
    return
  }
  selectGalleryImage(filename)
  openViewerModal(filename)
}

function openStageFullscreen(): void {
  if (!previewImage.value) return
  if (isLivePreview.value) {
    // Show whatever is on stage (live blob) without requiring a finished filename
    viewerSrc.value = previewImage.value
    viewerFilename.value = currentImageFilename.value || selectedFilename.value || 'Live preview'
    showImageViewer.value = true
    return
  }
  if (currentImageFilename.value || selectedFilename.value) {
    openViewerModal(currentImageFilename.value || selectedFilename.value!)
  }
}

function closeImageViewer(): void {
  showImageViewer.value = false
  viewerSrc.value = null
  viewerFilename.value = null
}

/**
 * clearSessionScreen() - Blank the studio session UI (does not delete disk files).
 */
async function clearSessionScreen(): Promise<void> {
  if (isGenerating.value) {
    toast.info('Wait for generation to finish before clearing the screen')
    return
  }
  if (galleryImages.value.length >= 3) {
    const ok = await requestConfirm({
      title: 'Clear screen',
      message: 'Clear this session from the workspace? Images stay in Gallery and on disk.',
      confirmLabel: 'Clear screen',
      danger: false
    })
    if (!ok) return
  }
  galleryImages.value = []
  selectedFilename.value = null
  currentImageFilename.value = null
  previewImage.value = null
  showBatchGrid.value = false
  lastBatchSize.value = 1
  discardLivePreview()
  closeImageViewer()
  toast.success('Screen cleared')
}

async function savePreviewImage(format?: ArchiveImageFormat): Promise<void> {
  if (!currentImageFilename.value || isLivePreview.value) return
  const archiveFormat = format ?? defaultSaveFormat.value
  try {
    await downloadOutputAsFormat(currentImageFilename.value, archiveFormat, {
      prompt: prompt.value,
      seed: config.value.seed,
      width: config.value.width,
      height: config.value.height
    })
    toast.success(`Saved as ${archiveFormat.toUpperCase()}`)
  } catch (e) {
    console.error(e)
    toast.error('Could not save image')
  }
}

async function autoDownloadOutputs(names: string[]): Promise<void> {
  if (!autoDownloadGenerated.value || !names.length) return
  const format = defaultSaveFormat.value
  let ok = 0
  for (const filename of names) {
    try {
      await downloadOutputAsFormat(filename, format)
      ok += 1
    } catch (e) {
      console.error(e)
    }
  }
  if (ok > 0) {
    toast.info(
      ok > 1
        ? `Auto-saved ${ok} images as ${format.toUpperCase()}`
        : `Auto-saved as ${format.toUpperCase()}`
    )
  }
}

function openBatchGrid(): void {
  if (galleryImages.value.length > 1) {
    lastBatchSize.value = Math.max(lastBatchSize.value, Math.min(galleryImages.value.length, 16))
    showBatchGrid.value = true
  }
}

/**
 * deletePreview() - Delete the current preview image (custom confirm UI)
 */
async function deletePreview(): Promise<void> {
  if (!currentImageFilename.value || isLivePreview.value || isRemote) return

  const filenameToDelete = currentImageFilename.value
  const ok = await requestConfirm({
    title: 'Delete image',
    message: `Delete “${filenameToDelete}”? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return

  try {
    const data = await apiPost<{ filename?: string }>('/api/delete', {
      filename: filenameToDelete
    })

    const deletedFilename = data.filename || filenameToDelete
    const idx = galleryImages.value.indexOf(deletedFilename)

    galleryImages.value = galleryImages.value.filter((f) => f !== deletedFilename)

    if (galleryImages.value.length > 0) {
      const nextIdx = Math.min(idx, galleryImages.value.length - 1)
      selectGalleryImage(galleryImages.value[nextIdx >= 0 ? nextIdx : 0])
    } else {
      previewImage.value = null
      currentImageFilename.value = null
      selectedFilename.value = null
    }
    toast.success('Image deleted')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed'
    toast.error(msg)
    console.error('Delete failed:', e)
  }
}

// Navigation
const stageNavFilename = computed(
  () => selectedFilename.value || currentImageFilename.value || null
)

const isFirstImage = computed(() => {
  const currentFile = stageNavFilename.value
  if (!currentFile || galleryImages.value.length === 0) return true
  return galleryImages.value.indexOf(currentFile) <= 0
})

const isLastImage = computed(() => {
  const currentFile = stageNavFilename.value
  if (!currentFile || galleryImages.value.length === 0) return true
  return galleryImages.value.indexOf(currentFile) >= galleryImages.value.length - 1
})

function navigateImage(direction: number): void {
  // Modal open: walk session list in the viewer only (never steal live stage)
  if (showImageViewer.value && viewerFilename.value) {
    const idx = galleryImages.value.indexOf(viewerFilename.value)
    if (idx === -1) return
    const newIdx = idx + direction
    if (newIdx >= 0 && newIdx < galleryImages.value.length) {
      const name = galleryImages.value[newIdx]
      viewerFilename.value = name
      viewerSrc.value = getOutputUrl(name)
      if (!isGenerating.value) selectGalleryImage(name)
    }
    return
  }

  if (isGenerating.value) return
  const currentFile = stageNavFilename.value
  if (!currentFile) return
  const idx = galleryImages.value.indexOf(currentFile)
  if (idx === -1) return

  const newIdx = idx + direction
  if (newIdx >= 0 && newIdx < galleryImages.value.length) {
    selectGalleryImage(galleryImages.value[newIdx])
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (showImageViewer.value) return
  if (e.key === 'Escape' && showResolutionMenu.value) {
    showResolutionMenu.value = false
    return
  }
  if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
  if (e.key === 'ArrowLeft') navigateImage(-1)
  if (e.key === 'ArrowRight') navigateImage(1)
  if (
    e.key === 'Delete' &&
    !isRemote &&
    previewImage.value &&
    !isGenerating.value &&
    !isLivePreview.value
  ) {
    void deletePreview()
  }
}

function handleResolutionMenuClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.resolution-menu')) showResolutionMenu.value = false
}

// Fetch gallery on mount
// async function fetchGallery() { ... } - Removed to keep session-only history

/**
 * checkServerStatus() - Check if sd-server is running
 */
async function checkServerStatus(): Promise<void> {
  try {
    const response = await apiGet<{ running: boolean }>(
      isRemote ? '/api/remote/status' : '/api/status'
    )
    // Server is online if we get a response (sd-server is running)
    serverOnline.value = response?.running === true
  } catch {
    serverOnline.value = false
  }
}

/** Apply sample / re-run prompts from session or live events (keep-alive safe). */
function applyRestoredPromptsFromSession(opts?: { preferToast?: boolean }): void {
  const restoredPrompt = sessionStorage.getItem('text2imagePrompt')
  if (restoredPrompt != null) {
    sessionStorage.removeItem('text2imagePrompt')
    prompt.value = restoredPrompt
    const fromOnboarding = sessionStorage.getItem('flaxeo-onboarding-sample') === '1'
    if (fromOnboarding) {
      sessionStorage.removeItem('flaxeo-onboarding-sample')
      toast.info('Sample prompt ready — press Generate when your model is selected')
    } else if (opts?.preferToast) {
      toast.info('Prompt restored')
    }
    requestAnimationFrame(() => promptInput.value?.focus())
  }
  const restoredNegative = sessionStorage.getItem('text2imageNegativePrompt')
  if (restoredNegative != null) {
    sessionStorage.removeItem('text2imageNegativePrompt')
    negativePrompt.value = restoredNegative
  }
}

function applyStarterPromptLive(detail: { prompt: string; fromOnboarding?: boolean }): void {
  prompt.value = detail.prompt
  try {
    sessionStorage.removeItem('text2imagePrompt')
    if (detail.fromOnboarding) {
      sessionStorage.removeItem('flaxeo-onboarding-sample')
    }
  } catch {
    /* ignore */
  }
  if (detail.fromOnboarding) {
    toast.info('Sample prompt ready — press Generate when your model is selected')
  }
  requestAnimationFrame(() => promptInput.value?.focus())
}

let unsubStarterPrompt: (() => void) | null = null

function handleViewportResize(): void {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  isMobile.value = window.innerWidth < 768
  window.addEventListener('resize', handleViewportResize)

  void fetchCapabilities()
  // Check if sd-server is running
  void checkServerStatus()

  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleResolutionMenuClick)
  unsubStarterPrompt = onStarterPrompt(applyStarterPromptLive)

  // Check for params from Gallery
  const paramsImage = sessionStorage.getItem('text2imageParams')
  if (paramsImage) {
    sessionStorage.removeItem('text2imageParams')
    // Small delay to ensure toast container is ready
    setTimeout(() => {
      sendToParams(paramsImage)
    }, 500)
  }

  applyRestoredPromptsFromSession()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleViewportResize)
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleResolutionMenuClick)
  unsubStarterPrompt?.()
  unsubStarterPrompt = null
  stopPreviewPolling()
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value)
    previewObjectUrl.value = null
  }
})

// keep-alive: re-apply session prompts when returning to Image
onActivated(() => {
  applyRestoredPromptsFromSession()
})
</script>

<template>
  <div
    class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <ImageViewer
      v-if="showImageViewer && viewerSrc"
      :src="viewerSrc"
      :filename="viewerFilename || 'Generated image'"
      alt="Generated image"
      @close="closeImageViewer"
      @prev="navigateImage(-1)"
      @next="navigateImage(1)"
    />

    <!-- Preview Area -->
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
          class="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
          :class="{ 'rounded-3xl': !previewImage && !isGenerating }"
        >
          <!-- Multi-result batch grid (2+ images) -->
          <div
            v-if="!isGenerating && galleryImages.length > 1 && lastBatchSize > 1 && showBatchGrid"
            class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both grid h-full w-full gap-2 overflow-y-auto p-2 duration-200 md:p-4"
            :class="
              lastBatchSize >= 4 ? 'grid-cols-2 md:grid-cols-2 lg:grid-cols-2' : 'grid-cols-2'
            "
          >
            <button
              v-for="img in galleryImages.slice(0, lastBatchSize)"
              :key="img"
              type="button"
              class="aui-icon-button group relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted/20 transition-all hover:border-foreground/25 focus:outline-none"
              :class="
                selectedFilename === img || currentImageFilename === img
                  ? 'ring-2 ring-foreground/40'
                  : 'opacity-90 hover:opacity-100'
              "
              :title="img"
              @click="onSessionThumbClick(img)"
              @dblclick="openGalleryImageFullscreen(img)"
            >
              <img
                :src="getOutputUrl(img)"
                class="h-full w-full object-cover"
                loading="lazy"
                :alt="img"
              />
            </button>
          </div>
          <button
            v-else-if="previewImage"
            type="button"
            class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex h-full w-full cursor-zoom-in items-center justify-center p-1 duration-200 focus:outline-none md:p-2"
            title="Open image fullscreen"
            aria-label="Open generated image fullscreen"
            @click="openStageFullscreen"
          >
            <img
              :src="previewImage"
              class="h-full max-h-full w-full max-w-full rounded-2xl object-contain"
              alt="Generated image"
            />
          </button>
          <!-- Empty hero until a live frame or final image exists -->
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center">
            <div class="flex max-w-2xl flex-col items-center px-6 text-center">
              <BrandMark size="xl" class="text-foreground" />
              <div
                v-if="!isGenerating"
                class="mt-5 flex flex-wrap justify-center gap-2"
                aria-label="Prompt ideas"
              >
                <button
                  v-for="(suggestion, index) in promptSuggestions"
                  :key="suggestion.label"
                  type="button"
                  class="content-item inline-flex h-8 items-center rounded-lg border border-input bg-background px-3.5 text-xs font-medium transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  :style="{ animationDelay: `${40 + index * 40}ms` }"
                  @click="usePromptSuggestion(suggestion.prompt)"
                >
                  {{ suggestion.label }}
                </button>
              </div>
            </div>
          </div>
          <!-- Live badge (quiet) -->
          <div
            v-if="isLivePreview"
            class="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur-xl"
          >
            Live
          </div>
          <div
            v-if="previewImage && galleryImages.length > 1 && !isGenerating"
            class="pointer-events-none absolute inset-0 flex items-center justify-between px-2 md:px-3"
          >
            <Tooltip text="Previous image" position="right">
              <button
                type="button"
                @click="navigateImage(-1)"
                class="aui-icon-button pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-border/50 bg-background/70 text-foreground/80 opacity-70 transition-all duration-150 hover:bg-background hover:opacity-100 focus-visible:outline-none"
                :class="{ 'opacity-0 cursor-default': isFirstImage }"
                :disabled="isFirstImage"
                aria-label="Previous image"
              >
                <ChevronLeft class="size-5" />
              </button>
            </Tooltip>
            <Tooltip text="Next image" position="left">
              <button
                type="button"
                @click="navigateImage(1)"
                class="aui-icon-button pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-border/50 bg-background/70 text-foreground/80 opacity-70 transition-all duration-150 hover:bg-background hover:opacity-100 focus-visible:outline-none"
                :class="{ 'opacity-0 cursor-default': isLastImage }"
                :disabled="isLastImage"
                aria-label="Next image"
              >
                <ChevronRight class="size-5" />
              </button>
            </Tooltip>
          </div>
          <div
            v-if="previewImage && !isLivePreview && !isGenerating"
            class="absolute right-2 top-2 z-10 flex gap-0.5 rounded-full border border-border/60 bg-background/85 p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 md:right-3 md:top-3"
          >
            <Tooltip v-if="!isRemote" text="Delete image from disk" position="bottom">
              <button
                type="button"
                @click="deletePreview"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Delete image"
              >
                <Trash2 class="size-4" />
              </button>
            </Tooltip>
            <div class="inline-flex items-center">
              <Tooltip :text="`Save as ${defaultSaveFormat.toUpperCase()}`" position="bottom">
                <button
                  type="button"
                  class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="Save image"
                  @click="savePreviewImage()"
                >
                  <Download class="size-4" />
                </button>
              </Tooltip>
              <Popover>
                <PopoverTrigger as-child>
                  <button
                    type="button"
                    class="aui-icon-button -ml-1 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    title="Choose save format"
                    aria-label="Choose save format"
                  >
                    <span class="text-[10px] leading-none">▾</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent class="w-44 p-1" align="end" side="bottom">
                  <button
                    type="button"
                    class="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                    @click="savePreviewImage('png')"
                  >
                    Save as PNG
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                    @click="savePreviewImage('avif')"
                  >
                    Save as AVIF
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <GenerationProgressPill
          v-if="isGenerating"
          class="my-2 self-center"
          loading-text="Loading model"
          fallback-label="Generating"
          :live-preview="isLivePreview"
        />

        <div v-if="galleryImages.length > 0" class="mt-3 w-full shrink-0">
          <div class="mx-auto mb-1.5 flex max-w-4xl items-center gap-2 px-1">
            <span class="text-[11px] text-muted-foreground">
              Session · {{ galleryImages.length }}
            </span>
            <div class="ml-auto flex items-center gap-2">
              <button
                v-if="galleryImages.length > 1"
                type="button"
                class="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                @click="showBatchGrid ? (showBatchGrid = false) : openBatchGrid()"
              >
                {{ showBatchGrid ? 'Single' : 'Grid' }}
              </button>
              <button
                type="button"
                class="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                :disabled="isGenerating"
                :title="
                  isGenerating
                    ? 'Wait for generation to finish'
                    : 'Clear this session from the workspace (keeps Gallery files)'
                "
                @click="clearSessionScreen"
              >
                Clear
              </button>
            </div>
          </div>
          <div
            class="aui-media-strip relative mx-auto max-w-4xl rounded-2xl border border-border/50 bg-background/60 p-1.5 backdrop-blur"
          >
            <div
              ref="carouselRef"
              class="no-scrollbar flex snap-x gap-1.5 overflow-x-auto scroll-smooth p-0.5"
              :aria-label="`Session generations, ${galleryImages.length}`"
            >
              <button
                v-for="img in galleryImages"
                :key="img"
                type="button"
                @click="onSessionThumbClick(img)"
                class="relative size-14 shrink-0 snap-start overflow-hidden rounded-xl opacity-70 transition-all duration-150 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40 md:size-16"
                :class="
                  !isGenerating && (selectedFilename === img || currentImageFilename === img)
                    ? 'opacity-100 ring-1 ring-foreground/30'
                    : showImageViewer && viewerFilename === img
                      ? 'opacity-100 ring-1 ring-foreground/20'
                      : ''
                "
                :title="isGenerating ? `View ${img} (opens viewer)` : `Show ${img}`"
                :aria-label="
                  isGenerating ? `Open generation ${img} in viewer` : `Select generation ${img}`
                "
              >
                <img
                  :src="getOutputUrl(img)"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  :alt="img"
                />
              </button>
            </div>
            <div
              class="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-2xl bg-gradient-to-r from-background/80 to-transparent"
            ></div>
            <div
              class="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-background/80 to-transparent"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3 pt-2 md:px-8 md:pb-6 md:pt-3">
      <div class="mx-auto mb-2 flex w-full max-w-4xl justify-end px-1">
        <div
          ref="advancedToolbarRef"
          data-slot="advanced-toolbar"
          class="flex shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-background/80 p-1 shadow-sm backdrop-blur"
        >
          <Tooltip text="PhotoMaker — identity / style from reference faces" position="top">
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('photomaker')"
              aria-label="Open PhotoMaker settings"
              :aria-expanded="activeTab === 'photomaker'"
              @click="toggleAdvancedTab('photomaker')"
            >
              <User class="size-4" />
            </button>
          </Tooltip>
          <Tooltip text="ControlNet — guide structure with a control image" position="top">
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('controlnet')"
              aria-label="Open ControlNet settings"
              :aria-expanded="activeTab === 'controlnet'"
              @click="toggleAdvancedTab('controlnet')"
            >
              <Activity class="size-4" />
            </button>
          </Tooltip>
          <Tooltip text="Image to image — denoise from an init image" position="top">
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('img2img')"
              aria-label="Open Image to Image settings"
              :aria-expanded="activeTab === 'img2img'"
              @click="toggleAdvancedTab('img2img')"
            >
              <Image class="size-4" />
            </button>
          </Tooltip>
          <Tooltip text="Reference — multi-ref for Kontext / Anima / Qwen edit (-r)" position="top">
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('kontext')"
              aria-label="Open Reference settings"
              :aria-expanded="activeTab === 'kontext'"
              @click="toggleAdvancedTab('kontext')"
            >
              <ImagePlus class="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>
      <div
        class="aui-composer flaxeo-composer relative mx-auto flex w-full max-w-4xl flex-col overflow-visible"
      >
        <!-- Prompt mode -->
        <div class="flex flex-wrap items-center gap-2 px-3 pt-3 text-sm md:px-4">
          <div role="tablist" aria-label="Prompt mode">
            <SegmentedControl
              :model-value="promptMode"
              :options="promptModeOptions"
              size="md"
              aria-label="Prompt mode"
              @update:model-value="setPromptMode"
            />
          </div>
          <Select
            v-model="config.livePreviewMethod"
            label="Preview"
            size="sm"
            placeholder="None"
            aria-label="Live preview"
            class="ml-auto w-auto shrink-0 rounded-full border-0 bg-transparent shadow-none hover:bg-accent"
            :options="[
              { label: 'None', value: '' },
              { label: 'Proj', value: 'proj' },
              { label: 'TAE', value: 'tae' },
              { label: 'VAE', value: 'vae' }
            ]"
          />
        </div>

        <!-- Textarea -->
        <div class="flex items-end gap-2 px-3 pb-2 pt-1 md:px-4">
          <div class="relative flex-1">
            <textarea
              v-model="activePrompt"
              ref="promptInput"
              rows="1"
              :placeholder="
                promptMode === 'positive'
                  ? 'Describe the image you want to generate...'
                  : 'Describe what should stay out of the image...'
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
                  ? 'Describe the image you want to generate...'
                  : 'Describe what should stay out of the image...'
              }}</span
            >
            <span
              v-if="promptMode === 'positive' && config.embeddings.length > 0"
              class="aui-status-badge absolute right-1 top-1 rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >{{ config.embeddings.length }} embeds</span
            >
          </div>
        </div>

        <!-- Quick controls: Resolution + advanced popover -->
        <div class="flex items-center gap-1 rounded-b-[2rem] px-3 py-2 text-xs md:px-4">
          <div class="relative shrink-0">
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1 rounded-full border border-transparent px-2 font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="
                showResolutionMenu
                  ? 'border-border bg-background text-foreground shadow-sm'
                  : 'hover:border-border hover:bg-background/70'
              "
              :aria-expanded="showResolutionMenu"
              aria-label="Resolution"
              @click.stop="showResolutionMenu = !showResolutionMenu"
            >
              <span class="flex h-4 w-5 items-center justify-center" aria-hidden="true">
                <span
                  class="block rounded-[2px] border border-current opacity-70"
                  :class="config.width >= config.height ? 'w-4' : 'h-4'"
                  :style="{ aspectRatio: `${config.width} / ${config.height}` }"
                ></span>
              </span>
              <span>{{ resolutionLabel }}</span>
              <ChevronUp v-if="showResolutionMenu" class="h-3 w-3" />
              <ChevronDown v-else class="h-3 w-3" />
            </button>
            <div
              v-if="showResolutionMenu"
              class="resolution-menu fade-in slide-in-from-bottom-1 animate-in absolute bottom-full right-0 z-[100] mb-2 w-64 rounded-xl border border-border/70 bg-popover/95 p-2 text-popover-foreground shadow-lg backdrop-blur-xl duration-150"
              @click.stop
            >
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
                  <span class="font-mono text-[10px] tracking-tight"
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
                    class="aui-field h-8 w-[4.5rem] rounded-md border border-input bg-background px-2 font-mono text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <span class="text-muted-foreground">×</span>
                  <input
                    v-model.number="config.height"
                    type="number"
                    min="64"
                    step="64"
                    aria-label="Custom height"
                    class="aui-field h-8 w-[4.5rem] rounded-md border border-input bg-background px-2 font-mono text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
            </div>
          </div>

          <div class="ml-auto flex shrink-0 items-center gap-1">
            <RecipeLibrary
              v-model:prompt="prompt"
              v-model:negative-prompt="negativePrompt"
              surface="text2image"
              compact
              class="shrink-0"
            />
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
              <PopoverContent
                side="top"
                align="end"
                :side-offset="8"
                class="flex w-80 max-h-[min(70vh,32rem)] flex-col overflow-hidden p-0"
              >
                <div class="shrink-0 border-b border-border/60 px-3 py-2.5">
                  <p class="text-sm font-medium">Generation settings</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Sampling, batch, seed, and ADetailer
                  </p>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  <div class="grid grid-cols-3 gap-2">
                    <label class="text-xs font-medium text-muted-foreground">
                      Steps
                      <input
                        v-model.number="config.steps"
                        type="number"
                        min="1"
                        max="150"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                      />
                    </label>
                    <label class="text-xs font-medium text-muted-foreground">
                      CFG
                      <input
                        v-model.number="config.cfgScale"
                        type="number"
                        min="0"
                        max="30"
                        step="0.5"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                      />
                    </label>
                    <label class="text-xs font-medium text-muted-foreground">
                      Batch
                      <input
                        v-model.number="config.batchCount"
                        type="number"
                        min="1"
                        max="16"
                        title="Number of images per job (-b)"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                        @change="
                          configStore.updateConfig({
                            batchCount: clampBatchCount(config.batchCount)
                          })
                        "
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    class="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md border border-border/70 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    :disabled="!prompt.trim()"
                    title="Enqueue 4 jobs with different random seeds"
                    @click="queueSeedVariants(4)"
                  >
                    Queue 4 seed variants
                  </button>

                  <label
                    v-if="supportsUpscale && models.upscale.length"
                    class="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-foreground"
                  >
                    <input
                      v-model="queueUpscaleAfter"
                      type="checkbox"
                      class="mt-0.5 rounded border-border"
                    />
                    <span>
                      Queue upscale after success
                      <span class="mt-0.5 block text-xs text-muted-foreground">
                        Uses first model in models/upscale
                      </span>
                    </span>
                  </label>

                  <!-- ADetailer (post-gen YOLOv8 face/object repair) -->
                  <div
                    class="mt-3 space-y-2 rounded-md border border-border/70 p-2.5"
                    :class="!supportsAdetailer ? 'opacity-60' : ''"
                  >
                    <label class="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                      <input
                        v-model="config.adetailerEnabled"
                        type="checkbox"
                        class="mt-0.5 rounded border-border"
                        :disabled="!supportsAdetailer"
                      />
                      <span>
                        ADetailer after generate
                        <span class="mt-0.5 block text-xs text-muted-foreground">
                          <template v-if="!supportsAdetailer">
                            Backend lacks --ad-model — upgrade stable-diffusion.cpp
                          </template>
                          <template v-else>
                            Detect + inpaint (YOLOv8). Models in models/adetailer
                          </template>
                        </span>
                      </span>
                    </label>
                    <template v-if="config.adetailerEnabled && supportsAdetailer">
                      <label class="block text-xs text-muted-foreground">
                        Detector
                        <Select
                          class="mt-1 w-full"
                          :model-value="config.adetailerModel"
                          :options="adetailerModelOptions"
                          @update:model-value="
                            (v) => configStore.updateConfig({ adetailerModel: String(v || '') })
                          "
                        />
                      </label>
                      <label class="block text-xs text-muted-foreground">
                        AD prompt
                        <input
                          v-model="config.adetailerPrompt"
                          type="text"
                          placeholder="[PROMPT], detailed face"
                          class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                        />
                      </label>
                      <label class="block text-xs text-muted-foreground">
                        AD negative
                        <input
                          v-model="config.adetailerNegativePrompt"
                          type="text"
                          placeholder="deformed face"
                          class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                        />
                      </label>
                      <div class="grid grid-cols-2 gap-2">
                        <label class="block text-xs text-muted-foreground">
                          Confidence
                          <input
                            v-model.number="config.adetailerConfidence"
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground outline-none"
                          />
                        </label>
                        <label class="block text-xs text-muted-foreground">
                          Denoise
                          <input
                            v-model.number="config.adetailerDenoisingStrength"
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground outline-none"
                          />
                        </label>
                        <label class="block text-xs text-muted-foreground">
                          Inpaint W
                          <input
                            v-model.number="config.adetailerInpaintWidth"
                            type="number"
                            min="64"
                            step="64"
                            class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground outline-none"
                          />
                        </label>
                        <label class="block text-xs text-muted-foreground">
                          Inpaint H
                          <input
                            v-model.number="config.adetailerInpaintHeight"
                            type="number"
                            min="64"
                            step="64"
                            class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground outline-none"
                          />
                        </label>
                        <label class="block text-xs text-muted-foreground">
                          Padding
                          <input
                            v-model.number="config.adetailerInpaintPadding"
                            type="number"
                            min="0"
                            step="1"
                            class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground outline-none"
                          />
                        </label>
                        <label class="block text-xs text-muted-foreground">
                          Mask blur
                          <input
                            v-model.number="config.adetailerMaskBlur"
                            type="number"
                            min="0"
                            step="1"
                            class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground outline-none"
                          />
                        </label>
                        <label class="block text-xs text-muted-foreground">
                          Largest K
                          <input
                            v-model.number="config.adetailerMaskKLargest"
                            type="number"
                            min="0"
                            step="1"
                            title="0 = all detections"
                            class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground outline-none"
                          />
                        </label>
                        <label class="block text-xs text-muted-foreground">
                          Mask mode
                          <Select
                            class="mt-1 w-full"
                            :model-value="config.adetailerMaskMode"
                            :options="adetailerMaskModeOptions"
                            @update:model-value="
                              (v) =>
                                configStore.updateConfig({ adetailerMaskMode: String(v || 'none') })
                            "
                          />
                        </label>
                      </div>
                      <label class="block text-xs text-muted-foreground">
                        Extra args
                        <input
                          v-model="config.adetailerExtraArgs"
                          type="text"
                          placeholder="input_size=640,nms=0.45"
                          class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-[11px] text-foreground outline-none"
                        />
                      </label>
                    </template>
                  </div>

                  <div class="mt-3">
                    <div class="mb-1 flex items-center justify-between gap-2">
                      <span class="text-[10px] font-medium text-muted-foreground">Seed</span>
                      <div class="flex items-center gap-0.5">
                        <Tooltip
                          :text="
                            config.seedLocked
                              ? 'Unlock seed (random next gen)'
                              : 'Lock seed for reproducibility'
                          "
                          position="top"
                        >
                          <button
                            type="button"
                            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            :aria-label="config.seedLocked ? 'Unlock seed' : 'Lock seed'"
                            :aria-pressed="config.seedLocked"
                            @click="toggleSeedLock"
                          >
                            <Lock v-if="config.seedLocked" class="size-3.5" />
                            <LockOpen v-else class="size-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip text="Randomize seed" position="top">
                          <button
                            type="button"
                            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Randomize seed"
                            @click="randomizeSeed"
                          >
                            <Dices class="size-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip text="Copy seed" position="top">
                          <button
                            type="button"
                            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Copy seed"
                            @click="copySeed"
                          >
                            <Copy class="size-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                    <input
                      v-model.number="config.seed"
                      type="number"
                      min="-1"
                      title="Use -1 for a random seed when unlocked"
                      class="aui-field h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none"
                      @change="
                        () => {
                          if (config.seed >= 0) configStore.updateConfig({ seedLocked: true })
                        }
                      "
                    />
                    <p class="mt-1 text-[10px] leading-4 text-muted-foreground">
                      {{
                        config.seedLocked
                          ? 'Locked — same seed on every generate.'
                          : 'Unlocked — CLI picks a random seed (-1) each run.'
                      }}
                      <span v-if="config.batchCount > 1">
                        Batch {{ clampBatchCount(config.batchCount) }} uses -b on sd-cli.
                      </span>
                    </p>
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
                </div>
                <!-- /scroll body -->
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
              <Tooltip :text="isGenerating ? 'Add to queue' : 'Generate image'" position="top">
                <button
                  type="button"
                  @click="handleGenerate"
                  :disabled="!prompt.trim()"
                  class="aui-icon-button inline-flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none"
                  :aria-label="isGenerating ? 'Add to queue' : 'Generate image'"
                >
                  <ArrowUp class="size-4 stroke-[2.5]" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AdvancedToolPanel
      :tab="activeTab"
      :anchor="advancedAnchor || undefined"
      @close="closeAdvancedPanel"
      @pm-upload="handlePMUpload"
      @pm-remove="removePMImage"
      @cn-upload="handleCNUpload"
      @cn-clear="clearControlNetImage"
      @init-upload="handleInitImageUpload"
      @init-clear="clearInitImage"
      @init-fit="openInitFitEditor"
      @ref-upload="handleKontextUpload"
      @ref-clear="clearKontextImage"
      @ref-fit="openRefFitEditor"
    />

    <ImageCropResizeDialog
      :open="!!imageToolCrop?.open"
      :image-url="imageToolCrop?.imageUrl ?? ''"
      :initial-width="config.width"
      :initial-height="config.height"
      @cancel="onImageToolCropCancel"
      @apply="onImageToolCropApply"
    />
  </div>
</template>
