import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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

  // LoRAs (array of { path, strength })
  loras: Array<{ path: string; strength: number }>
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

  // Video mode
  videoMode: boolean
}

export interface ConfigPreset {
  id: string
  name: string
  config: GenerationConfig
  createdAt: number
  updatedAt: number
}

const PRESETS_STORAGE_KEY = 'flaxeo-config-presets'

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
  videoMode: false
}

function cloneConfig(value: GenerationConfig): GenerationConfig {
  return JSON.parse(JSON.stringify(value))
}

function normalizeConfig(value: Partial<GenerationConfig>): GenerationConfig {
  return { ...cloneConfig(defaultConfig), ...value }
}

function createPresetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * useConfigStore - Pinia store for generation configuration
 * Centralizes all settings from the sidebar
 */
export const useConfigStore = defineStore('config', () => {
  // Default configuration matching original app
  const config = ref<GenerationConfig>(cloneConfig(defaultConfig))
  const presets = ref<ConfigPreset[]>([])
  const selectedPresetId = ref('')

  function persistPresets(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets.value))
  }

  function loadPresets(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      presets.value = parsed
        .filter((preset) => preset?.id && preset?.name && preset?.config)
        .map((preset) => ({
          id: String(preset.id),
          name: String(preset.name),
          config: normalizeConfig(preset.config),
          createdAt: Number(preset.createdAt) || Date.now(),
          updatedAt: Number(preset.updatedAt) || Date.now()
        }))
    } catch (e) {
      console.error('Failed to load config presets:', e)
      presets.value = []
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

    presets.value = [preset, ...presets.value]
    selectedPresetId.value = preset.id
    persistPresets()
    return preset
  }

  function updatePreset(id: string): void {
    const now = Date.now()
    presets.value = presets.value.map((preset) =>
      preset.id === id ? { ...preset, config: cloneConfig(config.value), updatedAt: now } : preset
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
    presets.value = presets.value.filter((preset) => preset.id !== id)
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
   * addLora() - Add a LoRA to the list
   */
  function addLora(path: string, strength: number = 1.0): void {
    config.value.loras.push({ path, strength })
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
