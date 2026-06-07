<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, apiGet, getApiBase, getOutputUrl } from '@/services/api'
import { Upload, Play, X } from 'lucide-vue-next'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import { useGenerationStatus } from '@/composables/useGeneration'

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

// Video generation state
const prompt = ref('')
const negativePrompt = ref('')
const { isGenerating } = useGenerationStatus('video')
const generatedVideo = ref<string | null>(null)
const error = ref<string | null>(null)

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

/**
 * clearReferenceImage() - Clear the reference image
 */
function clearReferenceImage(): void {
  referenceImage.value = null
  referenceFile.value = null
}

/**
 * handleGenerate() - Generate video
 */
async function handleGenerate(): Promise<void> {
  if (!prompt.value.trim()) return

  isGenerating.value = true
  error.value = null
  generatedVideo.value = null

  try {
    const formData = new FormData()
    formData.append('prompt', prompt.value)
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
      if (config.value.highNoiseDiffusionModel) formData.append('highNoiseDiffusionModel', config.value.highNoiseDiffusionModel)
      if (config.value.t5xxlModel) formData.append('t5xxl', config.value.t5xxlModel)
      if (config.value.llmModel) formData.append('llm', config.value.llmModel)
      if (config.value.llmVisionModel) formData.append('llmVision', config.value.llmVisionModel)
      if (config.value.embeddingsConnectorsModel) formData.append('embeddingsConnectors', config.value.embeddingsConnectorsModel)
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
    if (config.value.backendAssignment) formData.append('backendAssignment', config.value.backendAssignment)
    if (config.value.paramsBackendAssignment) formData.append('paramsBackendAssignment', config.value.paramsBackendAssignment)
    if (config.value.threads > 0) formData.append('threads', config.value.threads.toString())
    if (config.value.maxVram !== 0) formData.append('maxVram', config.value.maxVram.toString())
    if (config.value.streamLayers) formData.append('streamLayers', 'true')
    if (config.value.mmap) formData.append('mmap', 'true')
    if (config.value.cacheMode) formData.append('cacheMode', config.value.cacheMode)
    if (config.value.cacheOption) formData.append('cacheOption', config.value.cacheOption)
    if (config.value.scmMask) formData.append('scmMask', config.value.scmMask)
    if (config.value.scmPolicy) formData.append('scmPolicy', config.value.scmPolicy)
    if (config.value.loraApplyMode) formData.append('loraApplyMode', config.value.loraApplyMode)
    if (config.value.quantizationType) formData.append('quantizationType', config.value.quantizationType)
    if (config.value.predictionType) formData.append('predictionType', config.value.predictionType)
    if (config.value.extraSampleArgs) formData.append('extraSampleArgs', config.value.extraSampleArgs)
    if (config.value.extraTilingArgs) formData.append('extraTilingArgs', config.value.extraTilingArgs)
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
      generatedVideo.value = getOutputUrl(result.filename)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Video generation failed'
    console.error('Video generation error:', e)
  } finally {
    isGenerating.value = false
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
  isGenerating.value = false
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-muted/30 text-foreground">
    <div class="flex-1 relative min-h-0 overflow-hidden border-b border-border/60 p-2 md:p-3">
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
        <div class="relative flex h-full min-h-0 items-center justify-center rounded-2xl metal-surface overflow-hidden dot-grid-corners">
          <video
            v-if="generatedVideo"
            :src="generatedVideo"
            controls
            autoplay
            loop
            class="h-full max-h-full max-w-full object-contain"
          ></video>

          <div v-else class="empty-preview-orb absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-white">
            <div class="empty-preview-noise"></div>
            <div class="empty-preview-glow empty-preview-glow-a"></div>
            <div class="empty-preview-glow empty-preview-glow-b"></div>
            <div class="empty-preview-glow empty-preview-glow-c"></div>
            <div v-if="!isGenerating" class="relative z-10 flex max-w-lg flex-col items-center px-8 text-center text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]">
              <span class="text-3xl font-semibold tracking-tight md:text-5xl">Imagine it into form</span>
            </div>
          </div>

          <div
            v-if="isGenerating"
            class="absolute inset-0 generating-halftone flex items-center justify-center"
          >
            <div class="generating-status">
              <div class="generating-loader-mark" aria-hidden="true">
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
              </div>
              <span class="generating-status-title">Rendering motion</span>
              <p class="generating-status-subtitle">This can take a few minutes.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 bg-card/70 px-3 pb-3 pt-2">
      <div class="relative overflow-visible rounded-3xl border border-border/70 bg-card/85 shadow-[0_12px_34px_rgba(130,130,255,0.14)] backdrop-blur">
        <div class="px-3 py-2 flex items-center gap-2 flex-wrap">
          <div class="flex p-1 bg-muted/50 rounded-lg border border-border/30">
            <button
              @click="setVideoMode('t2v')"
              class="px-3 py-1 text-xs font-medium rounded-lg transition-colors"
              :class="videoMode === 't2v' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            >
              Text to Video
            </button>
            <button
              @click="setVideoMode('i2v')"
              class="px-3 py-1 text-xs font-medium rounded-lg transition-colors"
              :class="videoMode === 'i2v' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            >
              Image to Video
            </button>
          </div>

          <div class="flex items-center bg-card border border-border rounded-lg px-2 py-1 text-xs">
            <span class="text-muted-foreground text-[10px]">W</span>
            <input v-model.number="videoWidth" type="number" step="16" class="w-14 px-1 bg-transparent text-center focus:outline-none" />
            <span class="text-muted-foreground">×</span>
            <span class="text-muted-foreground text-[10px]">H</span>
            <input v-model.number="videoHeight" type="number" step="16" class="w-14 px-1 bg-transparent text-center focus:outline-none" />
          </div>

          <div class="flex items-center bg-card border border-border rounded-lg px-2 py-1 text-xs gap-1">
            <span class="text-[10px] text-muted-foreground">Frames</span>
            <input v-model.number="videoFrames" type="number" min="9" max="129" step="4" class="w-14 bg-transparent text-center focus:outline-none" />
          </div>

          <div class="flex items-center bg-card border border-border rounded-lg px-2 py-1 text-xs gap-1">
            <span class="text-[10px] text-muted-foreground">Flow</span>
            <input v-model.number="flowShift" type="number" min="0" max="10" step="0.5" class="w-14 bg-transparent text-center focus:outline-none" />
          </div>

          <div class="flex-1 hidden md:block"></div>

          <label v-if="videoMode === 'i2v'" class="h-8 px-3 text-xs font-medium bg-card border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors flex items-center gap-1.5">
            <Upload class="w-3.5 h-3.5" />
            Reference
            <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
          </label>
        </div>

        <div v-if="videoMode === 'i2v' && referenceImage" class="px-3 pb-2">
          <div class="flex items-center gap-3 p-2 bg-muted/30 rounded-lg border border-border/30 inline-flex">
            <img :src="referenceImage" class="h-14 rounded-md border border-border/50" />
            <div class="text-xs text-muted-foreground">Reference loaded</div>
            <button @click="clearReferenceImage" class="p-1 hover:bg-background rounded ml-2">
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="composer-shell mx-3 rounded-2xl px-3 py-3">
          <PromptPresetControls
            v-model:prompt="prompt"
            v-model:negative-prompt="negativePrompt"
            class="mb-3"
          />

          <div class="flex items-end gap-2">
            <div class="flex-1 relative">
              <textarea
                v-model="prompt"
                rows="1"
                placeholder="A lovely cat walking on grass, realistic, cinematic lighting..."
                class="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-foreground transition-all duration-200 focus:outline-none placeholder:text-muted-foreground/50 overflow-y-auto"
                :style="{ minHeight: '68px', maxHeight: '200px' }"
                :disabled="isGenerating"
              ></textarea>
            </div>
            <div class="flex items-end pb-0.5">
              <button v-if="!isGenerating" @click="handleGenerate" :disabled="!prompt.trim()" class="h-10 w-10 rounded-xl primary-metal-button disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 flex items-center justify-center hover:scale-105 active:scale-95" title="Generate Video">
                <Play class="w-5 h-5 stroke-[2.5]" />
              </button>
              <button v-else @click="handleCancel" class="h-10 w-10 rounded-xl bg-red-500/90 text-white hover:bg-red-500 transition-all duration-200 flex items-center justify-center hover:scale-105 active:scale-95" title="Cancel">
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="mt-2 border-t border-border/50 pt-2">
            <textarea v-model="negativePrompt" rows="2" placeholder="Things to avoid: blurry, distorted, low quality, bad motion..." class="w-full resize-none rounded-xl bg-muted/35 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50" :disabled="isGenerating"></textarea>
          </div>
        </div>

        <div class="flex items-center justify-between px-3 pb-2 pt-1">
          <span class="text-[10px] text-muted-foreground">{{ prompt.length }} chars</span>
          <span class="text-[10px] text-muted-foreground">{{ videoWidth }}×{{ videoHeight }} · {{ videoFrames }} frames</span>
        </div>
      </div>
    </div>
  </div>
</template>
