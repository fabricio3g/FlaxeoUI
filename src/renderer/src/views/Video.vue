<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { authenticatedFetch, getOutputUrl } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { buildGenerationPayload, type GenerationPayload } from '@/lib/generationPayload'
import { pickConfigSnapshot } from '@/lib/configSnapshot'
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  SlidersHorizontal,
  Square,
  Upload,
  X
} from '@/lib/icons'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import BrandMark from '@/components/BrandMark.vue'
import {
  isAnyGenerationBusy,
  toastGenerationError,
  useGenerationStatus
} from '@/composables/useGeneration'
import { formatProgressTime, useGenerationProgress } from '@/composables/useGenerationProgress'
import { useJobQueue, type FormPart } from '@/composables/useJobQueue'
import { samplerOptions, schedulerOptions } from '@/lib/generationOptions'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useGenerationHistory } from '@/composables/useGenerationHistory'

const toast = useToast()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

// Video generation state
const prompt = ref('')
const negativePrompt = ref('')
const { isGenerating } = useGenerationStatus('video')
const progress = useGenerationProgress()
const { addEntry: addHistoryEntry } = useGenerationHistory()
const { enqueue, cancelCurrent, pendingCount } = useJobQueue()

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

// Video mode: T2V, I2V, or FLF2V (first/last frame)
const videoMode = ref<'t2v' | 'i2v' | 'flf2v'>('t2v')

const videoModeOptions = [
  { value: 't2v', label: 'T2V' },
  { value: 'i2v', label: 'I2V' },
  { value: 'flf2v', label: 'FLF2V' }
]

// Video parameters
const videoWidth = ref(832)
const videoHeight = ref(480)
const videoFrames = ref(33)
const videoFps = ref(24)
const flowShift = ref(3.0)
const showResolutionMenu = ref(false)

// High-noise suite (Wan2.2 MoE)
const highNoiseSteps = ref(8)
const highNoiseCfg = ref(3.5)
const highNoiseSampler = ref('euler')
const highNoiseGuidance = ref(0)
const showHighNoise = ref(false)

// VACE / control video (advanced)
const controlVideoPath = ref('')
const vaceStrength = ref(1)
const moeBoundary = ref(0.875)

const hasHighNoiseModel = computed(() => !!config.value.highNoiseDiffusionModel)

const resolutionPresets = [
  { label: '4:3', width: 640, height: 480 },
  { label: '3:2', width: 720, height: 480 },
  { label: '16:9', width: 640, height: 360 },
  { label: '1:1', width: 512, height: 512 },
  { label: '9:16', width: 360, height: 640 },
  { label: '2:3', width: 512, height: 768 }
]

const resolutionLabel = computed(() => {
  return `${videoWidth.value}×${videoHeight.value}`
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

// I2V / FLF2V frames
const referenceImage = ref<string | null>(null)
const referenceFile = ref<File | null>(null)
const endImage = ref<string | null>(null)
const endFile = ref<File | null>(null)

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

function handleWindowResize(): void {
  isMobile.value = window.innerWidth < 768
}

/**
 * setVideoMode() - Switch between T2V / I2V / FLF2V
 */
function setVideoMode(mode: 't2v' | 'i2v' | 'flf2v'): void {
  videoMode.value = mode
}

function handleVideoMode(value: string): void {
  if (value === 't2v' || value === 'i2v' || value === 'flf2v') setVideoMode(value)
}

/**
 * handleImageUpload() - Handle start/reference frame upload for I2V or FLF2V
 */
function handleImageUpload(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  referenceFile.value = file
  referenceImage.value = URL.createObjectURL(file)
  if (videoMode.value === 't2v') videoMode.value = 'i2v'
}

function handleEndImageUpload(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  endFile.value = file
  endImage.value = URL.createObjectURL(file)
  videoMode.value = 'flf2v'
}

async function loadReferenceFromUrl(url: string): Promise<void> {
  try {
    const response = await authenticatedFetch(url)
    const blob = await response.blob()
    const name = url.split('/').pop()?.split('?')[0] || 'reference.png'
    referenceFile.value = new File([blob], name, { type: blob.type || 'image/png' })
    referenceImage.value = url
    if (videoMode.value === 't2v') videoMode.value = 'i2v'
  } catch (e) {
    console.error('Failed to load video reference:', e)
  }
}

/**
 * clearReferenceImage() - Clear the start / reference frame
 */
function clearReferenceImage(): void {
  if (referenceImage.value?.startsWith('blob:')) URL.revokeObjectURL(referenceImage.value)
  referenceImage.value = null
  referenceFile.value = null
}

function clearEndImage(): void {
  if (endImage.value?.startsWith('blob:')) URL.revokeObjectURL(endImage.value)
  endImage.value = null
  endFile.value = null
}

function selectGeneratedVideo(filename: string): void {
  generatedVideo.value = getOutputUrl(filename)
}

/**
 * handleGenerate() - Snapshot + enqueue video job
 */
async function handleGenerate(): Promise<void> {
  if (!prompt.value.trim()) return

  const snapshot = {
    ...pickConfigSnapshot(config.value),
    width: videoWidth.value,
    height: videoHeight.value,
    flowShift: flowShift.value
  }
  const promptSnap = prompt.value
  const negSnap = negativePrompt.value
  const seedSnap = config.value.seed
  const w = videoWidth.value
  const h = videoHeight.value

  const extra: Record<string, string | number | boolean | undefined> = {
    video_frames: videoFrames.value,
    videoFrames: videoFrames.value,
    fps: videoFps.value,
    flow_shift: flowShift.value,
    flowShift: flowShift.value,
    videoMode: true
  }

  if (hasHighNoiseModel.value || showHighNoise.value) {
    extra.highNoiseSteps = highNoiseSteps.value
    extra.highNoiseCfg = highNoiseCfg.value
    extra.highNoiseSampler = highNoiseSampler.value
    if (highNoiseGuidance.value > 0) extra.highNoiseGuidance = highNoiseGuidance.value
    extra.moeBoundary = moeBoundary.value
  }

  if (controlVideoPath.value.trim()) {
    extra.controlVideo = controlVideoPath.value.trim()
    extra.vaceStrength = vaceStrength.value
  }

  const payload = buildGenerationPayload(config.value, {
    prompt: promptSnap,
    negativePrompt: negSnap,
    width: w,
    height: h,
    extra
  })
  const formParts = payloadToFormParts(payload)

  if ((videoMode.value === 'i2v' || videoMode.value === 'flf2v') && referenceFile.value) {
    formParts.push({ name: 'reference_image', type: 'file', file: referenceFile.value })
  }
  if (videoMode.value === 'flf2v' && endFile.value) {
    formParts.push({ name: 'endImage', type: 'file', file: endFile.value })
  }

  const busy = isAnyGenerationBusy()
  error.value = null
  generatedVideo.value = null

  enqueue({
    surface: 'video',
    label: promptSnap,
    prompt: promptSnap,
    negativePrompt: negSnap,
    seed: seedSnap,
    width: w,
    height: h,
    configSnapshot: snapshot,
    kind: 'form',
    endpoint: '/api/generate-video',
    formParts,
    onStart: () => progress.start(),
    onSuccess: (result) => {
      if (result.filename) {
        generatedVideos.value = [
          result.filename,
          ...generatedVideos.value.filter((video) => video !== result.filename)
        ]
        selectGeneratedVideo(result.filename)
        toast.success('Video complete')
        addHistoryEntry({
          surface: 'video',
          status: 'success',
          prompt: promptSnap,
          negativePrompt: negSnap,
          seed: seedSnap,
          width: w,
          height: h,
          filename: result.filename,
          configSnapshot: snapshot
        })
      }
    },
    onError: (msg) => {
      if (msg === 'Cancelled') {
        toast.warning('Video cancelled')
        return
      }
      error.value = msg
      toastGenerationError(toast, msg, 'Video generation failed')
      addHistoryEntry({
        surface: 'video',
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
          class="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-border/60 bg-background/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_1px_2px_rgb(0_0_0/0.03)]"
          :class="
            !generatedVideo && !isGenerating ? 'border-transparent bg-transparent shadow-none' : ''
          "
        >
          <video
            v-if="generatedVideo"
            :src="generatedVideo"
            controls
            autoplay
            loop
            class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both h-full max-h-full w-full max-w-full rounded-2xl object-contain duration-200"
          ></video>

          <div v-else class="flex flex-col items-center justify-center px-6 text-center">
            <div v-if="!isGenerating" class="content-item flex max-w-md flex-col items-center">
              <BrandMark size="lg" class="text-foreground" />
              <h2 class="mt-5 text-base font-medium tracking-tight text-foreground">
                What will you move?
              </h2>
              <p class="mt-2 text-sm leading-6 text-muted-foreground">
                Describe a scene or add a reference frame to direct the motion.
              </p>
            </div>
            <div v-else class="fade-in flex max-w-sm flex-col items-center gap-2 px-4 text-center">
              <Loader2 class="size-5 animate-spin text-muted-foreground" />
              <p class="text-sm font-medium text-foreground">
                {{ progress.hasSteps ? 'Generating' : progress.phaseLabel || 'Loading model' }}
              </p>
              <p class="text-xs tabular-nums leading-4 text-muted-foreground">
                <template v-if="progress.hasSteps">
                  {{ progress.current }}/{{ progress.total }} ·
                </template>
                {{ formatProgressTime(progress.elapsedSeconds) }}
                <template v-if="progress.hasSteps && progress.etaSeconds > 0">
                  · ETA {{ formatProgressTime(progress.etaSeconds) }}
                </template>
              </p>
            </div>
          </div>
        </div>

        <GenerationProgressPill
          v-if="isGenerating"
          class="mt-2 self-center"
          loading-text="Loading model"
          fallback-label="Generating"
        />

        <div v-if="generatedVideos.length > 0" class="mt-3 w-full shrink-0">
          <div class="mb-1.5 flex items-center justify-between px-2">
            <h3 class="text-[11px] font-medium tracking-wide text-muted-foreground">
              Recent videos ({{ generatedVideos.length }})
            </h3>
          </div>
          <div
            class="aui-media-strip relative rounded-[18px] border border-border/60 bg-background/60 p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.03)]"
          >
            <div class="no-scrollbar flex snap-x gap-2 overflow-x-auto scroll-smooth p-0.5">
              <button
                v-for="video in generatedVideos"
                :key="video"
                class="relative h-14 w-24 shrink-0 snap-start overflow-hidden rounded-xl border border-transparent transition-all duration-150 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40 md:h-16 md:w-28"
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
                  class="aui-status-badge absolute bottom-1 left-1 rounded-full bg-foreground/75 px-1.5 py-0.5 text-[9px] font-medium text-background backdrop-blur"
                  >Video</span
                >
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
        <!-- Top inline row: Positive/Negative + video mode selector -->
        <div class="flex flex-wrap items-center gap-2 px-3 pt-3 text-xs md:px-4">
          <SegmentedControl
            :model-value="promptMode"
            :options="promptModeOptions"
            size="md"
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
        <div class="flex items-end gap-2 px-3 pb-2 pt-1 md:px-4">
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
                  ? 'Describe the motion, subject, and visual direction...'
                  : 'Describe motion or visual details to avoid...'
              }}</span
            >
          </div>
        </div>

        <!-- Start / end frame chips -->
        <div
          v-if="(videoMode === 'i2v' || videoMode === 'flf2v') && (referenceImage || endImage)"
          class="flex flex-wrap items-center gap-2 px-4 pb-3"
        >
          <div
            v-if="referenceImage"
            class="aui-media-strip fade-in slide-in-from-bottom-1 animate-in inline-flex max-w-full items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-2 shadow-sm duration-200"
          >
            <div
              class="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-background"
            >
              <img :src="referenceImage" class="h-full w-full object-cover" />
            </div>
            <div class="min-w-0 text-xs font-medium text-muted-foreground">
              {{ videoMode === 'flf2v' ? 'Start frame' : 'Reference' }}
            </div>
            <button
              type="button"
              @click="clearReferenceImage"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Remove start frame"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <div
            v-if="videoMode === 'flf2v' && endImage"
            class="aui-media-strip fade-in slide-in-from-bottom-1 animate-in inline-flex max-w-full items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-2 shadow-sm duration-200"
          >
            <div
              class="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-background"
            >
              <img :src="endImage" class="h-full w-full object-cover" />
            </div>
            <div class="min-w-0 text-xs font-medium text-muted-foreground">End frame</div>
            <button
              type="button"
              @click="clearEndImage"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Remove end frame"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Quick controls -->
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
                  :class="videoWidth >= videoHeight ? 'w-4' : 'h-4'"
                  :style="{ aspectRatio: `${videoWidth} / ${videoHeight}` }"
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
                    videoWidth === preset.width && videoHeight === preset.height
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
                    v-model.number="videoWidth"
                    type="number"
                    min="64"
                    step="16"
                    aria-label="Custom width"
                    class="aui-field h-8 w-[4.5rem] rounded-md border border-input bg-background px-2 font-mono text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <span class="text-muted-foreground">×</span>
                  <input
                    v-model.number="videoHeight"
                    type="number"
                    min="64"
                    step="16"
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

          <div
            class="flex h-8 shrink-0 items-center gap-1 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
          >
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

          <div
            class="flex h-8 shrink-0 items-center gap-1 rounded-full border border-transparent px-2 transition-colors duration-150 hover:border-border hover:bg-background/70"
          >
            <span class="text-muted-foreground">FPS</span>
            <input
              v-model.number="videoFps"
              type="number"
              min="1"
              max="60"
              aria-label="Video FPS"
              class="h-6 w-10 bg-transparent text-foreground focus:outline-none"
            />
          </div>

          <label
            v-if="videoMode === 'i2v' || videoMode === 'flf2v'"
            class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all duration-150 hover:border-foreground/20 hover:bg-background hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40"
            :title="videoMode === 'flf2v' ? 'Upload start frame' : 'Upload reference image'"
          >
            <Upload class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">{{
              videoMode === 'flf2v' ? 'Start' : 'Reference'
            }}</span>
            <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
          </label>

          <label
            v-if="videoMode === 'flf2v'"
            class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all duration-150 hover:border-foreground/20 hover:bg-background hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40"
            title="Upload end frame"
          >
            <Upload class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">End</span>
            <input type="file" accept="image/*" class="hidden" @change="handleEndImageUpload" />
          </label>

          <div class="ml-auto flex shrink-0 items-center gap-1">
            <PromptPresetControls
              v-model:prompt="prompt"
              v-model:negative-prompt="negativePrompt"
              compact
              class="shrink-0"
            />

            <Popover>
              <Tooltip text="Video settings — steps, frames, sampler" position="top">
                <PopoverTrigger as-child>
                  <button
                    type="button"
                    class="aui-icon-button inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all duration-150 hover:border-border hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label="Video generation settings"
                  >
                    <SlidersHorizontal class="size-4" />
                  </button>
                </PopoverTrigger>
              </Tooltip>
              <PopoverContent
                side="top"
                align="end"
                :side-offset="8"
                class="w-80 max-h-[70vh] overflow-y-auto p-3"
              >
                <div class="mb-3">
                  <p class="text-sm font-medium">Video settings</p>
                  <p class="mt-0.5 text-[11px] text-muted-foreground">
                    Sampling, high-noise MoE, and VACE controls
                  </p>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <label class="text-[10px] font-medium text-muted-foreground">
                    Flow
                    <input
                      v-model.number="flowShift"
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
                    />
                  </label>
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

                <div class="mt-4 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    class="mb-2 flex w-full items-center justify-between text-left text-xs font-medium text-foreground"
                    @click="showHighNoise = !showHighNoise"
                  >
                    High noise (Wan2.2 MoE)
                    <span class="text-[10px] text-muted-foreground">{{
                      showHighNoise || hasHighNoiseModel ? '▼' : '▶'
                    }}</span>
                  </button>
                  <p v-if="hasHighNoiseModel" class="mb-2 text-[10px] text-muted-foreground">
                    High-noise model is selected in config.
                  </p>
                  <div v-if="showHighNoise || hasHighNoiseModel" class="grid grid-cols-2 gap-2">
                    <label class="text-[10px] font-medium text-muted-foreground">
                      HN steps
                      <input
                        v-model.number="highNoiseSteps"
                        type="number"
                        min="1"
                        max="50"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
                      />
                    </label>
                    <label class="text-[10px] font-medium text-muted-foreground">
                      HN CFG
                      <input
                        v-model.number="highNoiseCfg"
                        type="number"
                        min="0"
                        max="30"
                        step="0.5"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
                      />
                    </label>
                    <label class="col-span-2 text-[10px] font-medium text-muted-foreground">
                      HN sampler
                      <Select
                        v-model="highNoiseSampler"
                        size="sm"
                        class="mt-1"
                        :options="samplerOptions"
                      />
                    </label>
                    <label class="text-[10px] font-medium text-muted-foreground">
                      HN guidance
                      <input
                        v-model.number="highNoiseGuidance"
                        type="number"
                        min="0"
                        max="20"
                        step="0.1"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
                      />
                    </label>
                    <label class="text-[10px] font-medium text-muted-foreground">
                      MoE boundary
                      <input
                        v-model.number="moeBoundary"
                        type="number"
                        min="0"
                        max="1"
                        step="0.001"
                        class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
                      />
                    </label>
                  </div>
                </div>

                <div class="mt-4 border-t border-border/60 pt-3 space-y-2">
                  <p class="text-xs font-medium text-foreground">VACE / control video</p>
                  <p class="text-[10px] leading-4 text-muted-foreground">
                    Directory of frames in lexicographic order (e.g. 00.png, 01.png). Maps to
                    <code class="text-foreground/80">--control-video</code>.
                  </p>
                  <label class="block text-[10px] font-medium text-muted-foreground">
                    Control video path
                    <input
                      v-model="controlVideoPath"
                      type="text"
                      placeholder="D:/frames/post+depth"
                      class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
                    />
                  </label>
                  <label class="block text-[10px] font-medium text-muted-foreground">
                    VACE strength
                    <input
                      v-model.number="vaceStrength"
                      type="number"
                      min="0"
                      max="2"
                      step="0.05"
                      class="aui-field mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
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
                :text="isGenerating ? 'Add to queue' : 'Generate video'"
                position="top"
              >
                <button
                  type="button"
                  @click="handleGenerate"
                  :disabled="!prompt.trim()"
                  class="aui-icon-button inline-flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none"
                  :aria-label="isGenerating ? 'Add to queue' : 'Generate video'"
                >
                  <ArrowUp class="size-4 stroke-[2.5]" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
