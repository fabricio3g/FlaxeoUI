<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, apiGet, API_BASE, getOutputUrl } from '@/services/api'
import { Video as VideoIcon, Upload, Loader2, Play, X } from 'lucide-vue-next'

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)

// Video generation state
const prompt = ref('')
const negativePrompt = ref('')
const isGenerating = ref(false)
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
    
    // Add model info
    if (config.value.loadMode === 'split') {
      formData.append('diffusion_model', config.value.diffusionModel)
      if (config.value.t5xxlModel) formData.append('t5xxl', config.value.t5xxlModel)
      if (config.value.vaeModel) formData.append('vae', config.value.vaeModel)
      if (config.value.clipVisionModel) formData.append('clip_vision', config.value.clipVisionModel)
    }
    
    // I2V reference image
    if (videoMode.value === 'i2v' && referenceFile.value) {
      formData.append('reference_image', referenceFile.value)
    }
    
    const response = await fetch(`${API_BASE}/api/generate-video`, {
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
  <div class="flex flex-col h-full">
    <!-- Prompt Section -->
    <div class="shrink-0 border-b border-border/50">
      <div class="p-5">
        <div class="max-w-4xl mx-auto space-y-4">
          
          <!-- Header: Label + Mode Toggle -->
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Video Prompt</label>
            
            <!-- Mode Toggle: T2V / I2V -->
            <div class="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg border border-border/30">
              <button
                @click="setVideoMode('t2v')"
                class="px-3 py-1 text-xs font-medium rounded-md transition-all duration-150"
                :class="videoMode === 't2v' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              >
                Text → Video
              </button>
              <button
                @click="setVideoMode('i2v')"
                class="px-3 py-1 text-xs font-medium rounded-md transition-all duration-150"
                :class="videoMode === 'i2v' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              >
                Image → Video
              </button>
            </div>
          </div>
          
          <!-- Prompt Textarea -->
          <div>
            <textarea
              v-model="prompt"
              rows="2"
              placeholder="A lovely cat walking on grass, realistic, cinematic lighting..."
              class="w-full px-4 py-3 text-sm rounded-xl bg-background border-2 border-border/60 resize-none transition-all duration-200
                     focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/40"
              :disabled="isGenerating"
            ></textarea>
          </div>
          
          <!-- Negative Prompt -->
          <div>
            <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-2 block">Negative Prompt</label>
            <textarea
              v-model="negativePrompt"
              rows="2"
              placeholder="blurry, distorted, low quality, bad motion..."
              class="w-full px-4 py-3 text-sm rounded-xl bg-muted/50 border border-border/50 resize-none transition-all duration-200
                     focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground/40"
              :disabled="isGenerating"
            ></textarea>
          </div>
          
          <!-- Controls Row -->
          <div class="flex flex-wrap items-center gap-4">
            
            <!-- Resolution -->
            <div class="flex items-center gap-2">
              <label class="text-xs font-medium text-muted-foreground">Size</label>
              <div class="flex items-center gap-1.5 text-xs">
                <div class="flex items-center bg-muted/50 rounded-md overflow-hidden border border-border/30">
                  <span class="px-2 py-1.5 text-muted-foreground bg-muted/50 border-r border-border/30">W</span>
                  <input
                    v-model.number="videoWidth"
                    type="number"
                    step="16"
                    class="w-14 px-2 py-1.5 bg-transparent text-center focus:outline-none"
                  />
                </div>
                <span class="text-muted-foreground font-medium">×</span>
                <div class="flex items-center bg-muted/50 rounded-md overflow-hidden border border-border/30">
                  <span class="px-2 py-1.5 text-muted-foreground bg-muted/50 border-r border-border/30">H</span>
                  <input
                    v-model.number="videoHeight"
                    type="number"
                    step="16"
                    class="w-14 px-2 py-1.5 bg-transparent text-center focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <!-- Frames -->
            <div class="flex items-center gap-2">
              <label class="text-xs font-medium text-muted-foreground">Frames</label>
              <div class="flex items-center bg-muted/50 rounded-md overflow-hidden border border-border/30">
                <input
                  v-model.number="videoFrames"
                  type="number"
                  min="9"
                  max="129"
                  step="4"
                  class="w-14 px-2 py-1.5 text-xs bg-transparent text-center focus:outline-none"
                />
              </div>
            </div>

            <!-- Flow Shift -->
            <div class="flex items-center gap-2">
              <label class="text-xs font-medium text-muted-foreground">Flow</label>
              <div class="flex items-center bg-muted/50 rounded-md overflow-hidden border border-border/30">
                <input
                  v-model.number="flowShift"
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  class="w-14 px-2 py-1.5 text-xs bg-transparent text-center focus:outline-none"
                />
              </div>
            </div>

            <!-- I2V Image Upload -->
            <label
              v-if="videoMode === 'i2v'"
              class="px-3 py-1.5 text-xs font-medium bg-muted/50 border border-border/30 rounded-lg 
                     cursor-pointer hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <Upload class="w-3.5 h-3.5" />
              Reference
              <input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
            </label>
            
            <!-- Spacer -->
            <div class="flex-1"></div>
            
            <!-- Generate / Cancel Button -->
            <button
              v-if="!isGenerating"
              @click="handleGenerate"
              :disabled="!prompt.trim()"
              class="px-6 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 
                     text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:scale-100
                     transform transition-all duration-200 flex items-center gap-2"
            >
              <Play class="w-4 h-4" />
              Generate Video
            </button>
            <button
              v-else
              @click="handleCancel"
              class="px-6 py-2.5 text-sm font-semibold rounded-lg bg-red-500/90 text-white
                     hover:bg-red-500 transition-colors flex items-center gap-2"
            >
              <X class="w-4 h-4" />
              Cancel
            </button>
          </div>
          
          <!-- I2V Reference Preview -->
          <div v-if="videoMode === 'i2v' && referenceImage">
            <div class="flex items-center gap-3 p-2 bg-muted/30 rounded-lg border border-border/30 inline-flex">
              <img :src="referenceImage" class="h-14 rounded-md border border-border/50" />
              <div class="text-xs text-muted-foreground">Reference loaded</div>
              <button @click="clearReferenceImage" class="p-1 hover:bg-background rounded ml-2">
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>

    <!-- Video Preview Area -->
    <div class="flex-1 overflow-hidden flex flex-col items-center justify-center p-4 bg-muted/30">
      <!-- Error -->
      <div v-if="error" class="px-4 py-2 mb-4 bg-destructive text-destructive-foreground rounded-md text-sm flex items-center gap-2">
        {{ error }}
        <button @click="error = null" class="hover:opacity-70">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Video Container -->
      <div class="relative max-w-full max-h-full rounded-lg overflow-hidden border border-border bg-background shadow-xl">
        <!-- Generated Video -->
        <video
          v-if="generatedVideo"
          :src="generatedVideo"
          controls
          autoplay
          loop
          class="max-w-full max-h-[65vh]"
        ></video>
        
        <!-- Placeholder -->
        <div v-else class="w-96 h-64 flex flex-col items-center justify-center text-muted-foreground">
          <VideoIcon class="w-12 h-12 opacity-30 mb-4" />
          <span class="text-xs tracking-widest opacity-50">READY FOR VIDEO</span>
          <p class="text-xs mt-2 text-center px-4">
            Generate videos using WAN/CogVideoX models via sd-cli
          </p>
        </div>

        <!-- Loading Overlay -->
        <div
          v-if="isGenerating"
          class="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <Loader2 class="w-8 h-8 animate-spin text-primary mb-2" />
          <span class="text-sm font-medium">Generating video...</span>
          <p class="text-xs text-muted-foreground mt-1">This may take several minutes</p>
        </div>
      </div>
    </div>
  </div>
</template>
