<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, getApiBase, getOutputUrl } from '@/services/api'
import { ArrowUp, ChevronDown, ChevronUp, Upload, X } from '@/lib/icons'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import { useGenerationStatus } from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import { samplerOptions, schedulerOptions } from '@/lib/generationOptions'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import { appendLoraPromptTokens } from '@/lib/promptTokens'

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

// Video generation state
const prompt = ref('')
const negativePrompt = ref('')
const { isGenerating } = useGenerationStatus('video')
const progress = useGenerationProgress()
const generatedVideo = ref<string | null>(null)
const generatedVideos = ref<string[]>([])
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

// Video mode: T2V (text to video) or I2V (image to video)
const videoMode = ref<'t2v' | 'i2v'>('t2v')

const videoModeOptions = [
  { value: 't2v', label: 'Text to Video' },
  { value: 'i2v', label: 'Image to Video' }
]

// Video parameters
const videoWidth = ref(832)
const videoHeight = ref(480)
const videoFrames = ref(33)
const flowShift = ref(3.0)
const showResolutionMenu = ref(false)

const resolutionPresets = [
  { label: '4:3', width: 640, height: 480 },
  { label: '3:2', width: 720, height: 480 },
  { label: '16:9', width: 640, height: 360 },
  { label: '1:1', width: 512, height: 512 },
  { label: '9:16', width: 360, height: 640 },
  { label: '2:3', width: 512, height: 768 }
]

const resolutionLabel = computed(() => {
  const preset = resolutionPresets.find(
    (item) => item.width === videoWidth.value && item.height === videoHeight.value
  )
  return preset?.label || `${videoWidth.value} × ${videoHeight.value}`
})

function selectResolution(preset: (typeof resolutionPresets)[number]): void {
  videoWidth.value = preset.width
  videoHeight.value = preset.height
  showResolutionMenu.value = false
}

function applyCustomResolution(): void {
  videoWidth.value = Math.max(64, Number(videoWidth.value) || 832)
  videoHeight.value = Math.max(64, Number(videoHeight.value) || 480)
  showResolutionMenu.value = false
}

// I2V reference image
const referenceImage = ref<string | null>(null)
const referenceFile = ref<File | null>(null)

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
}

/**
 * setVideoMode() - Switch between T2V and I2V
 */
function setVideoMode(mode: 't2v' | 'i2v'): void {
  videoMode.value = mode
}

function handleVideoMode(value: string): void {
  if (value === 't2v' || value === 'i2v') setVideoMode(value)
}

/**
 * handleImageUpload() - Handle reference image upload for I2V
 */
function handleImageUpload(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  referenceFile.value = file
  referenceImage.value = URL.createObjectURL(file)
}

async function loadReferenceFromUrl(url: string): Promise<void> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const name = url.split('/').pop()?.split('?')[0] || 'reference.png'
    referenceFile.value = new File([blob], name, { type: blob.type || 'image/png' })
    referenceImage.value = url
    videoMode.value = 'i2v'
  } catch (e) {
    console.error('Failed to load video reference:', e)
  }
}

/**
 * clearReferenceImage() - Clear the reference image
 */
function clearReferenceImage(): void {
  referenceImage.value = null
  referenceFile.value = null
}

function selectGeneratedVideo(filename: string): void {
  generatedVideo.value = getOutputUrl(filename)
}

/**
 * handleGenerate() - Generate video
 */
async function handleGenerate(): Promise<void> {
  if (!prompt.value.trim()) return

  isGenerating.value = true
  progress.start()
  error.value = null
  generatedVideo.value = null

  try {
    const formData = new FormData()
    formData.append('prompt', appendLoraPromptTokens(prompt.value, config.value.loras))
    formData.append('negative_prompt', negativePrompt.value)
    formData.append('width', videoWidth.value.toString())
    formData.append('height', videoHeight.value.toString())
    formData.append('video_frames', videoFrames.value.toString())
    formData.append('flow_shift', flowShift.value.toString())
    formData.append('steps', config.value.steps.toString())
    formData.append('cfg_scale', config.value.cfgScale.toString())
    formData.append('seed', config.value.seed.toString())
    formData.append('samplingMethod', config.value.sampler)
    formData.append('scheduler', config.value.scheduler)
    if (config.value.rngType) formData.append('rngType', config.value.rngType)
    if (config.value.samplerRngType) formData.append('samplerRngType', config.value.samplerRngType)

    // Add model info
    if (config.value.loadMode === 'split') {
      formData.append('diffusion_model', config.value.diffusionModel)
      if (config.value.highNoiseDiffusionModel)
        formData.append('highNoiseDiffusionModel', config.value.highNoiseDiffusionModel)
      if (config.value.t5xxlModel) formData.append('t5xxl', config.value.t5xxlModel)
      if (config.value.llmModel) formData.append('llm', config.value.llmModel)
      if (config.value.llmVisionModel) formData.append('llmVision', config.value.llmVisionModel)
      if (config.value.embeddingsConnectorsModel)
        formData.append('embeddingsConnectors', config.value.embeddingsConnectorsModel)
      if (config.value.vaeModel) formData.append('vae', config.value.vaeModel)
      if (config.value.audioVaeModel) formData.append('audioVae', config.value.audioVaeModel)
      if (config.value.vaeFormat) formData.append('vaeFormat', config.value.vaeFormat)
      if (config.value.clipVisionModel) formData.append('clip_vision', config.value.clipVisionModel)
    }

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
    if (config.value.cacheMode) formData.append('cacheMode', config.value.cacheMode)
    if (config.value.cacheOption) formData.append('cacheOption', config.value.cacheOption)
    if (config.value.scmMask) formData.append('scmMask', config.value.scmMask)
    if (config.value.scmPolicy) formData.append('scmPolicy', config.value.scmPolicy)
    if (config.value.loraApplyMode) formData.append('loraApplyMode', config.value.loraApplyMode)
    if (config.value.quantizationType)
      formData.append('quantizationType', config.value.quantizationType)
    if (config.value.predictionType) formData.append('predictionType', config.value.predictionType)
    if (config.value.extraSampleArgs)
      formData.append('extraSampleArgs', config.value.extraSampleArgs)
    if (config.value.extraTilingArgs)
      formData.append('extraTilingArgs', config.value.extraTilingArgs)
    if (config.value.disableImageMetadata) formData.append('disableImageMetadata', 'true')

    // I2V reference image
    if (videoMode.value === 'i2v' && referenceFile.value) {
      formData.append('reference_image', referenceFile.value)
    }

    const response = await fetch(`${getApiBase()}/api/generate-video`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    const result = await response.json()
    if (result.filename) {
      generatedVideos.value = [
        result.filename,
        ...generatedVideos.value.filter((video) => video !== result.filename)
      ]
      selectGeneratedVideo(result.filename)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Video generation failed'
    console.error('Video generation error:', e)
  } finally {
    isGenerating.value = false
    progress.stop()
  }
}

/**
 * handleCancel() - Cancel video generation
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

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showResolutionMenu.value) {
    showResolutionMenu.value = false
  }
}

function handleResolutionMenuClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.resolution-menu')) showResolutionMenu.value = false
}

onMounted(() => {
  handleWindowResize()
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('click', handleResolutionMenuClick)

  const referenceUrl = sessionStorage.getItem('videoReferenceImage')
  if (!referenceUrl) return

  sessionStorage.removeItem('videoReferenceImage')
  loadReferenceFromUrl(referenceUrl)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('click', handleResolutionMenuClick)
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
            class="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden"
          >
            <video
              v-if="generatedVideo"
              :src="generatedVideo"
              controls
              autoplay
              loop
              class="animate-in fade-in duration-200 h-full max-h-full max-w-full object-contain"
            ></video>

            <div
              v-else
              class="flex flex-col items-center justify-center px-6 text-center"
            >
              <div v-if="!isGenerating" class="flex max-w-md flex-col items-center">
                <h2 class="text-xl font-semibold tracking-tight">What will you move?</h2>
                <p class="mt-1 text-sm text-muted-foreground">Describe a scene or add a reference image to begin.</p>
              </div>
            <div v-else class="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span class="relative flex h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-50"></span>
                <span class="relative inline-flex h-2 w-2 rounded-full bg-foreground"></span>
              </span>
              Creating video
            </div>
          </div>
        </div>

        <GenerationProgressPill
          v-if="isGenerating"
          class="mt-2"
          loading-text="Loading model"
          fallback-label="VIDEO"
        />

        <div v-if="generatedVideos.length > 0" class="mt-4 w-full shrink-0">
          <div class="mb-2 flex items-center justify-between px-1">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent videos ({{ generatedVideos.length }})
            </h3>
          </div>
          <div class="relative rounded-lg border border-border bg-card p-2">
            <div class="flex gap-2 overflow-x-auto p-1 snap-x scroll-smooth no-scrollbar md:gap-3">
              <button
                v-for="video in generatedVideos"
                :key="video"
                class="relative h-16 w-24 shrink-0 snap-start overflow-hidden rounded-md border border-transparent transition-all md:h-20 md:w-32 focus:outline-none focus:ring-2 focus:ring-ring/40 hover:opacity-100"
                :class="
                  generatedVideo === getOutputUrl(video)
                    ? 'border-foreground/80 ring-2 ring-ring/40 z-10'
                    : 'opacity-70'
                "
                @click="selectGeneratedVideo(video)"
              >
                <video
                  :src="getOutputUrl(video)"
                  class="h-full w-full object-cover"
                  muted
                  preload="metadata"
                ></video>
                <span
                  class="absolute bottom-1 left-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-background"
                  >Video</span
                >
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3 pt-2 md:px-8 md:pb-6 md:pt-3">
      <div class="relative mx-auto flex w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring/40">
        <!-- Top inline row: Positive/Negative + video mode selector -->
        <div
          class="flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap px-2 pt-2 text-xs md:px-3 md:pt-3"
        >
          <SegmentedControl
            :model-value="promptMode"
            :options="promptModeOptions"
            size="sm"
            aria-label="Prompt mode"
            @update:model-value="setPromptMode"
          />
          <SegmentedControl
            :model-value="videoMode"
            :options="videoModeOptions"
            size="sm"
            class="shrink-0"
            @update:model-value="handleVideoMode"
          />
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
                  ? 'Describe the motion, subject, and visual direction...'
                  : 'Describe motion or visual details to avoid...'
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
                :disabled="promptMode !== 'positive' || !prompt.trim()"
                class="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="Generate Video"
                aria-label="Generate video"
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

        <!-- Reference image chip -->
        <div
          v-if="videoMode === 'i2v' && referenceImage"
          class="border-t border-border px-3 py-2"
        >
          <div
            class="inline-flex items-center gap-3 rounded-md border border-border bg-background p-2 shadow-xs"
          >
            <div class="relative size-12 overflow-hidden rounded-md border border-border">
              <img :src="referenceImage" class="h-full w-full object-cover" />
            </div>
            <div class="text-xs text-muted-foreground">Reference loaded</div>
            <button
              type="button"
              @click="clearReferenceImage"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Quick Controls (Size, Frames, Flow, Steps, CFG, Scheduler, Sampler, Reference upload, PromptPresets) -->
        <div
          class="flex flex-nowrap items-center gap-1 overflow-visible whitespace-nowrap px-3 pb-2 text-xs"
        >
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
                  <small class="text-[10px] text-muted-foreground">{{ preset.width }} × {{ preset.height }}</small>
                </button>
              </div>
              <div class="mt-3 border-t border-border pt-3">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Custom</span>
                <div class="mt-1.5 flex items-center gap-1.5">
                  <input
                    v-model.number="videoWidth"
                    type="number"
                    min="64"
                    step="16"
                    aria-label="Custom width"
                    class="h-8 w-16 rounded-md border border-input bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <span class="text-muted-foreground">×</span>
                  <input
                    v-model.number="videoHeight"
                    type="number"
                    min="64"
                    step="16"
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

          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Frames</span>
            <input
              v-model.number="videoFrames"
              type="number"
              min="9"
              max="129"
              step="4"
              aria-label="Video frames"
              class="h-6 w-12 bg-transparent text-foreground focus:outline-none"
            />
          </div>

          <div class="flex shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Flow</span>
            <input
              v-model.number="flowShift"
              type="number"
              min="0"
              max="10"
              step="0.5"
              aria-label="Flow shift"
              class="h-6 w-12 bg-transparent text-foreground focus:outline-none"
            />
          </div>

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
          <label class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Scheduler</span>
            <Select
              v-model="config.scheduler"
              size="sm"
              aria-label="Scheduler"
              class="border-0 bg-transparent"
              :options="schedulerOptions"
            />
          </label>
          <label class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted">
            <span class="text-muted-foreground">Sampler</span>
            <Select
              v-model="config.sampler"
              size="sm"
              aria-label="Sampler"
              class="border-0 bg-transparent"
              :options="samplerOptions"
            />
          </label>

          <div class="hidden flex-1 md:block"></div>

          <label
            v-if="videoMode === 'i2v'"
            class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-transparent bg-muted px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40"
            title="Upload reference image"
          >
            <Upload class="h-3.5 w-3.5" />
            <span>Reference</span>
            <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
          </label>

          <div class="hidden h-5 w-px shrink-0 bg-border md:block"></div>
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
