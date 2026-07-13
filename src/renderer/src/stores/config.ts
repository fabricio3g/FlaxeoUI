import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ImageGenerationParams, ImageParamsReuseMode } from '@/lib/imageParams'
import {
  normalizeRegionalPromptRegions,
  type RegionalPromptRegion
} from '../../../shared/regionalPrompting'

/**
 * GenerationConfig - All parameters for image generation
 * Matches the sd-cli command line arguments
 */
export interface GenerationConfig {
  // Backend mode
  backendMode: 'server' | 'cli'

  // Model loading mode
  loadMode: 'standard' | 'split'

  // Standard mode model
  standardModel: string

  // Split mode models
  diffusionModel: string
  highNoiseDiffusionModel: string
  uncondDiffusionModel: string
  t5xxlModel: string
  llmModel: string
  llmVisionModel: string
  clipModel: string
  clipGModel: string
  clipVisionModel: string
  embeddingsConnectorsModel: string

  // Common models
  vaeModel: string
  vaeTileSize: number
  controlNetModel: string
  photoMakerModel: string
  upscaleModel: string
  taesdModel: string
  audioVaeModel: string
  vaeFormat: string

  // LoRAs (array of { path, strength, optional high_noise target for Wan MoE })
  loras: Array<{ path: string; strength: number; target?: 'default' | 'high_noise' }>
  loraApplyMode: 'auto' | 'immediately' | 'at_runtime'

  // Embeddings
  embeddings: string[]

  // Sampling
  scheduler: string
  sampler: string
  rngType: string
  samplerRngType: string
  batchCount: number

  // Generation parameters
  steps: number
  cfgScale: number
  guidance: number
  clipSkip: number
  seed: number
  /** When true, keep seed fixed across gens (do not force -1) */
  seedLocked: boolean
  width: number
  height: number

  // Hardware options
  flashAttention: boolean
  vaeTiling: boolean
  clipOnCpu: boolean
  cpuOffload: boolean
  diffusionConvDirect: boolean
  vaeConvDirect: boolean
  forceSDXLVaeConvScale: boolean
  backendAssignment: string
  paramsBackendAssignment: string
  autoFit: boolean
  splitMode: 'layer' | 'row'
  threads: number
  maxVram: number
  streamLayers: boolean
  mmap: boolean
  vaeOnCpu: boolean
  controlNetOnCpu: boolean
  circular: boolean
  circularX: boolean
  circularY: boolean
  qwenImageZeroCondT: boolean
  chromaEnableT5Mask: boolean
  chromaDisableDitMask: boolean
  chromaT5MaskPad: number
  quantizationType: string
  tensorTypeRules: string
  predictionType: string

  // Caching / acceleration
  cacheMode: string
  cacheOption: string
  scmMask: string
  scmPolicy: string

  // Advanced sampling
  flowShift: number
  eta: number
  slgScale: number
  skipLayerStart: number
  skipLayerEnd: number
  skipLayers: string
  sigmas: string
  imgCfgScale: number
  extraSampleArgs: string
  extraTilingArgs: string
  disableImageMetadata: boolean

  // Live preview
  livePreviewMethod: string

  // ControlNet settings
  controlNetStrength: number
  applyCanny: boolean
  controlImagePath: string

  // PhotoMaker settings
  photoMakerImages: string[]
  photoMakerStyleStrength: number
  photoMakerIdEmbedsPath: string

  // Kontext (Flux image editing)
  kontextRefImage: string

  // Img2Img
  initImagePath: string
  img2imgStrength: number

  // Regional prompting (sequential inpaint)
  regionalPromptingEnabled: boolean
  regionalPromptRegions: RegionalPromptRegion[]

  // Video mode
  videoMode: boolean
}

export interface ConfigPreset {
  id: string
  name: string
  config: GenerationConfig
  createdAt: number
  updatedAt: number
  builtin?: boolean
}

const PRESETS_STORAGE_KEY = 'flaxeo-config-presets'
const CONFIG_STORAGE_KEY = 'flaxeo-current-config'

const defaultConfig: GenerationConfig = {
  backendMode: 'cli',
  loadMode: 'standard',
  standardModel: '',
  diffusionModel: '',
  highNoiseDiffusionModel: '',
  uncondDiffusionModel: '',
  t5xxlModel: '',
  llmModel: '',
  llmVisionModel: '',
  clipModel: '',
  clipGModel: '',
  clipVisionModel: '',
  embeddingsConnectorsModel: '',
  vaeModel: '',
  vaeTileSize: 0,
  controlNetModel: '',
  photoMakerModel: '',
  upscaleModel: '',
  taesdModel: '',
  audioVaeModel: '',
  vaeFormat: '',
  loras: [],
  loraApplyMode: 'auto',
  embeddings: [],
  scheduler: 'discrete',
  sampler: 'euler',
  rngType: '',
  samplerRngType: '',
  batchCount: 1,
  steps: 20,
  cfgScale: 3.5,
  guidance: 3.5,
  clipSkip: -1,
  seed: -1,
  seedLocked: false,
  width: 1024,
  height: 1024,
  flashAttention: false,
  vaeTiling: false,
  clipOnCpu: false,
  cpuOffload: false,
  diffusionConvDirect: false,
  vaeConvDirect: false,
  forceSDXLVaeConvScale: false,
  backendAssignment: '',
  paramsBackendAssignment: '',
  autoFit: false,
  splitMode: 'layer',
  threads: -1,
  maxVram: 0,
  streamLayers: false,
  mmap: false,
  vaeOnCpu: false,
  controlNetOnCpu: false,
  circular: false,
  circularX: false,
  circularY: false,
  qwenImageZeroCondT: false,
  chromaEnableT5Mask: false,
  chromaDisableDitMask: false,
  chromaT5MaskPad: 0,
  quantizationType: '',
  tensorTypeRules: '',
  predictionType: '',
  cacheMode: '',
  cacheOption: '',
  scmMask: '',
  scmPolicy: '',
  flowShift: 0,
  eta: 0,
  slgScale: 0,
  skipLayerStart: 0.01,
  skipLayerEnd: 0.2,
  skipLayers: '',
  sigmas: '',
  imgCfgScale: 0,
  extraSampleArgs: '',
  extraTilingArgs: '',
  disableImageMetadata: false,
  livePreviewMethod: '',
  controlNetStrength: 0.9,
  applyCanny: false,
  controlImagePath: '',
  photoMakerImages: [],
  photoMakerStyleStrength: 20,
  photoMakerIdEmbedsPath: '',
  kontextRefImage: '',
  initImagePath: '',
  img2imgStrength: 0.4,
  regionalPromptingEnabled: false,
  regionalPromptRegions: [],
  videoMode: false
}

function presetConfig(partial: Partial<GenerationConfig>): GenerationConfig {
  return normalizeConfig({ ...partial, standardModel: '', diffusionModel: '' })
}

const BUILTIN_PRESETS: ConfigPreset[] = [
  {
    id: 'builtin-sd15',
    name: 'SD 1.x / 2.x',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'standard',
      cfgScale: 7,
      guidance: 3.5,
      steps: 20,
      width: 512,
      height: 512,
      sampler: 'euler_a',
      scheduler: 'discrete'
    })
  },
  {
    id: 'builtin-sdxl',
    name: 'SDXL',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'standard',
      cfgScale: 7,
      steps: 25,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete'
    })
  },
  {
    id: 'builtin-sd35',
    name: 'SD3 / SD3.5',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 4.5,
      guidance: 3.5,
      steps: 28,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      clipOnCpu: true,
      t5xxlModel: '',
      clipModel: '',
      clipGModel: ''
    })
  },
  {
    id: 'builtin-flux-dev',
    name: 'FLUX.1 Dev',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 1,
      guidance: 3.5,
      steps: 28,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      clipOnCpu: true,
      t5xxlModel: '',
      clipModel: '',
      vaeModel: '',
      flashAttention: true
    })
  },
  {
    id: 'builtin-flux-schnell',
    name: 'FLUX.1 Schnell',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 1,
      guidance: 3.5,
      steps: 4,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      clipOnCpu: true,
      t5xxlModel: '',
      clipModel: '',
      vaeModel: '',
      flashAttention: true
    })
  },
  {
    id: 'builtin-flux2-dev',
    name: 'FLUX.2 Dev',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 1,
      guidance: 3.5,
      steps: 28,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      vaeFormat: 'flux2',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-flux2-klein',
    name: 'FLUX.2 Klein',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 1,
      guidance: 3.5,
      steps: 4,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      vaeFormat: 'flux2',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-qwen-image',
    name: 'Qwen Image',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 2.5,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      flowShift: 3,
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-flux-kontext',
    name: 'FLUX Kontext',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 1,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      clipOnCpu: true,
      t5xxlModel: '',
      clipModel: '',
      vaeModel: '',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-qwen-image-edit',
    name: 'Qwen Image Edit',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 2.5,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      flowShift: 3,
      flashAttention: true,
      cpuOffload: true,
      qwenImageZeroCondT: false
    })
  },
  {
    id: 'builtin-qwen-image-edit-2511',
    name: 'Qwen Image Edit 2511',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 2.5,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      flowShift: 3,
      flashAttention: true,
      cpuOffload: true,
      qwenImageZeroCondT: true
    })
  },
  {
    id: 'builtin-z-image-turbo',
    name: 'Z-Image Turbo',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 1,
      guidance: 3.5,
      steps: 8,
      width: 512,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      vaeModel: '',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-chroma',
    name: 'Chroma',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 4,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      t5xxlModel: '',
      vaeModel: '',
      clipOnCpu: true,
      chromaDisableDitMask: true,
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-krea2',
    name: 'Krea2',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 3.5,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      vaeModel: '',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-lens',
    name: 'Lens',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 5,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      vaeFormat: 'flux2',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-lens-turbo',
    name: 'Lens Turbo',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 1,
      guidance: 3.5,
      steps: 4,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      llmModel: '',
      vaeFormat: 'flux2',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-ideogram4',
    name: 'Ideogram4',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      cfgScale: 3.5,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete',
      uncondDiffusionModel: '',
      llmModel: '',
      vaeFormat: 'flux2',
      flashAttention: true,
      cpuOffload: true
    })
  },
  {
    id: 'builtin-wan21',
    name: 'Wan2.1 Video',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      videoMode: true,
      cfgScale: 6,
      guidance: 3.5,
      steps: 20,
      width: 832,
      height: 480,
      sampler: 'euler',
      scheduler: 'discrete',
      flowShift: 3,
      flashAttention: true,
      cpuOffload: true,
      t5xxlModel: '',
      vaeModel: ''
    })
  },
  {
    id: 'builtin-wan22-a14b',
    name: 'Wan2.2 A14B Video',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      videoMode: true,
      cfgScale: 3.5,
      guidance: 3.5,
      steps: 10,
      width: 832,
      height: 480,
      sampler: 'euler',
      scheduler: 'discrete',
      flowShift: 3,
      flashAttention: true,
      cpuOffload: true,
      highNoiseDiffusionModel: '',
      t5xxlModel: '',
      vaeModel: ''
    })
  },
  {
    id: 'builtin-ltx23',
    name: 'LTX-2.3 Video',
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    config: presetConfig({
      loadMode: 'split',
      videoMode: true,
      cfgScale: 6,
      guidance: 3.5,
      steps: 20,
      width: 1280,
      height: 720,
      sampler: 'euler',
      scheduler: 'ltx2',
      flashAttention: true,
      cpuOffload: true,
      llmModel: '',
      embeddingsConnectorsModel: '',
      audioVaeModel: '',
      extraTilingArgs: 'temporal_tile_frames=4,temporal_tile_overlap=1'
    })
  }
]

function cloneConfig(value: GenerationConfig): GenerationConfig {
  return JSON.parse(JSON.stringify(value))
}

function normalizeConfig(value: Partial<GenerationConfig>): GenerationConfig {
  return {
    ...cloneConfig(defaultConfig),
    ...value,
    regionalPromptingEnabled: value.regionalPromptingEnabled === true,
    regionalPromptRegions: normalizeRegionalPromptRegions(value.regionalPromptRegions)
  }
}

function createPresetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function loadConfig(): GenerationConfig {
  if (typeof localStorage === 'undefined') return cloneConfig(defaultConfig)

  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    return raw ? normalizeConfig(JSON.parse(raw)) : cloneConfig(defaultConfig)
  } catch (e) {
    console.error('Failed to load current configuration:', e)
    return cloneConfig(defaultConfig)
  }
}

function persistConfig(value: GenerationConfig): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(value))
}

/** Debounce deep config watches — every keystroke used to JSON.stringify the full tree. */
const CONFIG_PERSIST_DEBOUNCE_MS = 400
let configPersistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersistConfig(value: GenerationConfig): void {
  if (typeof localStorage === 'undefined') return
  if (configPersistTimer) clearTimeout(configPersistTimer)
  configPersistTimer = setTimeout(() => {
    configPersistTimer = null
    persistConfig(value)
  }, CONFIG_PERSIST_DEBOUNCE_MS)
}

/**
 * useConfigStore - Pinia store for generation configuration
 * Centralizes all settings from the sidebar
 */
export const useConfigStore = defineStore('config', () => {
  // Default configuration matching original app
  const config = ref<GenerationConfig>(loadConfig())
  const presets = ref<ConfigPreset[]>([...BUILTIN_PRESETS])
  const selectedPresetId = ref('')

  // Keep direct v-model changes available after restart (debounced for main-thread cost).
  watch(config, (value) => schedulePersistConfig(value), { deep: true })

  function persistPresets(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(
      PRESETS_STORAGE_KEY,
      JSON.stringify(presets.value.filter((preset) => !preset.builtin))
    )
  }

  function loadPresets(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (!raw) {
        presets.value = [...BUILTIN_PRESETS]
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      presets.value = [
        ...BUILTIN_PRESETS,
        ...parsed
          .filter((preset) => preset?.id && preset?.name && preset?.config)
          .map((preset) => ({
            id: String(preset.id),
            name: String(preset.name),
            config: normalizeConfig(preset.config),
            createdAt: Number(preset.createdAt) || Date.now(),
            updatedAt: Number(preset.updatedAt) || Date.now()
          }))
      ]
    } catch (e) {
      console.error('Failed to load config presets:', e)
      presets.value = [...BUILTIN_PRESETS]
    }
  }

  function savePreset(name: string): ConfigPreset | null {
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const now = Date.now()
    const preset: ConfigPreset = {
      id: createPresetId(),
      name: trimmedName,
      config: cloneConfig(config.value),
      createdAt: now,
      updatedAt: now
    }

    const builtins = presets.value.filter((item) => item.builtin)
    const userPresets = presets.value.filter((item) => !item.builtin)
    presets.value = [...builtins, preset, ...userPresets]
    selectedPresetId.value = preset.id
    persistPresets()
    return preset
  }

  function updatePreset(id: string): void {
    const now = Date.now()
    presets.value = presets.value.map((preset) =>
      preset.id === id && !preset.builtin
        ? { ...preset, config: cloneConfig(config.value), updatedAt: now }
        : preset
    )
    persistPresets()
  }

  function applyPreset(id: string): void {
    const preset = presets.value.find((item) => item.id === id)
    if (!preset) return

    config.value = normalizeConfig(preset.config)
    selectedPresetId.value = preset.id
  }

  function deletePreset(id: string): void {
    presets.value = presets.value.filter((preset) => preset.builtin || preset.id !== id)
    if (selectedPresetId.value === id) {
      selectedPresetId.value = ''
    }
    persistPresets()
  }

  /**
   * updateConfig() - Partially update configuration
   */
  function updateConfig(partial: Partial<GenerationConfig>): void {
    config.value = { ...config.value, ...partial }
  }

  /**
   * applyConfigSnapshot() - Restore a compact history snapshot into live config
   */
  function applyConfigSnapshot(snapshot: Partial<GenerationConfig>): void {
    if (!snapshot || typeof snapshot !== 'object') return
    const next: Partial<GenerationConfig> = { ...snapshot }
    if (Array.isArray(snapshot.loras)) {
      next.loras = snapshot.loras.map((l) => ({ ...l }))
    }
    next.regionalPromptingEnabled = snapshot.regionalPromptingEnabled === true
    next.regionalPromptRegions = next.regionalPromptingEnabled
      ? normalizeRegionalPromptRegions(snapshot.regionalPromptRegions)
      : []
    config.value = normalizeConfig({ ...config.value, ...next })
  }

  /**
   * applyImageParams() - Apply PNG / webui generation metadata into config
   */
  function applyImageParams(
    params: ImageGenerationParams,
    mode: ImageParamsReuseMode = 'all'
  ): void {
    if (mode === 'seed') {
      if (params.seed != null && Number.isFinite(params.seed)) {
        config.value.seed = params.seed
      }
      return
    }

    const next: Partial<GenerationConfig> = {}
    next.regionalPromptingEnabled = false
    next.regionalPromptRegions = []
    if (params.seed != null && Number.isFinite(params.seed)) next.seed = params.seed
    if (params.steps != null && Number.isFinite(params.steps)) next.steps = params.steps
    const cfg = params.cfgScale ?? params.cfg_scale
    if (cfg != null && Number.isFinite(cfg)) next.cfgScale = cfg
    if (params.width != null && Number.isFinite(params.width)) next.width = params.width
    if (params.height != null && Number.isFinite(params.height)) next.height = params.height
    if (params.sampler) next.sampler = params.sampler
    if (params.scheduler) next.scheduler = params.scheduler
    if (params.guidance != null && Number.isFinite(params.guidance)) next.guidance = params.guidance
    const clipSkip = params.clipSkip ?? params.clip_skip
    if (clipSkip != null && Number.isFinite(clipSkip)) next.clipSkip = clipSkip

    const modelName = params.diffusionModel || params.model
    if (modelName) {
      // Metadata often stores basename only; assign to both load modes for convenience.
      const base = modelName.split(/[\\/]/).pop() || modelName
      if (config.value.loadMode === 'standard') next.standardModel = base
      else next.diffusionModel = base
    }

    updateConfig(next)
  }

  /**
   * applyLowVramProfile() - Docs-aligned low VRAM hardware recipe
   * (offload + stream-layers + max-vram -1 + flash attention)
   */
  function applyLowVramProfile(): void {
    updateConfig({
      cpuOffload: true,
      streamLayers: true,
      maxVram: -1,
      flashAttention: true
    })
  }

  /**
   * addLora() - Add a LoRA to the list
   */
  function addLora(
    path: string,
    strength: number = 1.0,
    target: 'default' | 'high_noise' = 'default'
  ): void {
    config.value.loras.push({ path, strength, target })
  }

  /**
   * applyCachePreset() - Apply a named caching recipe
   */
  function applyCachePreset(partial: {
    cacheMode: string
    cacheOption: string
    scmPolicy?: string
    scmMask?: string
  }): void {
    updateConfig({
      cacheMode: partial.cacheMode || '',
      cacheOption: partial.cacheOption || '',
      scmPolicy: partial.scmPolicy || '',
      scmMask: partial.scmMask || ''
    })
  }

  /**
   * removeLora() - Remove a LoRA by index
   */
  function removeLora(index: number): void {
    config.value.loras.splice(index, 1)
  }

  /**
   * addEmbedding() - Add an embedding
   */
  function addEmbedding(path: string): void {
    if (!config.value.embeddings.includes(path)) {
      config.value.embeddings.push(path)
    }
  }

  /**
   * removeEmbedding() - Remove an embedding
   */
  function removeEmbedding(path: string): void {
    config.value.embeddings = config.value.embeddings.filter((e) => e !== path)
  }

  /**
   * setDimensions() - Set width/height with preset support
   */
  function setDimensions(width: number, height: number): void {
    config.value.width = width
    config.value.height = height
  }

  /**
   * getSelectedModel() - Get the appropriate model based on load mode
   */
  const selectedModel = computed(() => {
    if (config.value.loadMode === 'standard') {
      return config.value.standardModel
    }
    return config.value.diffusionModel
  })

  loadPresets()

  return {
    config,
    presets,
    selectedPresetId,
    updateConfig,
    applyConfigSnapshot,
    applyImageParams,
    applyLowVramProfile,
    applyCachePreset,
    loadPresets,
    savePreset,
    updatePreset,
    applyPreset,
    deletePreset,
    addLora,
    removeLora,
    addEmbedding,
    removeEmbedding,
    setDimensions,
    selectedModel
  }
})
