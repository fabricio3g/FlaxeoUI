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
const galleryImages = ref<string[]>([])
const error = ref<string | null>(null)
const serverOnline = ref(false)
const currentImageFilename = ref<string | null>(null)
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
  stopPreviewPolling() // Ensure no duplicate intervals
  previewPollInterval = setInterval(async () => {
    try {
      const response = await fetch(getPreviewImageUrl())
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 0) {
          // Only update if we got an actual image
          previewImage.value = `${getApiBase()}/temp/preview.png?t=${Date.now()}`
        }
      }
    } catch (e) {
      // Preview not available yet, silently ignore
    }
  }, 1000) // Poll every 1 second
}

/**
 * stopPreviewPolling() - Stop the preview polling interval
 */
function stopPreviewPolling(): void {
  if (previewPollInterval) {
    clearInterval(previewPollInterval)
    previewPollInterval = null
  }
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
    prompt: 'Editorial portrait of a person in soft window light, 85mm photography, natural skin texture'
  },
  {
    label: 'Product concept',
    prompt: 'Premium product concept on a sculptural pedestal, studio lighting, clean art direction'
  },
  {
    label: 'Cinematic landscape',
    prompt: 'Cinematic mountain landscape at dawn, low clouds, atmospheric depth, detailed composition'
  },
  {
    label: 'Abstract poster',
    prompt: 'Bold abstract poster with geometric forms, tactile paper texture, precise editorial layout'
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
  if (activeTab.value === tab) return 'bg-foreground text-background'
    if (advancedConfigured(tab))
    return 'text-foreground border-foreground/30 bg-foreground/5'
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
      toast.success('Generation complete!')
    } else if (result.filename) {
      galleryImages.value = [result.filename, ...galleryImages.value]
      previewImage.value = getOutputUrl(result.filename)
      currentImageFilename.value = result.filename
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
}

/**
 * deletePreview() - Delete the current preview image
 */
async function deletePreview(): Promise<void> {
  if (!currentImageFilename.value) return

  const filenameToDelete = currentImageFilename.value

  try {
    await apiPost('/api/delete', { filename: filenameToDelete })
    galleryImages.value = galleryImages.value.filter((f) => f !== filenameToDelete)

    if (galleryImages.value.length > 0) {
      selectGalleryImage(galleryImages.value[0])
    } else {
      previewImage.value = null
      currentImageFilename.value = null
    }
    toast.success('Image deleted')
  } catch (e) {
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
  if (e.key === 'Delete' && previewImage.value && !isGenerating.value) {
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
  })
})
</script>

<template>
  <div class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <!-- Preview Area -->
    <div class="relative flex-1 min-h-0 overflow-hidden px-3 pt-3 md:px-8 md:pt-8">
      <div
        v-if="error"
        class="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-sm"
      >
        {{ error }}
        <button @click="error = null" class="hover:opacity-70"><X class="h-4 w-4" /></button>
      </div>

      <div class="mx-auto flex h-full w-full max-w-4xl min-h-0 flex-col">
        <div
          class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg group"
        >
          <img
            v-if="previewImage"
            :src="previewImage"
            class="animate-in fade-in duration-200 h-full max-h-full max-w-full object-contain"
            alt="Generated image"
          />
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center">
            <div
              v-if="!isGenerating"
              class="flex max-w-2xl flex-col items-center px-6 text-center"
            >
              <h1 class="text-2xl font-semibold tracking-tight text-foreground">What will you create?</h1>
              <div class="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Prompt ideas">
                <button
                  v-for="suggestion in promptSuggestions"
                  :key="suggestion.label"
                  type="button"
                  class="inline-flex h-7 items-center rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  @click="usePromptSuggestion(suggestion.prompt)"
                >
                  {{ suggestion.label }}
                </button>
              </div>
            </div>
            <div v-else class="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span class="relative flex h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-50"></span>
                <span class="relative inline-flex h-2 w-2 rounded-full bg-foreground"></span>
              </span>
              Creating image
            </div>
          </div>
          <div
            v-if="previewImage && galleryImages.length > 1 && !isGenerating"
            class="pointer-events-none absolute inset-0 flex items-center justify-between px-4"
          >
            <button
              @click="navigateImage(-1)"
              class="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="{ 'opacity-0 cursor-default': isFirstImage }"
              :disabled="isFirstImage"
            >
              <ChevronLeft class="size-5" />
            </button>
            <button
              @click="navigateImage(1)"
              class="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="{ 'opacity-0 cursor-default': isLastImage }"
              :disabled="isLastImage"
            >
              <ChevronRight class="size-5" />
            </button>
          </div>
          <div
            v-if="previewImage && !isGenerating"
            class="absolute right-2 top-2 z-10 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <button
              @click="deletePreview"
              class="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Delete image"
            >
              <Trash2 class="size-4" />
            </button>
            <a
              :href="previewImage"
              :download="previewImage.split('/').pop()"
              class="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Download image"
              ><Download class="size-4"
            /></a>
          </div>
        </div>

        <GenerationProgressPill
          v-if="isGenerating"
          class="mt-2"
          loading-text="Loading model"
          fallback-label="CLI-GEN"
          :live-preview="previewImage?.includes('temp/preview.png')"
        />

        <div v-if="galleryImages.length > 0" class="mt-4 w-full shrink-0">
          <div class="mb-2 flex items-center justify-between px-1">
            <h3
              class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <Image class="h-3.5 w-3.5" /> Recent generations ({{ galleryImages.length }})
            </h3>
          </div>
          <div class="relative rounded-lg border border-border bg-card p-2 group/carousel">
            <div
              ref="carouselRef"
              class="flex gap-2 overflow-x-auto p-1 snap-x scroll-smooth no-scrollbar md:gap-3"
            >
              <button
                v-for="img in galleryImages"
                :key="img"
                @click="selectGalleryImage(img)"
                class="relative h-16 w-16 shrink-0 snap-start overflow-hidden rounded-md border border-transparent transition-all md:h-20 md:w-20 focus:outline-none focus:ring-2 focus:ring-ring/40 hover:opacity-100"
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
              class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent"
            ></div>
            <div
              class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3 pt-2 md:px-8 md:pb-6 md:pt-3">
      <div class="relative mx-auto flex w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring/40">
        <!-- Top inline row: Positive / Negative + LoRA + Embedding -->
        <div
          class="flex flex-nowrap items-center gap-1 whitespace-nowrap px-2 pt-2 text-xs md:px-3 md:pt-3"
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
          <button
            type="button"
            class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none"
            :class="config.loras.length ? 'bg-foreground/5 text-foreground' : ''"
            title="Configure LoRA modules"
            @click="openPromptAssetModal('lora')"
          >
            <span>LoRA</span>
            <span v-if="config.loras.length" class="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-background px-1 text-[10px] font-bold text-foreground">{{ config.loras.length }}</span>
          </button>
          <button
            type="button"
            class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none"
            :class="config.embeddings.length ? 'bg-foreground/5 text-foreground' : ''"
            title="Configure embeddings"
            @click="openPromptAssetModal('embedding')"
          >
            <span>Embedding</span>
            <span v-if="config.embeddings.length" class="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-background px-1 text-[10px] font-bold text-foreground">{{ config.embeddings.length }}</span>
          </button>
          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Preview</span>
            <Select
              v-model="config.livePreviewMethod"
              size="sm"
              placeholder="None"
              aria-label="Live preview"
              class="w-24"
              :options="[
                { label: 'None', value: '' },
                { label: 'Proj', value: 'proj' },
                { label: 'TAE', value: 'tae' },
                { label: 'VAE', value: 'vae' }
              ]"
            />
          </div>
        </div>

        <!-- Textarea + send button -->
        <div class="flex items-end gap-2 px-2 pt-1.5 pb-2 md:px-3">
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
              class="flex w-full resize-none rounded-md border-0 bg-transparent px-3 py-2.5 text-[15px] leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:px-4 md:py-3 overflow-y-auto"
              :style="{
                minHeight: isMobile ? '72px' : '88px',
                maxHeight: isMobile ? '160px' : '220px'
              }"
              :disabled="isGenerating"
              @keydown="onPromptKeydown"
              @input="autoResize"
            ></textarea>
            <span
              v-if="promptMode === 'positive' && config.embeddings.length > 0"
              class="absolute right-2 top-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
              >{{ config.embeddings.length }} embeds</span
            >
            <div class="absolute bottom-3 right-3 flex items-end">
              <button
                  v-if="!isGenerating"
                  @click="handleGenerate"
                  :disabled="promptMode !== 'positive' || !prompt.trim()"
                  class="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="Generate"
                aria-label="Generate image"
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

        <!-- Section 4: Quick controls (Steps, CFG, Seed, Scheduler, Sampler, Resolution, advanced tools) -->
        <div
          class="flex flex-nowrap items-center gap-1 overflow-visible whitespace-nowrap px-2 pb-2 text-xs md:px-3"
        >
          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
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
          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
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
          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
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
          <div class="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Scheduler</span>
            <Select
              v-model="config.scheduler"
              size="sm"
              aria-label="Scheduler"
              :options="schedulerOptions"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Sampler</span>
            <Select
              v-model="config.sampler"
              size="sm"
              aria-label="Sampler"
              :options="samplerOptions"
            />
          </div>
          <div class="relative shrink-0">
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium transition-colors focus-visible:outline-none"
              :class="showResolutionMenu ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'"
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
              class="resolution-menu absolute right-0 bottom-full z-[100] mb-1 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
              @click.stop
            >
              <div class="grid grid-cols-4 gap-1.5">
                <button
                  v-for="preset in resolutionPresets"
                  :key="preset.label"
                  type="button"
                  class="flex flex-col items-center justify-center rounded-md border p-2 text-xs transition-colors hover:bg-accent"
                  :class="
                    resolutionLabel === preset.label
                      ? 'border-foreground/30 bg-foreground/5 text-foreground'
                      : 'border-transparent text-muted-foreground'
                  "
                  @click="selectResolution(preset)"
                >
                  <span class="font-semibold">{{ preset.label }}</span>
                  <small class="text-[10px] text-muted-foreground">{{ preset.width }}×{{ preset.height }}</small>
                </button>
              </div>
              <div class="mt-3 border-t border-border pt-3">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Custom</span>
                <div class="mt-1.5 flex items-center gap-1.5">
                  <input
                    v-model.number="config.width"
                    type="number"
                    min="64"
                    step="64"
                    aria-label="Custom width"
                    class="h-8 w-16 rounded-md border border-input bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <span class="text-muted-foreground">×</span>
                  <input
                    v-model.number="config.height"
                    type="number"
                    min="64"
                    step="64"
                    aria-label="Custom height"
                    class="h-8 w-16 rounded-md border border-input bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <button
                    type="button"
                    class="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    @click="applyCustomResolution"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="relative flex shrink-0 items-center gap-1">
            <button
              @click="activeTab = activeTab === 'photomaker' ? '' : 'photomaker'"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('photomaker')"
              title="PhotoMaker"
              aria-label="Open PhotoMaker settings"
            >
              <User class="size-4" />
            </button>
            <button
              @click="activeTab = activeTab === 'controlnet' ? '' : 'controlnet'"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('controlnet')"
              title="ControlNet"
              aria-label="Open ControlNet settings"
            >
              <Activity class="size-4" />
            </button>
            <button
              @click="activeTab = activeTab === 'img2img' ? '' : 'img2img'"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('img2img')"
              title="Image to Image"
              aria-label="Open Image to Image settings"
            >
              <Image class="size-4" />
            </button>
            <button
              @click="activeTab = activeTab === 'kontext' ? '' : 'kontext'"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="advancedButtonClass('kontext')"
              title="Reference (Flux)"
              aria-label="Open Reference (Flux) settings"
            >
              <ImagePlus class="size-4" />
            </button>
          </div>
          <PromptPresetControls
            v-model:prompt="prompt"
            v-model:negative-prompt="negativePrompt"
            compact
            class="shrink-0"
          />
        </div>
      </div>
    </div>

    <div
      v-if="showPromptAssets"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
      @click="showPromptAssets = false"
    >
      <div
        class="flex h-[min(60vh,480px)] w-[min(36rem,calc(100vw-2rem))] max-w-full flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        @click.stop
      >
        <ConfigPanel
          :collapsed="false"
          :focus="promptAssetFocus"
          @close="showPromptAssets = false"
        />
      </div>
    </div>

    <!-- Advanced tool modal (PhotoMaker / ControlNet / Img2Img / Kontext) -->
    <Teleport to="body">
      <div
        v-if="activeTab"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
        @click="activeTab = ''"
      >
        <div
          class="relative w-[28rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
          role="dialog"
          aria-modal="true"
          @click.stop
        >
          <header class="flex items-start justify-between border-b border-border p-4">
            <div>
              <h2 class="text-base font-semibold tracking-tight">{{ advancedTabLabel }}</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">Configure this generation tool.</p>
            </div>
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :aria-label="`Close ${advancedTabLabel}`"
              :title="`Close ${advancedTabLabel}`"
              @click="activeTab = ''"
            >
              <X class="h-4 w-4" />
            </button>
          </header>
          <div class="space-y-4 p-4">
            <div v-if="activeTab === 'photomaker'" class="space-y-3">
              <span class="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ID Images (Max 4)</span>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="(img, idx) in config.photoMakerImages"
                  :key="idx"
                  class="relative size-20 overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors group hover:border-foreground/30"
                >
                  <img :src="getFileUrl(img)" class="h-full w-full object-cover" />
                  <button
                    @click="removePMImage(idx)"
                    class="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    title="Remove image"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </div>
                <label
                  v-if="config.photoMakerImages.length < 4"
                  class="flex size-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground"
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
                <label class="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
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
              <span class="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Control Image</span>
              <div class="relative size-20 overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors group hover:border-foreground/30">
                <img
                  v-if="config.controlImagePath"
                  :src="getFileUrl(config.controlImagePath)"
                  class="h-full w-full object-cover"
                />
                <label
                  class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center text-muted-foreground"
                >
                  <Upload v-if="!config.controlImagePath" class="h-5 w-5" />
                  <span v-if="!config.controlImagePath" class="mt-1 text-[10px] font-semibold">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleCNUpload"
                  />
                </label>
                <button
                  v-if="config.controlImagePath"
                  @click.stop="clearControlNetImage"
                  class="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Remove control image"
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
              <div>
                <label class="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
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
              <label class="flex items-center gap-2 text-xs">
                <input
                  v-model="config.applyCanny"
                  type="checkbox"
                  class="rounded border-border"
                />
                Apply Canny Preprocessor
              </label>
            </div>
            <div v-if="activeTab === 'img2img'" class="space-y-3">
              <span class="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Init Image</span>
              <div class="relative size-20 overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors group hover:border-foreground/30">
                <img
                  v-if="config.initImagePath"
                  :src="getFileUrl(config.initImagePath)"
                  class="h-full w-full object-cover"
                />
                <label
                  class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center text-muted-foreground"
                >
                  <Upload v-if="!config.initImagePath" class="h-5 w-5" />
                  <span v-if="!config.initImagePath" class="mt-1 text-[10px] font-semibold">Upload</span>
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
                  class="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Remove init image"
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
              <div>
                <label class="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
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
              <span class="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ref Image</span>
              <div class="relative size-20 overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors group hover:border-foreground/30">
                <img
                  v-if="config.kontextRefImage"
                  :src="getFileUrl(config.kontextRefImage)"
                  class="h-full w-full object-cover"
                />
                <label
                  class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center text-muted-foreground"
                >
                  <Upload v-if="!config.kontextRefImage" class="h-5 w-5" />
                  <span v-if="!config.kontextRefImage" class="mt-1 text-[10px] font-semibold">Upload</span>
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
                  class="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
