<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, apiGet, getOutputUrl, apiPostForm, getFileUrl, getApiBase } from '@/services/api'
import {
  ArrowUp,
  Download,
  Trash2,
  X,
  User,
  Activity,
  ImagePlus,
  Plus,
  Upload,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Image,
  Loader2,
  Square
} from '@/lib/icons'
import { useToast } from '@/composables/useToast'
import { useGeneration } from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import ConfigPanel from '@/components/layout/ConfigPanel.vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { samplerOptions, schedulerOptions } from '@/lib/generationOptions'
import { appendLoraPromptTokens } from '@/lib/promptTokens'

const toast = useToast()

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { isGenerating } = useGeneration()
const progress = useGenerationProgress()

// Form state
const prompt = ref('')
const negativePrompt = ref('') // Matches template usage
const previewImage = ref<string | null>(null)
const previewObjectUrl = ref<string | null>(null)
const galleryImages = ref<string[]>([])
const error = ref<string | null>(null)
const serverOnline = ref(false)
const currentImageFilename = ref<string | null>(null)
const isLivePreview = ref(false)
// const serverStats = ref<any>(null) // Unused

// Preview polling
let previewPollInterval: ReturnType<typeof setInterval> | null = null

/**
 * getPreviewImageUrl() - Get the current preview image URL with cache bust
 */
function getPreviewImageUrl(): string {
  return `${getApiBase()}/api/preview-image?t=${Date.now()}`
}

/**
 * startPreviewPolling() - Start polling for live preview images
 */
function startPreviewPolling(): void {
  stopPreviewPolling()
  isLivePreview.value = true
  previewPollInterval = setInterval(async () => {
    try {
      const response = await fetch(getPreviewImageUrl())
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 0) {
          const oldUrl = previewObjectUrl.value
          const newUrl = URL.createObjectURL(blob)
          previewObjectUrl.value = newUrl
          previewImage.value = newUrl
          if (oldUrl) URL.revokeObjectURL(oldUrl)
        }
      }
    } catch (e) {
      // Preview not available yet, silently ignore
    }
  }, 1000)
}

/**
 * stopPreviewPolling() - Stop the preview polling interval
 */
function stopPreviewPolling(): void {
  if (previewPollInterval) {
    clearInterval(previewPollInterval)
    previewPollInterval = null
  }
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value)
    previewObjectUrl.value = null
  }
  isLivePreview.value = false
}

// File uploads (store actual File objects for proper upload)
// Map to store File objects for PhotoMaker web/mobile uploads (blobUrl -> File)
const pmFileMap = new Map<string, File>()
const kontextRefFile = ref<File | null>(null)
const controlNetFile = ref<File | null>(null)
const initImageFile = ref<File | null>(null)

// Advanced sections state
const activeTab = ref<string>('')
const promptMode = ref<'positive' | 'negative'>('positive')
const showPromptAssets = ref(false)
const promptAssetFocus = ref<'lora' | 'embedding'>('lora')
const showResolutionMenu = ref(false)
const promptInput = ref<HTMLTextAreaElement | null>(null)
const isMobile = ref(false)

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

const promptSuggestions = [
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
    label: 'Cinematic landscape',
    prompt:
      'Cinematic mountain landscape at dawn, low clouds, atmospheric depth, detailed composition'
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
  if (promptMode.value === 'positive' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleGenerate()
  }
}

function setPromptMode(value: string): void {
  if (value === 'positive' || value === 'negative') promptMode.value = value
}

function openPromptAssetModal(focus: 'lora' | 'embedding'): void {
  promptAssetFocus.value = focus
  showPromptAssets.value = true
  activeTab.value = ''
}

function usePromptSuggestion(suggestion: string): void {
  prompt.value = suggestion
  requestAnimationFrame(() => promptInput.value?.focus())
}

const resolutionPresets = [
  { label: '4:3', width: 1024, height: 768 },
  { label: '3:2', width: 1152, height: 768 },
  { label: '16:9', width: 1152, height: 648 },
  { label: '2.35:1', width: 1176, height: 512 },
  { label: '1:1', width: 1024, height: 1024 },
  { label: '4:5', width: 1024, height: 1280 },
  { label: '2:3', width: 1024, height: 1536 },
  { label: '9:16', width: 768, height: 1365 }
]

const resolutionLabel = computed(() => {
  const preset = resolutionPresets.find(
    (item) => item.width === config.value.width && item.height === config.value.height
  )
  return preset?.label || `${config.value.width}×${config.value.height}`
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

const advancedTabLabel = computed(() => {
  const labels: Record<string, string> = {
    photomaker: 'PhotoMaker',
    controlnet: 'ControlNet',
    img2img: 'Image to Image',
    kontext: 'Reference image'
  }
  return labels[activeTab.value] || 'Advanced settings'
})

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
        // Check if we have electron path (Desktop app)
        // @ts-ignore
        const filePath = file.path

        // If filePath exists and doesn't look like a filename only (web often gives just filename), use it
        if (filePath && (filePath.includes('/') || filePath.includes('\\'))) {
          config.value.photoMakerImages.push(filePath)
        } else {
          // Web/Mobile fallback: Use Blob URL for preview and store File for upload
          const blobUrl = URL.createObjectURL(file)
          config.value.photoMakerImages.push(blobUrl)
          pmFileMap.set(blobUrl, file)
        }
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
    kontextRefFile.value = file
    config.value.kontextRefImage = URL.createObjectURL(file)
  }
}

function handleInitImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    initImageFile.value = file
    config.value.initImagePath = URL.createObjectURL(file)
  }
}

function buildGenerationParams(): any {
  const c = config.value

  // Handle embeddings: append to prompt
  let finalPrompt = prompt.value
  if (c.embeddings && c.embeddings.length > 0) {
    const embeddingTokens = c.embeddings.map((path) => {
      const filename = path.split(/[\\/]/).pop() || ''
      return '<' + filename.replace(/\.[^/.]+$/, '') + '>'
    })
    finalPrompt = finalPrompt + ' ' + embeddingTokens.join(' ')
  }
  finalPrompt = appendLoraPromptTokens(finalPrompt, c.loras)

  const params: any = {
    prompt: finalPrompt,
    negative_prompt: negativePrompt.value,
    steps: c.steps,
    cfg_scale: c.cfgScale,
    width: c.width,
    height: c.height,
    seed: c.seed,
    samplingMethod: c.sampler,
    scheduler: c.scheduler,
    loadMode: c.loadMode,
    batchCount: c.batchCount,
    clipSkip: c.clipSkip,
    livePreviewMethod: c.livePreviewMethod,

    // Advanced
    vaeTiling: c.vaeTiling,

    // PhotoMaker
    photoMaker: c.photoMakerModel,
    pmImagesDir: undefined,
    photoMakerImages: c.photoMakerImages,
    pmStyleStrength: c.photoMakerStyleStrength,
    pmIdEmbedsPath: c.photoMakerIdEmbedsPath,

    // ControlNet
    controlNet: c.controlNetModel,
    controlImage: c.controlImagePath || undefined,
    controlStrength: c.controlNetStrength,
    applyCanny: c.applyCanny,

    // Img2Img
    initImagePath: c.initImagePath || undefined,
    img2imgStrength: c.img2imgStrength,

    // Kontext
    kontextRefPath: c.kontextRefImage || undefined,

    // Models - use correct model based on loadMode
    diffusionModel: c.loadMode === 'standard' ? c.standardModel : c.diffusionModel,
    highNoiseDiffusionModel: c.highNoiseDiffusionModel,
    uncondDiffusionModel: c.uncondDiffusionModel,
    vae: c.vaeModel,
    vaeFormat: c.vaeFormat,
    audioVae: c.audioVaeModel,
    t5xxl: c.t5xxlModel,
    llm: c.llmModel,
    llmVision: c.llmVisionModel,
    embeddingsConnectors: c.embeddingsConnectorsModel,
    clipL: c.clipModel,
    clipG: c.clipGModel,
    clipVision: c.clipVisionModel,

    flashAttention: c.flashAttention,
    clipOnCpu: c.clipOnCpu,
    vaeOnCpu: c.vaeOnCpu,
    controlNetOnCpu: c.controlNetOnCpu,
    offloadToCpu: c.cpuOffload,
    diffusionFa: c.flashAttention,
    diffusionConvDirect: c.diffusionConvDirect,
    vaeConvDirect: c.vaeConvDirect,
    forceSDXLVaeConvScale: c.forceSDXLVaeConvScale,
    backendAssignment: c.backendAssignment,
    paramsBackendAssignment: c.paramsBackendAssignment,
    autoFit: c.autoFit,
    splitMode: c.splitMode,
    threads: c.threads,
    maxVram: c.maxVram,
    streamLayers: c.streamLayers,
    mmap: c.mmap,
    circular: c.circular,
    circularX: c.circularX,
    circularY: c.circularY,
    qwenImageZeroCondT: c.qwenImageZeroCondT,
    chromaEnableT5Mask: c.chromaEnableT5Mask,
    chromaDisableDitMask: c.chromaDisableDitMask,
    chromaT5MaskPad: c.chromaT5MaskPad,
    disableImageMetadata: c.disableImageMetadata,

    loraApplyMode: c.loraApplyMode,
    rngType: c.rngType,
    samplerRngType: c.samplerRngType,
    quantizationType: c.quantizationType,
    tensorTypeRules: c.tensorTypeRules,
    predictionType: c.predictionType,
    cacheMode: c.cacheMode,
    cacheOption: c.cacheOption,
    scmMask: c.scmMask,
    scmPolicy: c.scmPolicy,
    flowShift: c.flowShift,
    eta: c.eta,
    slgScale: c.slgScale,
    skipLayerStart: c.skipLayerStart,
    skipLayerEnd: c.skipLayerEnd,
    skipLayers: c.skipLayers,
    sigmas: c.sigmas,
    imgCfgScale: c.imgCfgScale,
    extraSampleArgs: c.extraSampleArgs,
    extraTilingArgs: c.extraTilingArgs,
    upscaleModel: c.upscaleModel,
    taesdModel: c.taesdModel
  }

  // LoRAs
  if (c.loras.length > 0) {
    params.loras = c.loras.map((l) => ({ path: l.path, strength: l.strength }))
    params.loraApplyMode = c.loraApplyMode
  }

  if (c.guidance) params.guidance = c.guidance
  if (c.quantizationType) params.quantizationType = c.quantizationType
  if (c.videoMode) params.videoMode = true // If needed?

  return params
}

// Helper to get params from image
async function sendToParams(imagePath: string) {
  try {
    let relativePath = imagePath
    if (imagePath.startsWith('http')) {
      const url = new URL(imagePath)
      relativePath = url.pathname.replace('/output/', '')
    } else if (imagePath.includes('/output/')) {
      relativePath = imagePath.split('/output/')[1]
    }

    const data = await apiPost<{
      prompt?: string
      negativePrompt?: string
      seed?: number
      cfgScale?: number
      steps?: number
      width?: number
      height?: number
      sampler?: string
      scheduler?: string
      diffusionModel?: string
    }>('/api/image/params', { path: relativePath })

    if (data.prompt) prompt.value = data.prompt
    if (data.negativePrompt) negativePrompt.value = data.negativePrompt
    if (data.seed) config.value.seed = data.seed
    if (data.cfgScale) config.value.cfgScale = data.cfgScale
    if (data.steps) config.value.steps = data.steps

    // Restore dimensions
    if (data.width) config.value.width = data.width
    if (data.height) config.value.height = data.height

    // Restore sampler/scheduler (if names match dropdown values)
    if (data.sampler) config.value.sampler = data.sampler
    if (data.scheduler) config.value.scheduler = data.scheduler

    // Restore Model (Note: name must match exactly or logic needed)
    if (data.diffusionModel) {
      config.value.diffusionModel = data.diffusionModel
    }

    toast.success('Parameters restored from image')
  } catch (e) {
    console.error('Failed to restore params:', e)
    toast.error('Could not read parameters from image')
  }
}

/**
 * handleGenerate() - Initiates image generation
 */

async function handleGenerate(): Promise<void> {
  if (!prompt.value.trim()) return

  isGenerating.value = true
  progress.start()
  error.value = null

  // Start live preview polling if a preview method is selected
  if (config.value.livePreviewMethod) {
    startPreviewPolling()
  }

  try {
    const params = buildGenerationParams()

    // Check server status before choosing endpoint
    await checkServerStatus()

    // Choose endpoint based on mode
    let endpoint = '/api/generate-cli'
    let payload: any = params

    // If server mode is active and server is online, use the server endpoint
    if (config.value.backendMode === 'server' && serverOnline.value) {
      endpoint = '/api/generate'
      payload = {
        ...params,

        batch_size: params.batchCount,
        clip_skip: params.clipSkip
      }
    }

    // Check if we need to use FormData (for file uploads)
    const hasPMFiles = config.value.photoMakerImages.some((img) => pmFileMap.has(img))

    const needsFormData =
      kontextRefFile.value || controlNetFile.value || initImageFile.value || hasPMFiles

    let result: { message: string; filenames?: string[]; filename?: string }

    if (needsFormData) {
      const formData = new FormData()

      Object.keys(payload).forEach((key) => {
        const value = payload[key]
        if (value !== undefined && value !== null) {
          if (typeof value === 'object' && !Array.isArray(value)) {
            formData.append(key, JSON.stringify(value))
          } else if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value))
          } else {
            formData.append(key, String(value))
          }
        }
      })

      // Add file uploads
      if (kontextRefFile.value) {
        formData.append('kontextRefImage', kontextRefFile.value)
      }
      if (controlNetFile.value) {
        formData.append('controlNetImage', controlNetFile.value)
      }
      if (initImageFile.value) {
        formData.append('initImage', initImageFile.value)
      }

      // Add PhotoMaker files
      config.value.photoMakerImages.forEach((img) => {
        if (pmFileMap.has(img)) {
          formData.append('pmImages', pmFileMap.get(img)!)
        }
      })

      // Use fetch for FormData
      // Use apiPostForm helper which handles the URL correctly for both local/network
      const response = await apiPostForm(endpoint, formData)

      // apiPostForm returns the parsed JSON directly, no need for response.ok check manually here
      result = response as any

      if (!response.ok) {
        throw new Error(await response.text())
      }

      result = await response.json()
    } else {
      // Use regular JSON post
      result = await apiPost<{ message: string; filenames?: string[]; filename?: string }>(
        endpoint,
        payload
      )
    }

    // Handle result
    if (result.filenames && result.filenames.length > 0) {
      const newImages = result.filenames
      galleryImages.value = [...newImages, ...galleryImages.value]
      previewImage.value = getOutputUrl(newImages[0])
      currentImageFilename.value = newImages[0]
      isLivePreview.value = false
      toast.success('Generation complete!')
    } else if (result.filename) {
      galleryImages.value = [result.filename, ...galleryImages.value]
      previewImage.value = getOutputUrl(result.filename)
      currentImageFilename.value = result.filename
      isLivePreview.value = false
      toast.success('Generation complete!')
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Generation failed'
    error.value = errorMsg
    toast.error(errorMsg)
    console.error('Generation error:', e)
  } finally {
    stopPreviewPolling()
    isGenerating.value = false
    progress.stop()
  }
}

/**
 * handleCancel() - Cancels the current generation
 */
async function handleCancel(): Promise<void> {
  try {
    await apiPost('/api/cancel-cli', {})
    toast.warning('Generation cancelled')
  } catch (e) {
    toast.error('Failed to cancel generation')
    console.error('Cancel failed:', e)
  }
  progress.stop()
  isGenerating.value = false
}

/**
 * selectGalleryImage() - Select an image from history
 */
function selectGalleryImage(filename: string): void {
  previewImage.value = getOutputUrl(filename)
  currentImageFilename.value = filename
  isLivePreview.value = false
}

/**
 * deletePreview() - Delete the current preview image
 */
async function deletePreview(): Promise<void> {
  if (!currentImageFilename.value || isLivePreview.value) return

  const filenameToDelete = currentImageFilename.value

  try {
    const response = await fetch(`${getApiBase()}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: filenameToDelete })
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Delete failed' }))
      throw new Error(err.message || 'Delete failed')
    }
    const data = await response.json()

    const deletedFilename = data.filename || filenameToDelete
    const idx = galleryImages.value.indexOf(deletedFilename)

    galleryImages.value = galleryImages.value.filter((f) => f !== deletedFilename)

    if (galleryImages.value.length > 0) {
      const nextIdx = Math.min(idx, galleryImages.value.length - 1)
      selectGalleryImage(galleryImages.value[nextIdx >= 0 ? nextIdx : 0])
    } else {
      previewImage.value = null
      currentImageFilename.value = null
    }
    toast.success('Image deleted')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed'
    toast.error(msg)
    console.error('Delete failed:', e)
  }
}

// Navigation
const isFirstImage = computed(() => {
  if (!previewImage.value || galleryImages.value.length === 0) return true
  const currentFile = previewImage.value.split('/').pop() || ''
  return galleryImages.value.indexOf(currentFile) <= 0
})

const isLastImage = computed(() => {
  if (!previewImage.value || galleryImages.value.length === 0) return true
  const currentFile = previewImage.value.split('/').pop() || ''
  return galleryImages.value.indexOf(currentFile) >= galleryImages.value.length - 1
})

function navigateImage(direction: number) {
  if (!previewImage.value) return
  const currentFile = previewImage.value.split('/').pop() || ''
  const idx = galleryImages.value.indexOf(currentFile)
  if (idx === -1) return

  const newIdx = idx + direction
  if (newIdx >= 0 && newIdx < galleryImages.value.length) {
    selectGalleryImage(galleryImages.value[newIdx])
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showPromptAssets.value) {
    showPromptAssets.value = false
    return
  }
  if (e.key === 'Escape' && showResolutionMenu.value) {
    showResolutionMenu.value = false
    return
  }
  if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
  if (e.key === 'ArrowLeft') navigateImage(-1)
  if (e.key === 'ArrowRight') navigateImage(1)
  if (e.key === 'Delete' && previewImage.value && !isGenerating.value && !isLivePreview.value) {
    if (confirm('Delete current image?')) deletePreview()
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
    const response = await apiGet<{ running: boolean }>('/api/status')
    // Server is online if we get a response (sd-server is running)
    serverOnline.value = response?.running === true
  } catch {
    serverOnline.value = false
  }
}

onMounted(async () => {
  isMobile.value = window.innerWidth < 768
  const handleResize = () => {
    isMobile.value = window.innerWidth < 768
  }
  window.addEventListener('resize', handleResize)

  // Check if sd-server is running
  await checkServerStatus()

  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleResolutionMenuClick)

  // Check for params from Gallery
  const paramsImage = sessionStorage.getItem('text2imageParams')
  if (paramsImage) {
    sessionStorage.removeItem('text2imageParams')
    // Small delay to ensure toast container is ready
    setTimeout(() => {
      sendToParams(paramsImage)
    }, 500)
  }

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('click', handleResolutionMenuClick)
    stopPreviewPolling()
    if (previewObjectUrl.value) {
      URL.revokeObjectURL(previewObjectUrl.value)
      previewObjectUrl.value = null
    }
  })
})
</script>

<template>
  <div
    class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
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

      <div class="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col">
        <div
          class="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
          :class="{ 'rounded-3xl': !previewImage && !isGenerating }"
        >
          <img
            v-if="previewImage"
            :src="previewImage"
            class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both h-full max-h-full max-w-full rounded-[18px] object-contain shadow-[0_8px_32px_rgb(0_0_0/0.12)] duration-200"
            alt="Generated image"
          />
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center">
            <div v-if="!isGenerating" class="flex max-w-2xl flex-col items-center px-6 text-center">
              <h1
                class="content-item text-4xl font-semibold tracking-[-0.035em]"
              >
                What will you create?
              </h1>
              <div class="mt-5 flex flex-wrap justify-center gap-2" aria-label="Prompt ideas">
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
            <div
              v-else
              class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex flex-col items-center gap-3 text-center duration-200"
            >
              <Loader2 class="size-7 animate-spin text-muted-foreground" />
              <div>
                <p class="text-sm font-medium text-foreground">Creating image</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ progress.label || 'Preparing generation' }}
                </p>
              </div>
            </div>
          </div>
          <div
            v-if="isGenerating && previewImage && !isLivePreview"
            class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/45 backdrop-blur-[2px]"
          >
            <div
              class="aui-status-badge fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3.5 py-2 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl duration-200"
            >
              <Loader2 class="size-4 animate-spin text-muted-foreground" />
              <span class="font-medium text-foreground">Creating image</span>
            </div>
          </div>
          <div
            v-if="previewImage && galleryImages.length > 1 && !isGenerating"
            class="pointer-events-none absolute inset-0 flex items-center justify-between px-4"
          >
            <button
              @click="navigateImage(-1)"
              class="aui-icon-button pointer-events-auto inline-flex size-10 items-center justify-center rounded-full border border-border/50 bg-background/75 text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl transition-all duration-150 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="{ 'opacity-0 cursor-default': isFirstImage }"
              :disabled="isFirstImage"
            >
              <ChevronLeft class="size-5" />
            </button>
            <button
              @click="navigateImage(1)"
              class="aui-icon-button pointer-events-auto inline-flex size-10 items-center justify-center rounded-full border border-border/50 bg-background/75 text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl transition-all duration-150 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="{ 'opacity-0 cursor-default': isLastImage }"
              :disabled="isLastImage"
            >
              <ChevronRight class="size-5" />
            </button>
          </div>
          <div
            v-if="previewImage && !isLivePreview"
            class="absolute right-3 top-3 z-10 flex gap-1 rounded-full border border-border/60 bg-background/80 p-1 opacity-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100"
          >
            <button
              @click="deletePreview"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Delete image"
            >
              <Trash2 class="size-4" />
            </button>
            <a
              :href="previewImage"
              :download="currentImageFilename || 'image.png'"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Download image"
              ><Download class="size-4"
            /></a>
          </div>
        </div>

        <GenerationProgressPill
          v-if="isGenerating"
          class="mt-3 w-[min(100%,36rem)] self-center"
          loading-text="Loading model"
          fallback-label="CLI-GEN"
          :live-preview="isLivePreview"
        />

        <div v-if="galleryImages.length > 0" class="mt-3 w-full shrink-0">
          <div class="mb-1.5 flex items-center justify-between px-2">
            <h3
              class="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground"
            >
              <Image class="h-3.5 w-3.5" /> Recent generations ({{ galleryImages.length }})
            </h3>
          </div>
          <div
            class="aui-media-strip group/carousel relative rounded-[18px] border border-border/60 bg-background/60 p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.03)]"
          >
            <div
              ref="carouselRef"
              class="no-scrollbar flex snap-x gap-2 overflow-x-auto scroll-smooth p-0.5"
            >
              <button
                v-for="img in galleryImages"
                :key="img"
                @click="selectGalleryImage(img)"
                class="relative size-14 shrink-0 snap-start overflow-hidden rounded-xl border border-transparent transition-all duration-150 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40 md:size-16"
                :class="
                  previewImage === getOutputUrl(img)
                    ? 'border-foreground/80 ring-2 ring-ring/40 z-10'
                    : 'opacity-70'
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
              class="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-[18px] bg-gradient-to-r from-background/80 to-transparent"
            ></div>
            <div
              class="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-[18px] bg-gradient-to-l from-background/80 to-transparent"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3 pt-2 md:px-8 md:pb-6 md:pt-3">
      <div
        class="aui-composer flaxeo-composer relative mx-auto flex w-full max-w-4xl flex-col overflow-visible"
      >
        <!-- Prompt mode -->
        <div
          class="flex flex-wrap items-center gap-1.5 px-3 pt-3 text-xs md:px-4"
          role="tablist"
          aria-label="Prompt mode"
        >
          <SegmentedControl
            :model-value="promptMode"
            :options="promptModeOptions"
            size="sm"
            aria-label="Prompt mode"
            @update:model-value="setPromptMode"
          />
        </div>

        <!-- Textarea + send button -->
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
              class="flex w-full resize-none overflow-y-auto rounded-2xl border-0 bg-transparent px-1 py-3 pr-14 text-[15px] leading-6 text-foreground outline-none transition-colors placeholder:text-transparent focus:outline-none focus-visible:outline-none md:py-3.5"
              :style="{
                minHeight: isMobile ? '72px' : '88px',
                maxHeight: isMobile ? '160px' : '220px'
              }"
              @keydown="onPromptKeydown"
              @input="autoResize"
            ></textarea>
            <span
              v-if="!activePrompt || activePrompt.trim().length === 0"
              class="shimmer-text pointer-events-none absolute inset-0 px-1 py-3 text-[15px] leading-6 md:py-3.5"
              aria-hidden="true"
            >{{ promptMode === 'positive' ? 'Describe the image you want to generate...' : 'Describe what should stay out of the image...' }}</span>
            <span
              v-if="promptMode === 'positive' && config.embeddings.length > 0"
              class="aui-status-badge absolute right-1 top-1 rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >{{ config.embeddings.length }} embeds</span
            >
            <div class="absolute bottom-3 right-1 size-9">
              <Transition name="flaxeo-action">
                <button
                  v-if="!isGenerating"
                  key="generate"
                  @click="handleGenerate"
                  :disabled="promptMode !== 'positive' || !prompt.trim()"
                  class="aui-icon-button absolute inset-0 inline-flex items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Generate"
                  aria-label="Generate image"
                >
                  <ArrowUp class="size-3.5 stroke-[2.5]" />
                </button>
                <button
                  v-else
                  key="cancel"
                  @click="handleCancel"
                  class="aui-icon-button absolute inset-0 inline-flex items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-85 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Cancel"
                  aria-label="Cancel generation"
                >
                  <Square class="size-3 fill-current" />
                </button>
              </Transition>
            </div>
          </div>
        </div>

        <!-- Quick controls: Steps, CFG, Seed, Scheduler, Sampler, Resolution -->
        <div
          class="flex flex-wrap items-center gap-1 rounded-b-[2rem] border-t border-border/50 bg-muted/20 px-3 py-2 text-xs md:px-4"
        >
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            :class="config.loras.length ? 'text-foreground' : ''"
            title="Configure LoRA modules"
            @click="openPromptAssetModal('lora')"
          >
            LoRA
            <span v-if="config.loras.length" class="font-mono text-[10px]">
              {{ config.loras.length }}
            </span>
          </button>
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            :class="config.embeddings.length ? 'text-foreground' : ''"
            title="Configure embeddings"
            @click="openPromptAssetModal('embedding')"
          >
            Embedding
            <span v-if="config.embeddings.length" class="font-mono text-[10px]">
              {{ config.embeddings.length }}
            </span>
          </button>
          <div
            class="flex h-8 shrink-0 items-center gap-1 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
          >
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
          <div
            class="flex h-8 shrink-0 items-center gap-1 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
          >
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
          <div
            class="flex h-8 shrink-0 items-center gap-1 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
          >
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
          <Select
            v-model="config.scheduler"
            label="Scheduler"
            size="sm"
            aria-label="Scheduler"
            class="w-auto shrink-0 rounded-full border-0 bg-transparent hover:bg-background/70"
            :options="schedulerOptions"
          />
          <Select
            v-model="config.sampler"
            label="Sampler"
            size="sm"
            aria-label="Sampler"
            class="w-auto shrink-0 rounded-full border-0 bg-transparent hover:bg-background/70"
            :options="samplerOptions"
          />
          <Select
            v-model="config.livePreviewMethod"
            label="Preview"
            size="sm"
            placeholder="None"
            aria-label="Live preview"
            class="w-auto shrink-0 rounded-full border-0 bg-transparent shadow-none hover:bg-accent"
            :options="[
              { label: 'None', value: '' },
              { label: 'Proj', value: 'proj' },
              { label: 'TAE', value: 'tae' },
              { label: 'VAE', value: 'vae' }
            ]"
          />
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
              <span>{{ resolutionLabel }}</span>
              <ChevronUp v-if="showResolutionMenu" class="h-3 w-3" />
              <ChevronDown v-else class="h-3 w-3" />
            </button>
            <div
              v-if="showResolutionMenu"
              class="resolution-menu fade-in slide-in-from-bottom-1 animate-in absolute bottom-full right-0 z-[100] mb-2 w-72 rounded-[20px] border border-border/70 bg-popover/95 p-3 text-popover-foreground shadow-[0_2px_4px_rgb(0_0_0/0.06),0_16px_44px_rgb(0_0_0/0.16)] backdrop-blur-xl duration-150"
              @click.stop
            >
              <div class="grid grid-cols-4 gap-1.5">
                <button
                  v-for="preset in resolutionPresets"
                  :key="preset.label"
                  type="button"
                  class="flex flex-col items-center justify-center rounded-xl border p-2 text-xs transition-colors duration-150 hover:bg-accent"
                  :class="
                    resolutionLabel === preset.label
                      ? 'border-foreground/30 bg-foreground/5 text-foreground'
                      : 'border-transparent text-muted-foreground'
                  "
                  @click="selectResolution(preset)"
                >
                  <span class="font-semibold">{{ preset.label }}</span>
                  <small class="text-[10px] text-muted-foreground"
                    >{{ preset.width }}×{{ preset.height }}</small
                  >
                </button>
              </div>
              <div class="mt-3 border-t border-border pt-3">
                <span
                  class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >Custom</span
                >
                <div class="mt-1.5 flex items-center gap-1.5">
                  <input
                    v-model.number="config.width"
                    type="number"
                    min="64"
                    step="64"
                    aria-label="Custom width"
                    class="aui-field h-9 w-16 rounded-xl border border-input bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <span class="text-muted-foreground">×</span>
                  <input
                    v-model.number="config.height"
                    type="number"
                    min="64"
                    step="64"
                    aria-label="Custom height"
                    class="aui-field h-9 w-16 rounded-xl border border-input bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <button
                    type="button"
                    class="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-3 text-xs font-medium text-background shadow-sm transition-colors duration-150 hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    @click="applyCustomResolution"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="ml-auto flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('photomaker')"
              title="PhotoMaker"
              aria-label="Open PhotoMaker settings"
              @click="activeTab = activeTab === 'photomaker' ? '' : 'photomaker'"
            >
              <User class="size-4" />
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('controlnet')"
              title="ControlNet"
              aria-label="Open ControlNet settings"
              @click="activeTab = activeTab === 'controlnet' ? '' : 'controlnet'"
            >
              <Activity class="size-4" />
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('img2img')"
              title="Image to Image"
              aria-label="Open Image to Image settings"
              @click="activeTab = activeTab === 'img2img' ? '' : 'img2img'"
            >
              <Image class="size-4" />
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('kontext')"
              title="Reference (Flux)"
              aria-label="Open Reference (Flux) settings"
              @click="activeTab = activeTab === 'kontext' ? '' : 'kontext'"
            >
              <ImagePlus class="size-4" />
            </button>
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

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showPromptAssets"
          class="aui-dialog-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm"
          @click.self="showPromptAssets = false"
        >
          <Transition name="modal-surface" appear>
            <div
              v-if="showPromptAssets"
              class="aui-dialog-surface flex h-[min(60vh,480px)] w-[min(36rem,calc(100vw-2rem))] max-w-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-popover/95 text-popover-foreground shadow-[0_2px_4px_rgb(0_0_0/0.06),0_24px_64px_rgb(0_0_0/0.18)] backdrop-blur-xl"
              @click.stop
            >
              <ConfigPanel
                :collapsed="false"
                :focus="promptAssetFocus"
                @close="showPromptAssets = false"
              />
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <!-- Advanced tool modal (PhotoMaker / ControlNet / Img2Img / Kontext) -->
    <Teleport to="body">
      <div
        v-if="activeTab"
        class="aui-dialog-backdrop fade-in animate-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm duration-200 motion-reduce:animate-none"
        @click.self="activeTab = ''"
      >
        <div
          class="aui-dialog-surface fade-in slide-in-from-bottom-2 zoom-in-95 animate-in fill-mode-both relative max-h-[calc(100vh-2rem)] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[24px] border border-border/70 bg-popover/95 text-popover-foreground shadow-[0_2px_4px_rgb(0_0_0/0.06),0_24px_64px_rgb(0_0_0/0.18)] backdrop-blur-xl duration-200 motion-reduce:animate-none"
          role="dialog"
          aria-modal="true"
          @click.stop
        >
          <header class="flex items-start justify-between px-5 pb-3 pt-5">
            <div>
              <h2 class="text-base font-semibold tracking-[-0.015em]">{{ advancedTabLabel }}</h2>
              <p class="mt-1 text-xs text-muted-foreground">Configure this generation tool.</p>
            </div>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :aria-label="`Close ${advancedTabLabel}`"
              :title="`Close ${advancedTabLabel}`"
              @click="activeTab = ''"
            >
              <X class="h-4 w-4" />
            </button>
          </header>
          <div class="space-y-4 px-5 pb-5 pt-2">
            <div v-if="activeTab === 'photomaker'" class="space-y-3">
              <span class="aui-label mb-2 block text-xs font-medium text-muted-foreground"
                >ID images, up to 4</span
              >
              <div
                class="aui-media-strip flex flex-wrap gap-2 rounded-[18px] border border-border/60 bg-muted/25 p-2"
              >
                <div
                  v-for="(img, idx) in config.photoMakerImages"
                  :key="idx"
                  class="group relative size-20 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors duration-150 hover:border-foreground/30"
                >
                  <img :src="getFileUrl(img)" class="h-full w-full object-cover" />
                  <button
                    @click="removePMImage(idx)"
                    class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-150 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    title="Remove image"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </div>
                <label
                  v-if="config.photoMakerImages.length < 4"
                  class="flex size-20 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/60 text-muted-foreground transition-all duration-150 hover:border-foreground/30 hover:bg-background hover:text-foreground"
                  title="Add ID image"
                >
                  <Plus class="h-5 w-5" />
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    class="hidden"
                    @change="handlePMUpload"
                  />
                </label>
              </div>
              <div>
                <label class="aui-label mb-2 block text-xs font-medium text-muted-foreground"
                  >Style Strength ({{ config.photoMakerStyleStrength }})</label
                >
                <input
                  v-model.number="config.photoMakerStyleStrength"
                  type="range"
                  min="0"
                  max="100"
                  class="w-full accent-primary"
                />
              </div>
            </div>
            <div v-if="activeTab === 'controlnet'" class="space-y-3">
              <span class="aui-label mb-2 block text-xs font-medium text-muted-foreground"
                >Control image</span
              >
              <div
                class="aui-media-strip group relative size-20 overflow-hidden rounded-xl border border-border bg-muted/25 shadow-sm transition-colors duration-150 hover:border-foreground/30"
              >
                <img
                  v-if="config.controlImagePath"
                  :src="getFileUrl(config.controlImagePath)"
                  class="h-full w-full object-cover"
                />
                <label
                  class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center text-muted-foreground"
                >
                  <Upload v-if="!config.controlImagePath" class="h-5 w-5" />
                  <span v-if="!config.controlImagePath" class="mt-1 text-[10px] font-semibold"
                    >Upload</span
                  >
                  <input type="file" accept="image/*" class="hidden" @change="handleCNUpload" />
                </label>
                <button
                  v-if="config.controlImagePath"
                  @click.stop="clearControlNetImage"
                  class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-150 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Remove control image"
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
              <div>
                <label class="aui-label mb-2 block text-xs font-medium text-muted-foreground"
                  >Strength ({{ config.controlNetStrength }})</label
                >
                <input
                  v-model.number="config.controlNetStrength"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  class="w-full accent-primary"
                />
              </div>
              <label class="flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2.5 text-xs">
                <input v-model="config.applyCanny" type="checkbox" class="rounded border-border" />
                Apply Canny Preprocessor
              </label>
            </div>
            <div v-if="activeTab === 'img2img'" class="space-y-3">
              <span class="aui-label mb-2 block text-xs font-medium text-muted-foreground"
                >Initial image</span
              >
              <div
                class="aui-media-strip group relative size-20 overflow-hidden rounded-xl border border-border bg-muted/25 shadow-sm transition-colors duration-150 hover:border-foreground/30"
              >
                <img
                  v-if="config.initImagePath"
                  :src="getFileUrl(config.initImagePath)"
                  class="h-full w-full object-cover"
                />
                <label
                  class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center text-muted-foreground"
                >
                  <Upload v-if="!config.initImagePath" class="h-5 w-5" />
                  <span v-if="!config.initImagePath" class="mt-1 text-[10px] font-semibold"
                    >Upload</span
                  >
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleInitImageUpload"
                  />
                </label>
                <button
                  v-if="config.initImagePath"
                  @click.stop="clearInitImage"
                  class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-150 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Remove init image"
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
              <div>
                <label class="aui-label mb-2 block text-xs font-medium text-muted-foreground"
                  >Denoising Strength ({{ config.img2imgStrength }})</label
                >
                <input
                  v-model.number="config.img2imgStrength"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  class="w-full accent-primary"
                />
                <div class="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Original</span><span>Generated</span>
                </div>
              </div>
            </div>
            <div v-if="activeTab === 'kontext'" class="space-y-3">
              <span class="aui-label mb-2 block text-xs font-medium text-muted-foreground"
                >Reference image</span
              >
              <div
                class="aui-media-strip group relative size-20 overflow-hidden rounded-xl border border-border bg-muted/25 shadow-sm transition-colors duration-150 hover:border-foreground/30"
              >
                <img
                  v-if="config.kontextRefImage"
                  :src="getFileUrl(config.kontextRefImage)"
                  class="h-full w-full object-cover"
                />
                <label
                  class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center text-muted-foreground"
                >
                  <Upload v-if="!config.kontextRefImage" class="h-5 w-5" />
                  <span v-if="!config.kontextRefImage" class="mt-1 text-[10px] font-semibold"
                    >Upload</span
                  >
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleKontextUpload"
                  />
                </label>
                <button
                  v-if="config.kontextRefImage"
                  @click.stop="clearKontextImage"
                  class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-150 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Remove reference image"
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
              <p class="text-[11px] leading-4 text-muted-foreground">
                Use this for context-aware editing or reference-guided generation with consistent
                styles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
