/**
 * Model setup: everything that travels with a model choice — the model files, its
 * companion encoders/VAE, LoRAs, sampling and the features that model supports.
 *
 * The generation config splits into three groups:
 * - setup   (ModelSetupFields) — per workspace and per workflow node; safe to share
 * - machine (MachineFields)    — per device (GPU placement, offload, threads…); never shared
 * - run     (RunFields)        — per generation (seed, uploaded images, batch)
 */

export type LoraTarget = 'default' | 'high_noise'

export interface SetupLora {
  path: string
  strength: number
  target?: LoraTarget
}

export interface ModelSetupFields {
  /** Model family id from modelFamilies.ts ('' = unknown / custom) */
  modelFamily: string
  loadMode: 'standard' | 'split'
  standardModel: string
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
  vaeModel: string
  audioVaeModel: string
  taesdModel: string
  /** Separate tokenizer.json for families whose LLM vocabulary differs (MOSS, Ming, LLaDA) */
  tokenizerModel: string
  motionModule: string
  vaeFormat: string
  controlNetModel: string
  photoMakerModel: string
  upscaleModel: string

  loras: SetupLora[]
  loraApplyMode: 'auto' | 'immediately' | 'at_runtime'
  embeddings: string[]

  scheduler: string
  sampler: string
  rngType: string
  samplerRngType: string
  steps: number
  cfgScale: number
  guidance: number
  clipSkip: number
  width: number
  height: number
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
  predictionType: string
  quantizationType: string
  tensorTypeRules: string
  cacheMode: string
  cacheOption: string
  scmMask: string
  scmPolicy: string

  circular: boolean
  circularX: boolean
  circularY: boolean
  qwenImageZeroCondT: boolean
  chromaEnableT5Mask: boolean
  chromaDisableDitMask: boolean
  chromaT5MaskPad: number

  refImagePreset: string
  img2imgStrength: number
  controlNetStrength: number
  applyCanny: boolean
  photoMakerStyleStrength: number

  adetailerEnabled: boolean
  adetailerModel: string
  adetailerPrompt: string
  adetailerNegativePrompt: string
  adetailerConfidence: number
  adetailerDenoisingStrength: number
  adetailerInpaintPadding: number
  adetailerMaskBlur: number
  adetailerInpaintWidth: number
  adetailerInpaintHeight: number
  adetailerMaskKLargest: number
  adetailerMaskMode: string
  adetailerSortBy: string
  adetailerExtraArgs: string

  hiresEnabled: boolean
  /** Built-in (Latent, Lanczos, …) or a file in models/hires_upscalers */
  hiresUpscaler: string
  hiresScale: number
  hiresSteps: number
  hiresDenoise: number

  ipAdapterModel: string
  ipAdapterStrength: number
  pulidWeights: string
  pulidIdEmbedding: string
  pulidIdWeight: number
  /** Qwen Image Layered: layers to split into (output count is layers + 1); 0 = off */
  qwenImageLayers: number
  /** NitroFusion timestep shift; 0 = off */
  timestepShift: number

  videoMode: boolean
  videoFrames: number
  videoFps: number
  temporalTiling: boolean
  highNoiseSteps: number
  highNoiseCfg: number
  highNoiseSampler: string
  highNoiseGuidance: number
  moeBoundary: number
  vaceStrength: number
  /** sd-cli options the catalog does not name yet (flag → value), validated against --help */
  cliOptions: Record<string, string | number | boolean>
}

export interface MachineFields {
  flashAttention: boolean
  vaeTiling: boolean
  vaeTileSize: number
  clipOnCpu: boolean
  cpuOffload: boolean
  vaeOnCpu: boolean
  controlNetOnCpu: boolean
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
  /** Load all weights at model-load time instead of lazily */
  eagerLoad: boolean
  /** Remote ggml RPC servers, host:port comma list (devices appear as RPC0, RPC1…) */
  rpcServers: string
  disableImageMetadata: boolean
  livePreviewMethod: string
}

export interface RunFields {
  seed: number
  /** When true, keep seed fixed across gens (do not force -1) */
  seedLocked: boolean
  batchCount: number
  initImagePath: string
  kontextRefImage: string
  controlImagePath: string
  photoMakerImages: string[]
  photoMakerIdEmbedsPath: string
  ipAdapterImage: string
}

export type ModelSetup = ModelSetupFields

export const DEFAULT_SETUP: ModelSetupFields = {
  modelFamily: '',
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
  audioVaeModel: '',
  taesdModel: '',
  tokenizerModel: '',
  motionModule: '',
  vaeFormat: '',
  controlNetModel: '',
  photoMakerModel: '',
  upscaleModel: '',
  loras: [],
  loraApplyMode: 'auto',
  embeddings: [],
  scheduler: 'discrete',
  sampler: 'euler',
  rngType: '',
  samplerRngType: '',
  steps: 20,
  cfgScale: 3.5,
  guidance: 3.5,
  clipSkip: -1,
  width: 1024,
  height: 1024,
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
  predictionType: '',
  quantizationType: '',
  tensorTypeRules: '',
  cacheMode: '',
  cacheOption: '',
  scmMask: '',
  scmPolicy: '',
  circular: false,
  circularX: false,
  circularY: false,
  qwenImageZeroCondT: false,
  chromaEnableT5Mask: false,
  chromaDisableDitMask: false,
  chromaT5MaskPad: 0,
  refImagePreset: 'auto',
  img2imgStrength: 0.4,
  controlNetStrength: 0.9,
  applyCanny: false,
  photoMakerStyleStrength: 20,
  adetailerEnabled: false,
  adetailerModel: '',
  adetailerPrompt: '',
  adetailerNegativePrompt: '',
  adetailerConfidence: 0.3,
  adetailerDenoisingStrength: 0.4,
  adetailerInpaintPadding: 32,
  adetailerMaskBlur: 4,
  adetailerInpaintWidth: 512,
  adetailerInpaintHeight: 512,
  adetailerMaskKLargest: 0,
  adetailerMaskMode: 'none',
  adetailerSortBy: 'none',
  adetailerExtraArgs: '',
  hiresEnabled: false,
  hiresUpscaler: 'Latent',
  hiresScale: 1.5,
  hiresSteps: 0,
  hiresDenoise: 0.5,
  ipAdapterModel: '',
  ipAdapterStrength: 0.8,
  pulidWeights: '',
  pulidIdEmbedding: '',
  pulidIdWeight: 1,
  qwenImageLayers: 0,
  timestepShift: 0,
  videoMode: false,
  videoFrames: 33,
  videoFps: 24,
  temporalTiling: false,
  highNoiseSteps: 8,
  highNoiseCfg: 3.5,
  highNoiseSampler: 'euler',
  highNoiseGuidance: 0,
  moeBoundary: 0.875,
  vaceStrength: 1,
  cliOptions: {}
}

export const DEFAULT_MACHINE: MachineFields = {
  flashAttention: false,
  vaeTiling: false,
  vaeTileSize: 0,
  clipOnCpu: false,
  cpuOffload: false,
  vaeOnCpu: false,
  controlNetOnCpu: false,
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
  eagerLoad: false,
  rpcServers: '',
  disableImageMetadata: false,
  livePreviewMethod: ''
}

export const DEFAULT_RUN: RunFields = {
  seed: -1,
  seedLocked: false,
  batchCount: 1,
  initImagePath: '',
  kontextRefImage: '',
  controlImagePath: '',
  photoMakerImages: [],
  photoMakerIdEmbedsPath: '',
  ipAdapterImage: ''
}

export const SETUP_KEYS = Object.keys(DEFAULT_SETUP) as Array<keyof ModelSetupFields>
export const MACHINE_KEYS = Object.keys(DEFAULT_MACHINE) as Array<keyof MachineFields>
export const RUN_KEYS = Object.keys(DEFAULT_RUN) as Array<keyof RunFields>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function pick<T extends object>(source: object, defaults: T): T {
  const out = clone(defaults) as Record<string, unknown>
  const src = source as Record<string, unknown>
  for (const key of Object.keys(defaults)) {
    const value = src[key]
    const fallback = out[key]
    if (value === undefined || value === null) continue
    // Keep the declared shape: wrong primitive types fall back to defaults
    if (Array.isArray(fallback) ? !Array.isArray(value) : typeof value !== typeof fallback) continue
    out[key] = clone(value)
  }
  return out as T
}

/** A complete, type-checked setup from any config-like object (missing keys get defaults). */
export function pickSetup(source: object): ModelSetup {
  return pick(source, DEFAULT_SETUP)
}

export function pickMachine(source: object): MachineFields {
  return pick(source, DEFAULT_MACHINE)
}

export function createSetup(partial: Partial<ModelSetup> = {}): ModelSetup {
  return pickSetup({ ...DEFAULT_SETUP, ...partial })
}

/* ------------------------- Model file slots ------------------------- */

/** Setup keys that hold a model file name. */
export type SetupModelKey =
  | 'standardModel'
  | 'diffusionModel'
  | 'highNoiseDiffusionModel'
  | 'uncondDiffusionModel'
  | 't5xxlModel'
  | 'llmModel'
  | 'llmVisionModel'
  | 'clipModel'
  | 'clipGModel'
  | 'clipVisionModel'
  | 'embeddingsConnectorsModel'
  | 'vaeModel'
  | 'audioVaeModel'
  | 'taesdModel'
  | 'tokenizerModel'
  | 'motionModule'

/** Setup model key → `/api/models` list it picks from. */
export const MODEL_KEY_CATEGORY: Record<SetupModelKey, string> = {
  standardModel: 'diffusion',
  diffusionModel: 'diffusion',
  highNoiseDiffusionModel: 'diffusion',
  uncondDiffusionModel: 'uncondDiffusion',
  t5xxlModel: 't5xxl',
  llmModel: 'llm',
  llmVisionModel: 'llmVision',
  clipModel: 'clip',
  clipGModel: 'clipG',
  clipVisionModel: 'clipVision',
  embeddingsConnectorsModel: 'embeddingsConnectors',
  vaeModel: 'vae',
  audioVaeModel: 'audioVae',
  taesdModel: 'taesd',
  tokenizerModel: 'tokenizers',
  motionModule: 'animatediff'
}

/** Installed files per category (shape of `/api/models`). */
export type InstalledModels = Record<string, string[] | undefined>

export function mainModelKey(
  setup: Pick<ModelSetup, 'loadMode'>
): 'standardModel' | 'diffusionModel' {
  return setup.loadMode === 'standard' ? 'standardModel' : 'diffusionModel'
}

export function mainModel(
  setup: Pick<ModelSetup, 'loadMode' | 'standardModel' | 'diffusionModel'>
): string {
  return setup.loadMode === 'standard' ? setup.standardModel : setup.diffusionModel
}

export function baseName(file: string): string {
  return file.split(/[\\/]/).pop() || file
}

/** Display name: file name without folders or weight extension. */
export function modelLabel(file: string): string {
  return baseName(file).replace(/\.(gguf|safetensors|sft|ckpt|pt|pth|bin|json)$/i, '')
}

export function filesIn(installed: InstalledModels, key: SetupModelKey): string[] {
  return installed[MODEL_KEY_CATEGORY[key]] || []
}

/**
 * Pick the best installed file for a slot: keep the current value when it is still
 * installed, otherwise the first file matching the slot patterns (pattern order = priority).
 */
export function matchSlotFile(
  files: readonly string[],
  patterns: readonly RegExp[],
  current = ''
): string {
  if (current && files.includes(current)) return current
  for (const pattern of patterns) {
    const hit = files.find((file) => pattern.test(baseName(file)))
    if (hit) return hit
  }
  return ''
}
