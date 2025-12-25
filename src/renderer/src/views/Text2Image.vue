
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { apiPost, apiGet, getOutputUrl } from '@/services/api'
import {
  Sparkles, Loader2, Download, Trash2, X, User, Activity, ImagePlus,
  Plus, Upload, Copy, Eye, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Image
} from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { useGeneration } from '@/composables/useGeneration'

const toast = useToast()

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { isGenerating } = useGeneration()

// Form state
const prompt = ref('')
const negativePrompt = ref('') // Matches template usage
const previewImage = ref<string | null>(null)
const galleryImages = ref<string[]>([])
const error = ref<string | null>(null)
const serverOnline = ref(false)
const currentImageFilename = ref<string | null>(null)
// const serverStats = ref<any>(null) // Unused

// File uploads (store actual File objects for proper upload)
const kontextRefFile = ref<File | null>(null)
const controlNetFile = ref<File | null>(null)

// Advanced sections state
const activeTab = ref<string>('')
// const showPhotoMaker = ref(false) // Unused
// const showControlNet = ref(false) // Unused
// const showKontext = ref(false) // Unused

// Size presets
const sizePresets = [
  { label: 'Square', width: 1024, height: 1024 },
  { label: 'Portrait', width: 832, height: 1216 },
  { label: 'Landscape', width: 1216, height: 832 },
  { label: 'Wide', width: 1536, height: 640 }
]

const activePreset = computed(() => {
  return sizePresets.find(p => p.width === config.value.width && p.height === config.value.height)
})

function setSize(preset: typeof sizePresets[0]): void {
  configStore.setDimensions(preset.width, preset.height)
}

// Handle file uploads
function handlePMUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    for (let i = 0; i < input.files.length; i++) {
        if (config.value.photoMakerImages.length < 4) {
        // Cast to any to access 'path' (Electron specific)
        const file = input.files[i] as any
        config.value.photoMakerImages.push(file.path)
        }
    }
  }
}

function removePMImage(index: number) {
  config.value.photoMakerImages.splice(index, 1)
}

function handleCNUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    controlNetFile.value = file
    // Store preview URL for display
    config.value.controlImagePath = URL.createObjectURL(file)
  }
}

function handleKontextUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    kontextRefFile.value = file
    // Store preview URL for display
    config.value.kontextRefImage = URL.createObjectURL(file)
  }
}

function buildGenerationParams(): any {
  const c = config.value

  // Handle embeddings: append to prompt
  let finalPrompt = prompt.value
  if (c.embeddings && c.embeddings.length > 0) {
     const embeddingTokens = c.embeddings.map(path => {
         const filename = path.split(/[\\/]/).pop() || ''
         return '<' + filename.replace(/\.[^/.]+$/, "") + '>'
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
    pmImagesDir: undefined, // Let server handle it via photoMakerImages array
    photoMakerImages: c.photoMakerImages, // Critical: Missing in original
    pmStyleStrength: c.photoMakerStyleStrength,
    pmIdEmbedsPath: c.photoMakerIdEmbedsPath,

    // ControlNet
    controlNet: c.controlNetModel,
    controlImage: c.controlImagePath || undefined,
    controlStrength: c.controlNetStrength,
    applyCanny: c.applyCanny,

    // Kontext
    kontextRefPath: c.kontextRefImage || undefined, // Renamed from kontextRefImage to match server

    // Models
    diffusionModel: c.diffusionModel,
    vae: c.vaeModel,
    t5xxl: c.t5xxlModel,
    llm: c.llmModel,
    clipL: c.clipModel,
    clipG: c.clipGModel,
    clipVision: c.clipVisionModel,

    flashAttention: c.flashAttention,
    clipOnCpu: c.clipOnCpu,
    offloadToCpu: c.cpuOffload,
    diffusionFa: c.flashAttention, // Correct mapping
    diffusionConvDirect: c.diffusionConvDirect, // Added missing mapping
    vaeConvDirect: c.vaeConvDirect,
    forceSDXLVaeConvScale: c.forceSDXLVaeConvScale,

    loraApplyMode: c.loraApplyMode,
    quantizationType: c.quantizationType,
    upscaleModel: c.upscaleModel,
    taesdModel: c.taesdModel
  }


  // LoRAs
  if (c.loras.length > 0) {
    params.loras = c.loras.map(l => ({ path: l.path, strength: l.strength }))
    params.loraApplyMode = c.loraApplyMode
  }

  // Hardware options (redundant set but keeping for safety if server logic changes)
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
        // e.g. http://localhost:3000/output/img.png -> img.png
        const url = new URL(imagePath)
        relativePath = url.pathname.replace('/output/', '')
    } else if (imagePath.includes('/output/')) {
        relativePath = imagePath.split('/output/')[1]
    }

    const data = await apiPost<{
      prompt?: string,
      negativePrompt?: string,
      seed?: number,
      cfgScale?: number,
      steps?: number,
      width?: number,
      height?: number,
      sampler?: string,
      scheduler?: string,
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
  error.value = null
  
  try {
    const params = buildGenerationParams()
    
    // Choose endpoint based on mode
    let endpoint = '/api/generate-cli'
    let payload: any = params

    // If server mode is active and server is online, use the server endpoint
    // We need to map camelCase params to snake_case for the server API
    if (config.value.backendMode === 'server' && serverOnline.value) {
      endpoint = '/api/generate'
      payload = {
        ...params,
        // params already has negative_prompt, cfg_scale, prompting keys
        batch_size: params.batchCount,
        clip_skip: params.clipSkip
      }
    }

    // Check if we need to use FormData (for file uploads)
    const needsFormData = kontextRefFile.value || controlNetFile.value
    
    let result: { message: string; filenames?: string[]; filename?: string }
    
    if (needsFormData) {
      const formData = new FormData()
      
      Object.keys(payload).forEach(key => {
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
      
      // Use fetch for FormData
      const response = await fetch(`http://localhost:${await window.electron.ipcRenderer.invoke('get-server-port')}${endpoint}`, {
        method: 'POST',
        body: formData
      })
      
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
    isGenerating.value = false
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
    galleryImages.value = galleryImages.value.filter(f => f !== filenameToDelete)
    
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
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
    if (e.key === 'ArrowLeft') navigateImage(-1)
    if (e.key === 'ArrowRight') navigateImage(1)
    if (e.key === 'Delete' && previewImage.value && !isGenerating.value) {
        if(confirm('Delete current image?')) deletePreview()
    }
}

// Fetch gallery on mount
// async function fetchGallery() { ... } - Removed to keep session-only history

onMounted(() => {


  window.addEventListener('keydown', handleKeydown)

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
  })
})
</script>

<template>
  <div class="flex flex-col bg-background text-foreground">
    <!-- Prompt Section -->
    <div class="shrink-0 border-b border-border/50 bg-card/30">
      <div class="p-5">
        <div class="max-w-4xl mx-auto space-y-4">
          
          <!-- Prompt -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider flex items-center gap-2">
                Prompt
                <span v-if="config.embeddings.length > 0" class="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] normal-case">
                  {{ config.embeddings.length }} embeds
                </span>
              </label>
              <span class="text-xs text-muted-foreground">{{ prompt.length }} chars</span>
            </div>
            <textarea
              v-model="prompt"
              rows="3"
              placeholder="A stunning photograph of a mountain landscape at golden hour, dramatic lighting, 8k quality..."
              class="w-full px-4 py-3 text-sm rounded-xl bg-background border-2 border-border/60 resize-none transition-all duration-200
                     focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/40 shadow-sm"
              :disabled="isGenerating"
            ></textarea>
          </div>
          
          <!-- Negative Prompt -->
          <div>
            <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-2 block">Negative Prompt</label>
            <textarea
              v-model="negativePrompt"
              rows="2"
              placeholder="blurry, low quality, distorted, watermark, bad anatomy..."
              class="w-full px-4 py-3 text-sm rounded-xl bg-muted/30 border border-border/50 resize-none transition-all duration-200
                     focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground/40 shadow-sm"
              :disabled="isGenerating"
            ></textarea>
          </div>

          <!-- Advanced Features Accordion -->
          <div class="space-y-2">
             <!-- PhotoMaker -->
             <div class="rounded-lg border border-border/50 bg-muted/10 overflow-hidden">
                <button 
                  @click="activeTab = activeTab === 'photomaker' ? '' : 'photomaker'"
                  class="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <span class="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-foreground/80">
                    <User class="w-3.5 h-3.5" /> PhotoMaker
                  </span>
                  <component :is="activeTab === 'photomaker' ? ChevronUp : ChevronDown" class="w-4 h-4 text-muted-foreground" />
                </button>
                <div v-show="activeTab === 'photomaker'" class="p-4 border-t border-border/50 space-y-3">
                   <div class="flex items-start gap-4">
                      <!-- Image Upload -->
                      <div class="flex-1">
                        <label class="text-xs text-muted-foreground block mb-2">ID Images (Max 4)</label>
                        <div class="flex gap-2 flex-wrap">
                           <div v-for="(img, idx) in config.photoMakerImages" :key="idx" class="relative group w-16 h-16 rounded-md overflow-hidden border border-border">
                              <img :src="'file://' + img" class="w-full h-full object-cover" />
                              <button @click="removePMImage(idx)" class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                                 <X class="w-4 h-4" />
                              </button>
                           </div>
                           <label v-if="config.photoMakerImages.length < 4" class="w-16 h-16 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                              <Plus class="w-5 h-5 text-muted-foreground" />
                              <input type="file" multiple accept="image/*" class="hidden" @change="handlePMUpload" />
                           </label>
                        </div>
                      </div>
                      <!-- Strength -->
                      <div class="w-48">
                         <label class="text-xs text-muted-foreground block mb-2">Style Strength ({{ config.photoMakerStyleStrength }})</label>
                         <input v-model.number="config.photoMakerStyleStrength" type="range" min="0" max="100" class="w-full accent-primary" />
                      </div>
                   </div>
                </div>
             </div>

             <!-- ControlNet -->
             <div class="rounded-lg border border-border/50 bg-muted/10 overflow-hidden">
                <button 
                  @click="activeTab = activeTab === 'controlnet' ? '' : 'controlnet'"
                  class="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <span class="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-foreground/80">
                    <Activity class="w-3.5 h-3.5" /> ControlNet
                  </span>
                  <component :is="activeTab === 'controlnet' ? 'ChevronUp': 'ChevronDown'" class="w-4 h-4 text-muted-foreground" />
                </button>
                <div v-show="activeTab === 'controlnet'" class="p-4 border-t border-border/50 space-y-3">
                   <div class="flex items-start gap-4">
                      <!-- Image Upload -->
                      <div>
                        <label class="text-xs text-muted-foreground block mb-2">Control Image</label>
                        <div class="relative group w-24 h-24 rounded-md overflow-hidden border border-border bg-muted/20">
                           <img v-if="config.controlImagePath" :src="config.controlImagePath.startsWith('blob:') ? config.controlImagePath : 'file://' + config.controlImagePath" class="w-full h-full object-cover" />
                           <label class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 transition-colors">
                              <Upload v-if="!config.controlImagePath" class="w-6 h-6 text-muted-foreground/50" />
                              <span v-if="!config.controlImagePath" class="text-[10px] text-muted-foreground/70 mt-1">Upload</span>
                              <input type="file" accept="image/*" class="hidden" @change="handleCNUpload" />
                           </label>
                           <button v-if="config.controlImagePath" @click="config.controlImagePath = ''; controlNetFile = null" class="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              <X class="w-3 h-3" />
                           </button>
                        </div>
                      </div>
                      <!-- Settings -->
                      <div class="flex-1 space-y-3">
                         <div>
                            <label class="text-xs text-muted-foreground block mb-2">Strength ({{ config.controlNetStrength }})</label>
                            <input v-model.number="config.controlNetStrength" type="range" min="0" max="2" step="0.1" class="w-full accent-primary" />
                         </div>
                         <label class="flex items-center gap-2 text-xs">
                            <input v-model="config.applyCanny" type="checkbox" class="rounded border-border" />
                            Apply Canny Preprocessor
                         </label>
                      </div>
                   </div>
                </div>
             </div>

             <!-- Kontext / Reference -->
             <div class="rounded-lg border border-border/50 bg-muted/10 overflow-hidden">
                <button 
                  @click="activeTab = activeTab === 'kontext' ? '' : 'kontext'"
                  class="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <span class="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-foreground/80">
                    <ImagePlus class="w-3.5 h-3.5" /> Reference (Flux)
                  </span>
                  <component :is="activeTab === 'kontext' ? 'ChevronUp': 'ChevronDown'" class="w-4 h-4 text-muted-foreground" />
                </button>
                <div v-show="activeTab === 'kontext'" class="p-4 border-t border-border/50">
                    <div class="flex items-start gap-4">
                      <!-- Image Upload -->
                      <div>
                        <label class="text-xs text-muted-foreground block mb-2">Ref Image</label>
                        <div class="relative group w-24 h-24 rounded-md overflow-hidden border border-border bg-muted/20">
                           <img v-if="config.kontextRefImage" :src="config.kontextRefImage.startsWith('blob:') ? config.kontextRefImage : 'file://' + config.kontextRefImage" class="w-full h-full object-cover" />
                           <label class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 transition-colors">
                              <Upload v-if="!config.kontextRefImage" class="w-6 h-6 text-muted-foreground/50" />
                              <span v-if="!config.kontextRefImage" class="text-[10px] text-muted-foreground/70 mt-1">Upload</span>
                              <input type="file" accept="image/*" class="hidden" @change="handleKontextUpload" />
                           </label>
                           <button v-if="config.kontextRefImage" @click="config.kontextRefImage = ''; kontextRefFile = null" class="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              <X class="w-3 h-3" />
                           </button>
                        </div>
                      </div>
                      <p class="text-[10px] text-muted-foreground flex-1 pt-2">
                        Use this for context-aware editing or reference-guided generation with consistent styles (Flux models only).
                      </p>
                    </div>
                </div>
             </div>
          </div>
          
          <!-- Controls Row -->
          <div class="flex flex-wrap items-center gap-4">
            
            <!-- Size Presets -->
            <div class="flex items-center gap-1 p-1 bg-muted/30 rounded-lg">
              <button
                v-for="preset in sizePresets"
                :key="preset.label"
                @click="setSize(preset)"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150"
                :class="activePreset?.label === preset.label 
                  ? 'bg-foreground text-background shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
              >
                {{ preset.label }}
              </button>
            </div>
            
            <!-- Dimensions -->
            <div class="flex items-center gap-1.5 text-xs">
              <div class="flex items-center bg-muted/50 rounded-md overflow-hidden border border-border/30">
                <span class="px-2 py-1.5 text-muted-foreground bg-muted/50 border-r border-border/30">W</span>
                <input
                  v-model.number="config.width"
                  type="number"
                  step="64"
                  class="w-14 px-2 py-1.5 bg-transparent text-center focus:outline-none"
                />
              </div>
              <span class="text-muted-foreground font-medium">×</span>
              <div class="flex items-center bg-muted/50 rounded-md overflow-hidden border border-border/30">
                <span class="px-2 py-1.5 text-muted-foreground bg-muted/50 border-r border-border/30">H</span>
                <input
                  v-model.number="config.height"
                  type="number"
                  step="64"
                  class="w-14 px-2 py-1.5 bg-transparent text-center focus:outline-none"
                />
              </div>
            </div>
            
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
              <Sparkles class="w-4 h-4" />
              Generate
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

           <!-- Batch & Preview Settings (Compact) -->
           <div class="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-1 block">Batch Count</label>
              <div class="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5 hover:border-primary/50 transition-colors">
                 <Copy class="w-3.5 h-3.5 text-muted-foreground" />
                 <input 
                   v-model.number="config.batchCount" 
                   type="number" 
                   min="1" 
                   max="16" 
                   class="w-full bg-transparent text-sm font-medium focus:outline-none"
                 >
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-1 block">Live Preview</label>
               <div class="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5 hover:border-primary/50 transition-colors">
                 <Eye class="w-3.5 h-3.5 text-muted-foreground" />
                 <select v-model="config.livePreviewMethod" class="w-full bg-transparent text-sm font-medium focus:outline-none appearance-none">
                    <option value="">None</option>
                    <option value="approx">Approx</option>
                    <option value="taesd">TAESD</option>
                    <option value="vae">VAE (Slow)</option>
                 </select>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>

    <!-- Preview Area -->
    <div class="flex-1 overflow-hidden flex flex-col items-center justify-center p-4 bg-muted/30 relative">
      <!-- Error Message -->
      <div v-if="error" class="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm flex items-center gap-2 z-50">
        {{ error }}
        <button @click="error = null" class="hover:opacity-70">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Preview Container -->
      <div class="relative max-w-full max-h-full rounded-lg overflow-hidden border border-border bg-background shadow-xl group">
        <!-- Preview Image -->
        <img
          v-if="previewImage"
          :src="previewImage"
          class="w-full h-full object-contain"
          alt="Generated image"
        />
        
        <!-- Placeholder -->
        <div
          v-else
          class="w-80 h-80 flex items-center justify-center text-muted-foreground"
        >
          <span class="text-xs tracking-widest opacity-50">READY</span>
        </div>

        <!-- Loading Overlay -->
        <div
          v-if="isGenerating && !previewImage?.includes('temp/preview.png')"
          class="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <Loader2 class="w-8 h-8 animate-spin text-primary mb-2" />
          <span class="text-sm font-medium">Generating...</span>
        </div>

        <!-- Live Preview Overlay Status -->
         <div
          v-if="isGenerating && previewImage?.includes('temp/preview.png')"
          class="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur text-white text-xs rounded flex items-center gap-2"
        >
          <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          Live Preview
        </div>

      <!-- Navigation Overlay -->
      <div v-if="previewImage && galleryImages.length > 1 && !isGenerating" class="absolute inset-0 pointer-events-none flex items-center justify-between px-4">
        <button 
          @click="navigateImage(-1)" 
          class="pointer-events-auto p-2 rounded-full bg-black/20 hover:bg-black/50 text-white/50 hover:text-white transition-all backdrop-blur-sm"
          :class="{ 'opacity-0 cursor-default': isFirstImage }"
          :disabled="isFirstImage"
        >
          <ChevronLeft class="w-8 h-8" />
        </button>
        <button 
          @click="navigateImage(1)" 
          class="pointer-events-auto p-2 rounded-full bg-black/20 hover:bg-black/50 text-white/50 hover:text-white transition-all backdrop-blur-sm"
          :class="{ 'opacity-0 cursor-default': isLastImage }"
          :disabled="isLastImage"
        >
          <ChevronRight class="w-8 h-8" />
        </button>
      </div>

       <!-- Image Actions (hover) -->
        <div
          v-if="previewImage && !isGenerating"
          class="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >

          <button
            @click="deletePreview"
            class="p-2 rounded bg-background/80 hover:bg-destructive hover:text-destructive-foreground transition-colors"
            title="Delete image"
          >
            <Trash2 class="w-4 h-4" />
          </button>
          <a
            :href="previewImage"
            :download="previewImage.split('/').pop()"
            class="p-2 rounded bg-background/80 hover:bg-primary hover:text-primary-foreground transition-colors"
            title="Download image"
          >
            <Download class="w-4 h-4" />
          </a>
        </div>
      </div>

      <!-- Gallery Carousel -->
      <div
        v-if="galleryImages.length > 0"
        class="mt-4 w-full max-w-6xl mx-auto"
      >
        <div class="flex items-center justify-between mb-2 px-1">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Image class="w-3.5 h-3.5" /> Gallery ({{ galleryImages.length }})
            </h3>
        </div>
        
        <div class="relative group/carousel">
             <div 
                ref="carouselRef"
                class="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 snap-x scroll-smooth scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-primary/50"
             >
                <button
                v-for="img in galleryImages"
                :key="img"
                @click="selectGalleryImage(img)"
                class="h-20 w-20 shrink-0 rounded-md overflow-hidden border-2 transition-all relative group snap-start focus:outline-none focus:ring-2 focus:ring-primary/50"
                :class="previewImage === getOutputUrl(img) ? 'border-primary ring-2 ring-primary/20 shadow-lg scale-105 z-10' : 'border-transparent hover:border-border/80 opacity-70 hover:opacity-100'"
                >
                <img :src="getOutputUrl(img)" class="w-full h-full object-cover" loading="lazy" :alt="img" />
                
                </button>
            </div>
            
             <!-- Carousel Fade Edges -->
            <div class="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none"></div>
            <div class="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none"></div>
        </div>
      </div>
    </div>
  </div>
</template>
