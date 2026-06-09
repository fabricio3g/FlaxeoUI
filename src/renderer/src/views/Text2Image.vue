<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, apiGet, getOutputUrl, apiPostForm, getFileUrl, getApiBase } from '@/services/api'
import {
  ArrowUp,
  Download,
  Minus,
  Trash2,
  X,
  User,
  Activity,
  ImagePlus,
  Plus,
  Upload,
  Copy,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image,
  Eye
} from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { useGeneration } from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

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
const currentTime = ref(new Date())
// const serverStats = ref<any>(null) // Unused

// Preview polling
let previewPollInterval: ReturnType<typeof setInterval> | null = null
let clockInterval: ReturnType<typeof setInterval> | null = null

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
const showSizeMenu = ref(false)
const showNegPrompt = ref(false)
const promptInput = ref<HTMLTextAreaElement | null>(null)

function autoResize(): void {
  const el = promptInput.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }
}

function onPromptKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleGenerate()
  }
}

// Size presets
const sizePresets = [
  { label: '512×512', width: 512, height: 512 },
  { label: '512×768', width: 512, height: 768 },
  { label: '768×512', width: 768, height: 512 },
  { label: '768×1344', width: 768, height: 1344 },
  { label: '1024×1024', width: 1024, height: 1024 },
  { label: '1024×1536', width: 1024, height: 1536 },
  { label: '1536×1024', width: 1536, height: 1024 },
  { label: '1920×1080', width: 1920, height: 1080 },
  { label: 'Manual', width: 0, height: 0 }
]

const isManual = ref(false)

const SAMPLER_OPTIONS = [
  { label: 'Euler', value: 'euler' },
  { label: 'Euler A', value: 'euler_a' },
  { label: 'Heun', value: 'heun' },
  { label: 'DPM2', value: 'dpm2' },
  { label: 'DPM++ 2S a', value: 'dpm++2s_a' },
  { label: 'DPM++ 2M', value: 'dpm++2m' },
  { label: 'DPM++ 2M v2', value: 'dpm++2mv2' },
  { label: 'IPNDM', value: 'ipndm' },
  { label: 'IPNDM V', value: 'ipndm_v' },
  { label: 'LCM', value: 'lcm' },
  { label: 'DDIM Trailing', value: 'ddim_trailing' },
  { label: 'TCD', value: 'tcd' },
  { label: 'Res Multistep', value: 'res_multistep' },
  { label: 'Res 2S', value: 'res_2s' },
  { label: 'ER-SDE', value: 'er_sde' },
  { label: 'Euler CFG++', value: 'euler_cfg_pp' },
  { label: 'Euler A CFG++', value: 'euler_a_cfg_pp' }
]

const activePreset = computed(() => {
  if (isManual.value) return sizePresets.find((p) => p.label === 'Manual')
  return sizePresets.find((p) => p.width === config.value.width && p.height === config.value.height)
})

const greetingTitle = computed(() => {
  const hour = currentTime.value.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const greetingMessage = computed(() => {
  const time = currentTime.value.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
  return time
})

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
  if (activeTab.value === tab) return 'primary-metal-button'
  if (advancedConfigured(tab))
    return 'text-primary border-primary/40 bg-primary/10 hover:text-primary'
  return 'text-muted-foreground hover:text-foreground'
}

const advancedPopoverArrowClass = computed(() => {
  if (activeTab.value === 'photomaker') return 'right-[110px]'
  if (activeTab.value === 'controlnet') return 'right-[78px]'
  if (activeTab.value === 'img2img') return 'right-[46px]'
  return 'right-[14px]'
})

function setSize(preset: (typeof sizePresets)[0]): void {
  if (preset.label === 'Manual') {
    isManual.value = true
    return
  }
  isManual.value = false
  configStore.setDimensions(preset.width, preset.height)
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

function formatETA(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '...'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

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

function handleSizeMenuClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.size-menu')) {
    showSizeMenu.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
  if (e.key === 'ArrowLeft') navigateImage(-1)
  if (e.key === 'ArrowRight') navigateImage(1)
  if (e.key === 'Delete' && previewImage.value && !isGenerating.value) {
    if (confirm('Delete current image?')) deletePreview()
  }
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
  clockInterval = setInterval(() => {
    currentTime.value = new Date()
  }, 1000)

  // Check if sd-server is running
  await checkServerStatus()

  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleSizeMenuClick)

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
    window.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('click', handleSizeMenuClick)
    stopPreviewPolling()
    if (clockInterval) {
      clearInterval(clockInterval)
      clockInterval = null
    }
  })
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-muted/30 text-foreground">
    <!-- Preview Area -->
    <div class="flex-1 relative min-h-0 overflow-hidden p-4 md:p-6">
      <div
        v-if="error"
        class="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm flex items-center gap-2 z-50"
      >
        {{ error }}
        <button @click="error = null" class="hover:opacity-70"><X class="w-4 h-4" /></button>
      </div>

      <div class="mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col">
        <div
          class="relative flex min-h-0 flex-1 items-center justify-center rounded-2xl metal-surface group overflow-hidden dot-grid-corners"
        >
          <img
            v-if="previewImage"
            :src="previewImage"
            class="h-full max-h-full max-w-full object-contain"
            alt="Generated image"
          />
          <div
            v-else
            class="empty-preview-orb absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-white"
          >
            <div class="empty-preview-noise"></div>
            <div class="empty-preview-glow empty-preview-glow-a"></div>
            <div class="empty-preview-glow empty-preview-glow-b"></div>
            <div class="empty-preview-glow empty-preview-glow-c"></div>
            <div
              v-if="!isGenerating"
              class="relative z-10 flex max-w-lg flex-col items-center px-8 text-center text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
            >
              <span class="text-3xl font-semibold tracking-tight md:text-5xl">{{
                greetingTitle
              }}</span>
              <span class="mt-3 text-sm font-medium text-white/70 md:text-base">{{
                greetingMessage
              }}</span>
            </div>
          </div>
          <div
            v-if="isGenerating && !previewImage?.includes('temp/preview.png')"
            class="absolute inset-0 generating-halftone flex items-center justify-center"
          >
            <div class="generating-status max-w-sm w-full px-6">
              <div v-if="!progress.hasSteps" class="text-center">
                <div class="generating-loader-mark" aria-hidden="true">
                  <span></span><span></span><span></span><span></span> <span></span><span></span
                  ><span></span><span></span> <span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span>
                </div>
                <span class="generating-status-title">Loading model</span>
                <p class="generating-status-subtitle">Preparing to paint your idea...</p>
              </div>
              <div v-else class="flex flex-col items-center gap-3">
                <span class="text-sm font-semibold text-white/80">
                  Step {{ progress.current }} / {{ progress.total }}
                </span>
                <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 ease-linear"
                    :style="{ width: (progress.total > 0 ? (progress.current / progress.total) * 100 : 0) + '%' }"
                  ></div>
                </div>
                <div class="flex items-center gap-4 text-xs text-white/50">
                  <span v-if="progress.etaSeconds > 0">ETA {{ formatETA(progress.etaSeconds) }}</span>
                  <span v-if="progress.itPerSec > 0">{{ progress.itPerSec.toFixed(1) }} it/s</span>
                </div>
              </div>
            </div>
          </div>
          <div
            v-if="isGenerating && previewImage?.includes('temp/preview.png')"
            class="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur text-white text-xs rounded flex items-center gap-2"
          >
            <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            Live Preview
          </div>
          <div
            v-if="previewImage && galleryImages.length > 1 && !isGenerating"
            class="absolute inset-0 pointer-events-none flex items-center justify-between px-4"
          >
            <button
              @click="navigateImage(-1)"
              class="pointer-events-auto p-2 rounded-full bg-black/20 hover:bg-black/50 text-white/50 hover:text-white transition-colors backdrop-blur-sm"
              :class="{ 'opacity-0 cursor-default': isFirstImage }"
              :disabled="isFirstImage"
            >
              <ChevronLeft class="w-8 h-8" />
            </button>
            <button
              @click="navigateImage(1)"
              class="pointer-events-auto p-2 rounded-full bg-black/20 hover:bg-black/50 text-white/50 hover:text-white transition-colors backdrop-blur-sm"
              :class="{ 'opacity-0 cursor-default': isLastImage }"
              :disabled="isLastImage"
            >
              <ChevronRight class="w-8 h-8" />
            </button>
          </div>
          <div
            v-if="previewImage && !isGenerating"
            class="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <button
              @click="deletePreview"
              class="p-2 rounded-xl bg-card/85 hover:bg-destructive hover:text-destructive-foreground transition-colors shadow-sm backdrop-blur"
              title="Delete image"
            >
              <Trash2 class="w-4 h-4" />
            </button>
            <a
              :href="previewImage"
              :download="previewImage.split('/').pop()"
              class="p-2 rounded-xl bg-card/85 hover:bg-primary hover:text-primary-foreground transition-colors shadow-sm backdrop-blur"
              title="Download image"
              ><Download class="w-4 h-4"
            /></a>
          </div>
        </div>

        <div v-if="galleryImages.length > 0" class="mt-4 w-full shrink-0">
          <div class="flex items-center justify-between mb-2 px-1">
            <h3
              class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"
            >
              <Image class="w-3.5 h-3.5" /> Gallery ({{ galleryImages.length }})
            </h3>
          </div>
          <div class="relative group/carousel">
            <div
              ref="carouselRef"
              class="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 snap-x scroll-smooth no-scrollbar"
            >
              <button
                v-for="img in galleryImages"
                :key="img"
                @click="selectGalleryImage(img)"
                class="h-20 w-20 shrink-0 rounded-2xl overflow-hidden border-2 transition-colors relative group snap-start focus:outline-none focus:ring-2 focus:ring-primary/50"
                :class="
                  previewImage === getOutputUrl(img)
                    ? 'border-primary ring-2 ring-primary/20 shadow-lg scale-105 z-10'
                    : 'border-transparent hover:border-border/80 opacity-70 hover:opacity-100'
                "
              >
                <img
                  :src="getOutputUrl(img)"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  :alt="img"
                />
              </button>
            </div>
            <div
              class="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none"
            ></div>
            <div
              class="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 md:px-5 pb-3 md:pb-4 pt-2 md:pt-3">
      <div
        class="flaxeo-generation-controls relative overflow-visible rounded-3xl"
      >
        <!-- Quick Controls Row -->
        <div class="px-3 md:px-5 py-2 md:py-3 flex items-center gap-2 flex-wrap">
          <!-- Generation Params -->
          <div class="flex items-center gap-1.5 h-8 bg-card border border-border rounded-lg px-2 py-1">
            <span class="text-[11px] font-semibold text-foreground/70">Batch</span>
            <input
              v-model.number="config.batchCount"
              type="number"
              min="1"
              max="16"
              class="w-8 bg-transparent text-xs font-bold text-foreground focus:outline-none text-center appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div class="flex items-center gap-1.5 h-8 bg-card border border-border rounded-lg px-2 py-1">
            <span class="text-[11px] font-semibold text-foreground/70">Steps</span>
            <input
              v-model.number="config.steps"
              type="number"
              min="1"
              max="100"
              class="w-8 bg-transparent text-xs font-bold text-foreground focus:outline-none text-center appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div class="flex items-center gap-1.5 h-8 bg-card border border-border rounded-lg px-2 py-1">
            <span class="text-[11px] font-semibold text-foreground/70">CFG</span>
            <input
              v-model.number="config.cfgScale"
              type="number"
              min="0"
              max="30"
              step="0.5"
              class="w-9 bg-transparent text-xs font-bold text-foreground focus:outline-none text-center appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div class="flex items-center gap-1 h-8 bg-card border border-border rounded-lg px-2 py-1 min-w-0">
            <span class="text-[11px] font-semibold text-foreground/70 shrink-0">Sampler</span>
            <Select
              v-model="config.sampler"
              size="sm"
              placeholder="Sampler"
              :options="SAMPLER_OPTIONS"
              class="!border-0 !bg-transparent !p-0 !shadow-none !focus:ring-0 !text-xs !font-bold !w-[80px]"
            />
          </div>
          <div class="relative size-menu">
            <button
              @click="showSizeMenu = !showSizeMenu"
              class="flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-lg transition-colors shrink-0 leading-none bg-card border border-border h-8"
            >
              <span>{{ activePreset?.label ?? config.width + '×' + config.height }}</span>
              <ChevronUp class="w-3 h-3" />
            </button>
            <div
              v-if="showSizeMenu"
              class="absolute bottom-full left-0 z-50 mb-1 w-28 rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg"
            >
              <button
                v-for="preset in sizePresets"
                :key="preset.label"
                @click="setSize(preset); showSizeMenu = false"
                class="w-full text-left px-2 py-1 text-[10px] font-medium rounded hover:bg-muted/60 transition-colors"
                :class="
                  activePreset?.label === preset.label
                    ? 'text-foreground bg-muted/40'
                    : 'text-muted-foreground'
                "
              >
                {{ preset.label === 'Manual' ? 'Manual' : preset.width + '×' + preset.height }}
              </button>
            </div>
          </div>
          <div v-if="isManual" class="flex items-center gap-1 h-8 bg-card border border-border rounded-lg px-2 py-1">
            <span class="text-[11px] font-semibold text-foreground/70">W</span>
            <input
              v-model.number="config.width"
              type="number"
              step="64"
              class="w-12 bg-transparent text-xs font-bold text-foreground focus:outline-none text-center appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div v-if="isManual" class="flex items-center gap-1 h-8 bg-card border border-border rounded-lg px-2 py-1">
            <span class="text-[11px] font-semibold text-foreground/70">H</span>
            <input
              v-model.number="config.height"
              type="number"
              step="64"
              class="w-12 bg-transparent text-xs font-bold text-foreground focus:outline-none text-center appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div class="flex items-center gap-1 h-8 shrink-0 bg-card border border-border rounded-lg px-2 py-1">
            <Eye class="w-3 h-3 text-muted-foreground" />
            <Select
              v-model="config.livePreviewMethod"
              size="sm"
              placeholder="None"
              class="!w-auto !min-w-[68px] !h-8 !border-0 !bg-transparent !p-0 !shadow-none !focus:ring-0 text-[10px]"
              :options="[
                { label: 'None', value: '' },
                { label: 'Proj', value: 'proj' },
                { label: 'TAE', value: 'tae' },
                { label: 'VAE', value: 'vae' }
              ]"
            />
          </div>
          <div class="flex-1 hidden md:block"></div>
          <div class="relative flex items-center gap-1">
            <div
              v-if="activeTab"
              class="absolute bottom-full right-0 z-50 mb-3 w-[min(520px,calc(100vw-2rem))] rounded-lg border border-border/70 bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur"
            >
              <div v-if="activeTab === 'photomaker'" class="space-y-3">
                <div class="flex flex-col md:flex-row items-start gap-3">
                  <div class="flex-1">
                    <label class="text-[11px] font-medium text-muted-foreground block mb-2"
                      >ID Images (Max 4)</label
                    >
                    <div class="flex gap-2 flex-wrap">
                      <div
                        v-for="(img, idx) in config.photoMakerImages"
                        :key="idx"
                        class="relative group w-14 h-14 rounded-md overflow-hidden border border-border"
                      >
                        <img :src="getFileUrl(img)" class="w-full h-full object-cover" />
                        <button
                          @click="removePMImage(idx)"
                          class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                        >
                          <X class="w-4 h-4" />
                        </button>
                      </div>
                      <label
                        v-if="config.photoMakerImages.length < 4"
                        class="w-14 h-14 rounded-md border border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      >
                        <Plus class="w-5 h-5 text-muted-foreground" />
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          class="hidden"
                          @change="handlePMUpload"
                        />
                      </label>
                    </div>
                  </div>
                  <div class="w-full md:w-48">
                    <label class="text-[11px] font-medium text-muted-foreground block mb-2"
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
              </div>
              <div v-if="activeTab === 'controlnet'" class="space-y-3">
                <div class="flex flex-col md:flex-row items-start gap-3">
                  <div>
                    <label class="text-[11px] font-medium text-muted-foreground block mb-2"
                      >Control Image</label
                    >
                    <div
                      class="relative group w-20 h-20 rounded-md overflow-hidden border border-border bg-muted/20"
                    >
                      <img
                        v-if="config.controlImagePath"
                        :src="getFileUrl(config.controlImagePath)"
                        class="w-full h-full object-cover"
                      />
                      <label
                        class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 transition-colors"
                      >
                        <Upload
                          v-if="!config.controlImagePath"
                          class="w-6 h-6 text-muted-foreground/50"
                        />
                        <span
                          v-if="!config.controlImagePath"
                          class="text-[10px] text-muted-foreground/70 mt-1"
                          >Upload</span
                        >
                        <input
                          type="file"
                          accept="image/*"
                          class="hidden"
                          @change="handleCNUpload"
                        />
                      </label>
                      <button
                        v-if="config.controlImagePath"
                        @click="config.controlImagePath = ''; controlNetFile = null"
                        class="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div class="flex-1 space-y-3 min-w-0">
                    <div>
                      <label class="text-[11px] font-medium text-muted-foreground block mb-2"
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
                    <label class="flex items-center gap-2 text-xs"
                      ><input
                        v-model="config.applyCanny"
                        type="checkbox"
                        class="rounded border-border"
                      />Apply Canny Preprocessor</label
                    >
                  </div>
                </div>
              </div>
              <div v-if="activeTab === 'img2img'">
                <div class="flex flex-col md:flex-row items-start gap-3">
                  <div>
                    <label class="text-[11px] font-medium text-muted-foreground block mb-2"
                      >Init Image</label
                    >
                    <div
                      class="relative group w-20 h-20 rounded-md overflow-hidden border border-border bg-muted/20"
                    >
                      <img
                        v-if="config.initImagePath"
                        :src="getFileUrl(config.initImagePath)"
                        class="w-full h-full object-cover"
                      />
                      <label
                        class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 transition-colors"
                      >
                        <Upload
                          v-if="!config.initImagePath"
                          class="w-6 h-6 text-muted-foreground/50"
                        />
                        <span
                          v-if="!config.initImagePath"
                          class="text-[10px] text-muted-foreground/70 mt-1"
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
                        @click="config.initImagePath = ''; initImageFile = null"
                        class="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div class="flex-1 space-y-3 min-w-0">
                    <div>
                      <label class="text-[11px] font-medium text-muted-foreground block mb-2"
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
                      <div class="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>Original</span><span>Generated</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="activeTab === 'kontext'">
                <div class="flex flex-col md:flex-row items-start gap-3">
                  <div>
                    <label class="text-[11px] font-medium text-muted-foreground block mb-2"
                      >Ref Image</label
                    >
                    <div
                      class="relative group w-20 h-20 rounded-md overflow-hidden border border-border bg-muted/20"
                    >
                      <img
                        v-if="config.kontextRefImage"
                        :src="getFileUrl(config.kontextRefImage)"
                        class="w-full h-full object-cover"
                      />
                      <label
                        class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 transition-colors"
                      >
                        <Upload
                          v-if="!config.kontextRefImage"
                          class="w-6 h-6 text-muted-foreground/50"
                        />
                        <span
                          v-if="!config.kontextRefImage"
                          class="text-[10px] text-muted-foreground/70 mt-1"
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
                        @click="config.kontextRefImage = ''; kontextRefFile = null"
                        class="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p class="text-[11px] leading-4 text-muted-foreground flex-1 pt-1">
                    Use this for context-aware editing or reference-guided generation with
                    consistent styles.
                  </p>
                </div>
              </div>
              <div
                class="absolute -bottom-1 h-2 w-2 rotate-45 border-b border-r border-border/70 bg-popover/95"
                :class="advancedPopoverArrowClass"
              ></div>
            </div>
            <button
              @click="activeTab = activeTab === 'photomaker' ? '' : 'photomaker'"
              class="h-9 w-9 md:h-7 md:w-7 metal-icon-button flex items-center justify-center rounded-lg"
              :class="advancedButtonClass('photomaker')"
              title="PhotoMaker"
            >
              <User class="w-4 h-4 md:w-3 md:h-3" />
            </button>
            <button
              @click="activeTab = activeTab === 'controlnet' ? '' : 'controlnet'"
              class="h-9 w-9 md:h-7 md:w-7 metal-icon-button flex items-center justify-center rounded-lg"
              :class="advancedButtonClass('controlnet')"
              title="ControlNet"
            >
              <Activity class="w-4 h-4 md:w-3 md:h-3" />
            </button>
            <button
              @click="activeTab = activeTab === 'img2img' ? '' : 'img2img'"
              class="h-9 w-9 md:h-7 md:w-7 metal-icon-button flex items-center justify-center rounded-lg"
              :class="advancedButtonClass('img2img')"
              title="Image to Image"
            >
              <Image class="w-4 h-4 md:w-3 md:h-3" />
            </button>
            <button
              @click="activeTab = activeTab === 'kontext' ? '' : 'kontext'"
              class="h-9 w-9 md:h-7 md:w-7 metal-icon-button flex items-center justify-center rounded-lg"
              :class="advancedButtonClass('kontext')"
              title="Reference (Flux)"
            >
              <ImagePlus class="w-4 h-4 md:w-3 md:h-3" />
            </button>
          </div>
          <div class="flex items-center gap-1.5 text-muted-foreground">
            <button
              @click="showNegPrompt = !showNegPrompt"
              class="h-8 w-8 metal-icon-button flex items-center justify-center transition-colors duration-150 rounded-lg"
              :class="
                showNegPrompt
                  ? 'primary-metal-button text-white'
                  : 'text-muted-foreground hover:text-foreground'
              "
              title="Negative Prompt"
            >
              <Minus class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="h-5 w-px bg-border/80 hidden md:block"></div>
          <PromptPresetControls
            v-model:prompt="prompt"
            v-model:negative-prompt="negativePrompt"
            compact
          />
        </div>

        <!-- Floating Input Bar -->
        <div class="flax-composer rounded-2xl">
          <div class="flax-composer-input-row flex items-end gap-2">
            <div class="flex-1 relative">
              <textarea
                v-model="prompt"
                ref="promptInput"
                rows="1"
                placeholder="Describe the image you want to generate..."
                class="flax-composer-textarea w-full resize-none metal-surface !rounded-xl px-6 md:px-5 py-6 md:py-4 pr-16 text-xl md:text-lg leading-7 text-foreground transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50 overflow-y-auto"
                :style="{ minHeight: '120px', maxHeight: '360px' }"
                :disabled="isGenerating"
                @keydown="onPromptKeydown"
                @input="autoResize"
              ></textarea>
              <span
                v-if="config.embeddings.length > 0"
                class="absolute top-1 right-2 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]"
                >{{ config.embeddings.length }} embeds</span
              >
              <div class="absolute bottom-3 right-3 flex items-end">
                <button
                  v-if="!isGenerating"
                  @click="handleGenerate"
                  :disabled="!prompt.trim()"
                  class="flax-composer-send metal-icon-button flex items-center justify-center h-9 w-9 md:h-8 md:w-8 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Generate"
                >
                  <span class="flax-composer-send-icon inline-flex"
                    ><ArrowUp class="w-4.5 h-4.5 stroke-[2.5]"
                  /></span>
                </button>
                <button
                  v-else
                  @click="handleCancel"
                  class="metal-icon-button flex items-center justify-center h-9 w-9 md:h-8 md:w-8 rounded-lg"
                  title="Cancel"
                >
                  <X class="w-4.5 h-4.5 md:w-4 md:h-4" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="showNegPrompt" class="mt-2 border-t border-border/50 pt-2">
            <textarea
              v-model="negativePrompt"
              rows="2"
              placeholder="Things to avoid: blurry, low quality, distorted..."
              class="flax-composer-negative w-full resize-none metal-surface !rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
              :disabled="isGenerating"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
