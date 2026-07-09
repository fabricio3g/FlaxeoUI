<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, getApiBase, getOutputUrl } from '@/services/api'
import { ArrowUp, Minus, Upload, X } from 'lucide-vue-next'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import { useGenerationStatus } from '@/composables/useGeneration'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import GenerationProgressPill from '@/components/GenerationProgressPill.vue'
import { buttonMotion, panelMotion } from '@/lib/motion'
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
const showNegPrompt = ref(false)
const promptInput = ref<HTMLTextAreaElement | null>(null)
const isMobile = ref(false)

// Video mode: T2V (text to video) or I2V (image to video)
const videoMode = ref<'t2v' | 'i2v'>('t2v')

// Video parameters
const videoWidth = ref(832)
const videoHeight = ref(480)
const videoFrames = ref(33)
const flowShift = ref(3.0)

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
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleGenerate()
  }
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

onMounted(() => {
  handleWindowResize()
  window.addEventListener('resize', handleWindowResize)

  const referenceUrl = sessionStorage.getItem('videoReferenceImage')
  if (!referenceUrl) return

  sessionStorage.removeItem('videoReferenceImage')
  loadReferenceFromUrl(referenceUrl)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden studio-canvas-bg text-foreground">
    <div class="flex-1 relative min-h-0 overflow-hidden border-b border-border/60 p-1.5 md:p-6">
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
          class="relative flex h-full min-h-0 items-center justify-center rounded-2xl metal-surface overflow-hidden dot-grid-corners"
        >
          <video
            v-if="generatedVideo"
            v-motion
            :initial="panelMotion.initial"
            :enter="panelMotion.enter"
            :src="generatedVideo"
            controls
            autoplay
            loop
            class="h-full max-h-full max-w-full object-contain"
          ></video>

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
              v-motion
              :initial="panelMotion.initial"
              :enter="panelMotion.enter"
              class="relative z-10 flex max-w-lg flex-col items-center px-8 text-center"
            >
              <span class="empty-preview-brand">FlaxeoUI</span>
              <span class="empty-preview-brand-subtitle">Imagine it into motion</span>
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
          <div class="generation-media-strip relative">
            <div class="flex gap-2 overflow-x-auto p-2 snap-x scroll-smooth no-scrollbar md:gap-3">
              <button
                v-for="video in generatedVideos"
                :key="video"
                class="generation-media-thumb group relative h-16 w-24 shrink-0 snap-start overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/50 md:h-20 md:w-32"
                :class="
                  generatedVideo === getOutputUrl(video)
                    ? 'is-active z-10'
                    : 'opacity-72 hover:opacity-100'
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
                  class="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  >Video</span
                >
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 md:px-5 pb-3 md:pb-4 pt-2 md:pt-3">
      <div class="flaxeo-generation-controls relative overflow-visible rounded-3xl">
        <div
          class="px-2 md:px-5 py-1.5 md:py-3 flex items-center gap-1.5 md:gap-2 overflow-x-auto md:overflow-x-visible no-scrollbar flex-nowrap md:flex-wrap text-xs"
        >
          <div class="flex p-1 bg-muted/50 rounded-lg border border-border/30 shrink-0">
            <button
              @click="setVideoMode('t2v')"
              class="h-7 md:h-8 px-2.5 md:px-3 text-xs font-medium rounded-lg transition-colors"
              :class="
                videoMode === 't2v'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
            >
              Text to Video
            </button>
            <button
              @click="setVideoMode('i2v')"
              class="h-7 md:h-8 px-2.5 md:px-3 text-xs font-medium rounded-lg transition-colors"
              :class="
                videoMode === 'i2v'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
            >
              Image to Video
            </button>
          </div>

          <div
            class="flex items-center h-7 md:h-8 shrink-0 bg-card border border-border rounded-lg px-1.5 py-0.5 md:px-2 md:py-1 text-xs"
          >
            <span class="text-muted-foreground text-[10px]">W</span>
            <input
              v-model.number="videoWidth"
              type="number"
              step="16"
              class="w-11 md:w-14 px-1 bg-transparent text-center focus:outline-none"
            />
            <span class="text-muted-foreground">×</span>
            <span class="text-muted-foreground text-[10px]">H</span>
            <input
              v-model.number="videoHeight"
              type="number"
              step="16"
              class="w-11 md:w-14 px-1 bg-transparent text-center focus:outline-none"
            />
          </div>

          <div
            class="flex items-center h-7 md:h-8 shrink-0 bg-card border border-border rounded-lg px-1.5 py-0.5 md:px-2 md:py-1 text-xs gap-1"
          >
            <span class="text-[10px] text-muted-foreground">Frames</span>
            <input
              v-model.number="videoFrames"
              type="number"
              min="9"
              max="129"
              step="4"
              class="w-11 md:w-14 bg-transparent text-center focus:outline-none"
            />
          </div>

          <div
            class="flex items-center h-7 md:h-8 shrink-0 bg-card border border-border rounded-lg px-1.5 py-0.5 md:px-2 md:py-1 text-xs gap-1"
          >
            <span class="text-[10px] text-muted-foreground">Flow</span>
            <input
              v-model.number="flowShift"
              type="number"
              min="0"
              max="10"
              step="0.5"
              class="w-11 md:w-14 bg-transparent text-center focus:outline-none"
            />
          </div>

          <div class="flex-1 hidden md:block"></div>

          <label
            v-if="videoMode === 'i2v'"
            class="h-8 shrink-0 px-3 text-xs font-medium bg-card border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors flex items-center gap-1.5"
          >
            <Upload class="w-3.5 h-3.5" />
            Reference
            <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
          </label>

          <div class="flex items-center gap-1.5 text-muted-foreground shrink-0">
            <button
              @click="showNegPrompt = !showNegPrompt"
              class="h-7 w-7 md:h-8 md:w-8 metal-icon-button flex items-center justify-center transition-colors duration-150 rounded-lg"
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
          <div class="h-5 w-px bg-border/80 hidden md:block shrink-0"></div>
          <PromptPresetControls
            v-model:prompt="prompt"
            v-model:negative-prompt="negativePrompt"
            compact
            class="shrink-0"
          />
        </div>

        <div v-if="videoMode === 'i2v' && referenceImage" class="px-2 md:px-5 pb-2">
          <div
            class="flex items-center gap-3 p-2 bg-card rounded-xl border border-border/50 inline-flex shadow-sm"
          >
            <div class="flaxeo-image-card group !w-12 !h-12">
              <img :src="referenceImage" />
            </div>
            <div class="text-xs text-muted-foreground">Reference loaded</div>
            <button
              @click="clearReferenceImage"
              class="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors ml-1"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="flax-composer rounded-2xl px-0.5 md:px-0">
          <div class="flax-composer-input-row flex items-end gap-2">
            <div class="flex-1 relative">
              <textarea
                v-model="prompt"
                ref="promptInput"
                rows="1"
                placeholder="A lovely cat walking on grass, realistic, cinematic lighting..."
                class="flax-composer-textarea w-full resize-none metal-surface !rounded-xl px-3 py-2 md:px-5 md:py-4 pr-14 md:pr-16 text-[15px] md:text-lg leading-6 md:leading-7 text-foreground transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50 overflow-y-auto"
                :style="{
                  minHeight: isMobile ? '64px' : '120px',
                  maxHeight: isMobile ? '160px' : '360px'
                }"
                :disabled="isGenerating"
                @keydown="onPromptKeydown"
                @input="autoResize"
              ></textarea>
              <div class="absolute bottom-3 right-3 flex items-end">
                <button
                  v-if="!isGenerating"
                  v-motion
                  :hovered="buttonMotion.hovered"
                  :tapped="buttonMotion.tapped"
                  @click="handleGenerate"
                  :disabled="!prompt.trim()"
                  class="flax-composer-send metal-icon-button flex items-center justify-center h-8 w-8 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Generate Video"
                >
                  <span class="flax-composer-send-icon inline-flex">
                    <ArrowUp class="w-4.5 h-4.5 stroke-[2.5]" />
                  </span>
                </button>
                <button
                  v-else
                  v-motion
                  :hovered="buttonMotion.hovered"
                  :tapped="buttonMotion.tapped"
                  @click="handleCancel"
                  class="metal-icon-button flex items-center justify-center h-8 w-8 rounded-lg"
                  title="Cancel"
                >
                  <X class="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="showNegPrompt" class="mt-2 border-t border-border/50 pt-2">
            <textarea
              v-model="negativePrompt"
              rows="2"
              placeholder="Things to avoid: blurry, distorted, low quality, bad motion..."
              class="flax-composer-negative w-full resize-none metal-surface !rounded-xl px-3 py-2 md:px-4 md:py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
              :disabled="isGenerating"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
