/**
 * The sd.cpp options the app knows by name: which setup key drives which flag, its label,
 * group and control. The UI renders every model option from this table (ModelOptions.vue),
 * and anything sd-cli lists that is not here shows up under "More sd.cpp options"
 * through `extraHelpOptions` — so a new sd.cpp flag is usable on day one and becomes a
 * first-class control by adding one row below.
 */
import type { SdHelp, SdOption } from './sdHelp.ts'
import { findOption, helpFlagNames } from './sdHelp.ts'
import type { ModelSetupFields } from './modelSetup.ts'

export type OptionGroup =
  | 'files'
  | 'loras'
  | 'sampling'
  | 'size'
  | 'inputs'
  | 'hires'
  | 'facefix'
  | 'video'
  | 'output'
  | 'advanced'

export const OPTION_GROUPS: Array<{ id: OptionGroup; label: string }> = [
  { id: 'files', label: 'Model files' },
  { id: 'loras', label: 'LoRAs & embeddings' },
  { id: 'sampling', label: 'Sampling' },
  { id: 'size', label: 'Size & tiling' },
  { id: 'inputs', label: 'Image inputs' },
  { id: 'hires', label: 'Hi-res fix' },
  { id: 'facefix', label: 'Face fix' },
  { id: 'video', label: 'Video' },
  { id: 'output', label: 'Output' },
  { id: 'advanced', label: 'Advanced' }
]

export type OptionControl =
  | 'file'
  | 'number'
  | 'slider'
  | 'select'
  | 'toggle'
  | 'text'
  | 'loras'
  | 'embeddings'

export type SetupKey = keyof ModelSetupFields

export interface CatalogOption {
  key: SetupKey
  /** The sd-cli flag this key drives ('' when it maps to several flags or none) */
  flag: string
  label: string
  group: OptionGroup
  control: OptionControl
  min?: number
  max?: number
  step?: number
  /** Fixed choices; omitted for selects whose choices come from the flag's `--help` entry */
  choices?: Array<{ value: string; label: string }>
  /** `/api/models` category for file controls */
  category?: string
  /** One line under the control */
  hint?: string
  /** Value that means "let sd.cpp decide" (shown as "Auto") */
  autoValue?: string | number
}

const file = (
  key: SetupKey,
  flag: string,
  label: string,
  category: string,
  group: OptionGroup = 'files',
  hint?: string
): CatalogOption => ({ key, flag, label, group, control: 'file', category, hint })

const toggle = (key: SetupKey, flag: string, label: string, group: OptionGroup, hint?: string) =>
  ({ key, flag, label, group, control: 'toggle', hint }) satisfies CatalogOption

const help = (key: SetupKey, flag: string, label: string, group: OptionGroup, hint?: string) =>
  ({ key, flag, label, group, control: 'select', hint }) satisfies CatalogOption

const text = (key: SetupKey, flag: string, label: string, group: OptionGroup, hint?: string) =>
  ({ key, flag, label, group, control: 'text', hint }) satisfies CatalogOption

const slider = (
  key: SetupKey,
  flag: string,
  label: string,
  group: OptionGroup,
  min: number,
  max: number,
  step: number,
  extra: Partial<CatalogOption> = {}
): CatalogOption => ({ key, flag, label, group, control: 'slider', min, max, step, ...extra })

const number = (
  key: SetupKey,
  flag: string,
  label: string,
  group: OptionGroup,
  extra: Partial<CatalogOption> = {}
): CatalogOption => ({ key, flag, label, group, control: 'number', ...extra })

export const OPTION_CATALOG: CatalogOption[] = [
  // Model files (the main model is picked by the model picker itself)
  file('vaeModel', '--vae', 'VAE', 'vae'),
  file('t5xxlModel', '--t5xxl', 'T5-XXL text encoder', 't5xxl'),
  file('llmModel', '--llm', 'LLM text encoder', 'llm'),
  file('llmVisionModel', '--llm_vision', 'LLM vision encoder', 'llmVision'),
  file('clipModel', '--clip_l', 'CLIP-L', 'clip'),
  file('clipGModel', '--clip_g', 'CLIP-G', 'clipG'),
  file('clipVisionModel', '--clip_vision', 'CLIP vision', 'clipVision'),
  file('highNoiseDiffusionModel', '--high-noise-diffusion-model', 'High-noise model', 'diffusion'),
  file(
    'uncondDiffusionModel',
    '--uncond-diffusion-model',
    'Unconditional model',
    'uncondDiffusion'
  ),
  file(
    'embeddingsConnectorsModel',
    '--embeddings-connectors',
    'Embeddings connectors',
    'embeddingsConnectors'
  ),
  file('audioVaeModel', '--audio-vae', 'Audio VAE', 'audioVae'),
  file('taesdModel', '--taesd', 'Tiny VAE (fast decode)', 'taesd'),
  file('tokenizerModel', '--tokenizer', 'Tokenizer', 'tokenizers'),
  file('motionModule', '--motion-module', 'AnimateDiff motion module', 'animatediff'),
  {
    key: 'vaeFormat',
    flag: '--vae-format',
    label: 'VAE latent format',
    group: 'files',
    control: 'select',
    choices: [
      { value: '', label: 'Auto' },
      { value: 'flux', label: 'FLUX' },
      { value: 'sd3', label: 'SD3' },
      { value: 'flux2', label: 'FLUX.2' },
      { value: 'wan', label: 'Wan' }
    ]
  },

  // LoRAs & embeddings
  { key: 'loras', flag: '', label: 'LoRAs', group: 'loras', control: 'loras', category: 'loras' },
  help('loraApplyMode', '--lora-apply-mode', 'LoRA apply mode', 'loras'),
  {
    key: 'embeddings',
    flag: '',
    label: 'Embeddings',
    group: 'loras',
    control: 'embeddings',
    category: 'embeddings'
  },

  // Sampling
  help('sampler', '--sampling-method', 'Sampler', 'sampling'),
  help('scheduler', '--scheduler', 'Scheduler', 'sampling'),
  slider('steps', '--steps', 'Steps', 'sampling', 1, 150, 1),
  slider('cfgScale', '--cfg-scale', 'CFG scale', 'sampling', 0, 30, 0.1),
  slider('guidance', '--guidance', 'Distilled guidance', 'sampling', 0, 20, 0.1),
  number('imgCfgScale', '--img-cfg-scale', 'Image CFG scale', 'sampling', {
    step: 0.1,
    autoValue: 0,
    hint: '0 uses the CFG scale'
  }),
  number('flowShift', '--flow-shift', 'Flow shift', 'sampling', { step: 0.1, autoValue: 0 }),
  number('eta', '--eta', 'Eta (noise multiplier)', 'sampling', { step: 0.05, autoValue: 0 }),
  number('clipSkip', '--clip-skip', 'CLIP skip', 'sampling', { min: -1, max: 12, autoValue: -1 }),
  number('timestepShift', '--timestep-shift', 'Timestep shift (NitroFusion)', 'sampling', {
    min: 0,
    autoValue: 0
  }),
  text(
    'sigmas',
    '--sigmas',
    'Custom sigmas',
    'sampling',
    'Comma-separated, e.g. 14.61,7.8,3.5,0.0'
  ),
  help('rngType', '--rng', 'RNG', 'sampling'),
  help('samplerRngType', '--sampler-rng', 'Sampler RNG', 'sampling'),
  help('predictionType', '--prediction', 'Prediction type', 'sampling'),
  number('slgScale', '--slg-scale', 'Skip-layer guidance scale', 'sampling', {
    step: 0.1,
    autoValue: 0,
    hint: 'DiT models only; 2.5 suits SD3.5 Medium'
  }),
  number('skipLayerStart', '--skip-layer-start', 'SLG start', 'sampling', { step: 0.01 }),
  number('skipLayerEnd', '--skip-layer-end', 'SLG end', 'sampling', { step: 0.01 }),
  text('skipLayers', '--skip-layers', 'SLG layers', 'sampling', 'e.g. [7,8,9]'),

  // Size & tiling (width/height are edited by the size control)
  toggle('circular', '--circular', 'Tileable (both axes)', 'size'),
  toggle('circularX', '--circularx', 'Tileable horizontally', 'size'),
  toggle('circularY', '--circulary', 'Tileable vertically', 'size'),

  // Image inputs
  slider('img2imgStrength', '--strength', 'Image strength', 'inputs', 0, 1, 0.01, {
    hint: 'How much a start image may change'
  }),
  {
    key: 'refImagePreset',
    flag: '--ref-image-args',
    label: 'Reference handling',
    group: 'inputs',
    control: 'select',
    choices: [
      { value: 'auto', label: 'Auto (from model)' },
      { value: 'off', label: 'sd.cpp default' },
      { value: 'flux_kontext', label: 'FLUX Kontext' },
      { value: 'flux2', label: 'FLUX.2' },
      { value: 'qwen', label: 'Qwen Image Edit' },
      { value: 'qwen_layered', label: 'Qwen Image Layered' },
      { value: 'longcat', label: 'LongCat' },
      { value: 'z_image_omni', label: 'Z-Image Omni' },
      { value: 'krea2_edit', label: 'Krea2 edit' },
      { value: 'krea2_ostris_edit', label: 'Krea2 edit (Ostris)' },
      { value: 'cosmos_reference', label: 'Anima / Cosmos reference' },
      { value: 'default', label: 'Generic' }
    ]
  },
  file('controlNetModel', '--control-net', 'ControlNet', 'controlnet', 'inputs'),
  slider('controlNetStrength', '--control-strength', 'ControlNet strength', 'inputs', 0, 2, 0.05),
  toggle('applyCanny', '--canny', 'Edge-detect the control image (Canny)', 'inputs'),
  file('ipAdapterModel', '--ip-adapter', 'IP-Adapter (style reference)', 'ipAdapter', 'inputs'),
  slider('ipAdapterStrength', '--ip-adapter-strength', 'IP-Adapter strength', 'inputs', 0, 2, 0.05),
  file('pulidWeights', '--pulid-weights', 'PuLID weights (identity)', 'pulid', 'inputs'),
  file('pulidIdEmbedding', '--pulid-id-embedding', 'PuLID identity embedding', 'pulid', 'inputs'),
  slider('pulidIdWeight', '--pulid-id-weight', 'PuLID identity weight', 'inputs', 0, 2, 0.05),
  file('photoMakerModel', '--photo-maker', 'PhotoMaker', 'photomaker', 'inputs'),
  slider(
    'photoMakerStyleStrength',
    '--pm-style-strength',
    'PhotoMaker style strength',
    'inputs',
    0,
    100,
    1
  ),

  // Hi-res fix
  toggle('hiresEnabled', '--hires', 'Hi-res fix', 'hires', 'A second pass at a larger size'),
  {
    key: 'hiresUpscaler',
    flag: '--hires-upscaler',
    label: 'Upscaler',
    group: 'hires',
    control: 'select'
  },
  slider('hiresScale', '--hires-scale', 'Scale', 'hires', 1, 4, 0.05),
  number('hiresSteps', '--hires-steps', 'Steps', 'hires', {
    min: 0,
    autoValue: 0,
    hint: '0 reuses Steps'
  }),
  slider('hiresDenoise', '--hires-denoising-strength', 'Denoise', 'hires', 0, 1, 0.01),

  // Face fix (ADetailer)
  toggle('adetailerEnabled', '--ad-model', 'Fix faces after generating', 'facefix'),
  file('adetailerModel', '--ad-model', 'Detector', 'adetailer', 'facefix'),
  text('adetailerPrompt', '--ad-prompt', 'Prompt', 'facefix', 'Empty uses the main prompt'),
  text('adetailerNegativePrompt', '--ad-negative-prompt', 'Negative prompt', 'facefix'),
  slider('adetailerConfidence', '', 'Confidence', 'facefix', 0.05, 1, 0.05),
  slider('adetailerDenoisingStrength', '', 'Denoise', 'facefix', 0, 1, 0.01),
  number('adetailerInpaintPadding', '', 'Padding', 'facefix', { min: 0 }),
  number('adetailerMaskBlur', '', 'Mask blur', 'facefix', { min: 0 }),
  number('adetailerInpaintWidth', '', 'Inpaint width', 'facefix', { min: 64, step: 64 }),
  number('adetailerInpaintHeight', '', 'Inpaint height', 'facefix', { min: 64, step: 64 }),
  number('adetailerMaskKLargest', '', 'Only the K largest faces', 'facefix', {
    min: 0,
    autoValue: 0
  }),
  text(
    'adetailerExtraArgs',
    '--extra-ad-args',
    'Extra ADetailer args',
    'facefix',
    'key=value list'
  ),

  // Video
  number('videoFrames', '--video-frames', 'Frames', 'video', { min: 1, max: 1025 }),
  number('videoFps', '--fps', 'Frames per second', 'video', { min: 1, max: 120 }),
  number('highNoiseSteps', '--high-noise-steps', 'High-noise steps', 'video', {
    min: -1,
    autoValue: -1
  }),
  number('highNoiseCfg', '--high-noise-cfg-scale', 'High-noise CFG', 'video', { step: 0.1 }),
  help('highNoiseSampler', '--high-noise-sampling-method', 'High-noise sampler', 'video'),
  number('highNoiseGuidance', '--high-noise-guidance', 'High-noise guidance', 'video', {
    step: 0.1,
    autoValue: 0
  }),
  slider('moeBoundary', '--moe-boundary', 'MoE boundary (Wan 2.2)', 'video', 0, 1, 0.005),
  slider('vaceStrength', '--vace-strength', 'VACE strength', 'video', 0, 2, 0.05),
  toggle('temporalTiling', '--temporal-tiling', 'Temporal VAE tiling (LTX)', 'video'),
  text('extraTilingArgs', '--extra-tiling-args', 'Extra tiling args', 'video', 'key=value list'),

  // Output
  number('qwenImageLayers', '--qwen-image-layers', 'Qwen Image layers', 'output', {
    min: 0,
    max: 16,
    autoValue: 0,
    hint: 'Qwen Image Layered: outputs layers + 1 images'
  }),
  file('upscaleModel', '--upscale-model', 'Upscaler for "Upscale"', 'upscale', 'output'),

  // Advanced
  text(
    'extraSampleArgs',
    '--extra-sample-args',
    'Extra sampler args',
    'advanced',
    'key=value list'
  ),
  {
    key: 'cacheMode',
    flag: '--cache-mode',
    label: 'Cache',
    group: 'advanced',
    control: 'select',
    choices: [
      { value: '', label: 'Off' },
      { value: 'easycache', label: 'EasyCache (DiT)' },
      { value: 'ucache', label: 'uCache (UNet)' },
      { value: 'dbcache', label: 'DBCache (DiT)' },
      { value: 'taylorseer', label: 'TaylorSeer (DiT)' },
      { value: 'cache-dit', label: 'cache-dit (DiT)' },
      { value: 'spectrum', label: 'Spectrum' }
    ]
  },
  text('cacheOption', '--cache-option', 'Cache options', 'advanced', 'e.g. threshold=0.25'),
  text('scmMask', '--scm-mask', 'SCM mask', 'advanced'),
  text('scmPolicy', '--scm-policy', 'SCM policy', 'advanced', 'dynamic or static'),
  text(
    'quantizationType',
    '--type',
    'Weight type on load',
    'advanced',
    'e.g. q8_0; empty keeps the file type'
  ),
  text('tensorTypeRules', '--tensor-type-rules', 'Tensor type rules', 'advanced'),
  toggle('qwenImageZeroCondT', '--model-args', 'Qwen zero cond_t', 'advanced'),
  toggle('chromaEnableT5Mask', '--model-args', 'Chroma T5 mask', 'advanced'),
  toggle('chromaDisableDitMask', '--model-args', 'Chroma: disable DiT mask', 'advanced'),
  number('chromaT5MaskPad', '--model-args', 'Chroma T5 mask padding', 'advanced', { min: 0 })
]

export function catalogOption(key: string): CatalogOption | undefined {
  return OPTION_CATALOG.find((option) => option.key === key)
}

/**
 * Flags the app sets itself: inputs, outputs, prompts, the main model, folders, run mode and
 * everything the catalog or machine settings drive. Never offered as a free option.
 */
const APP_MANAGED_FLAGS = new Set([
  '--output',
  '--preview-path',
  '--preview-interval',
  '--preview',
  '--preview-noisy',
  '--taesd-preview-only',
  '--imat-out',
  '--imat-in',
  '--image',
  '--metadata-format',
  '--metadata-raw',
  '--metadata-brief',
  '--metadata-all',
  '--convert-name',
  '--output-begin-idx',
  '--verbose',
  '--color',
  '--mode',
  '--help',
  '--list-devices',
  '--model',
  '--diffusion-model',
  '--prompt',
  '--negative-prompt',
  '--prompt-file',
  '--negative-prompt-file',
  '--init-img',
  '--end-img',
  '--mask',
  '--control-image',
  '--control-video',
  '--ip-adapter-image',
  '--pm-id-images-dir',
  '--pm-id-embed-path',
  '--ref-image',
  '--ref-video',
  '--ref-video-audio',
  '--ref-audio',
  '--embd-dir',
  '--lora-model-dir',
  '--hires-upscalers-dir',
  '--seed',
  '--batch-count',
  '--width',
  '--height',
  '--upscale-repeats',
  '--upscale-tile-size',
  // machine settings (Settings → Engine & performance)
  '--backend',
  '--params-backend',
  '--split-mode',
  '--rpc-servers',
  '--max-vram',
  '--threads',
  '--stream-layers',
  '--eager-load',
  '--auto-fit',
  '--offload-to-cpu',
  '--mmap',
  '--control-net-cpu',
  '--clip-on-cpu',
  '--vae-on-cpu',
  '--fa',
  '--diffusion-fa',
  '--diffusion-conv-direct',
  '--vae-conv-direct',
  '--force-sdxl-vae-conv-scale',
  '--vae-tiling',
  '--vae-tile-size',
  '--vae-tile-overlap',
  '--vae-relative-tile-size',
  '--disable-image-metadata',
  // deprecated aliases
  '--qwen2vl',
  '--qwen2vl_vision',
  '--tae'
])

const CATALOG_FLAGS = new Set(OPTION_CATALOG.map((option) => option.flag).filter(Boolean))

/** Help options that take a file path or folder: only the app's own pickers may set those. */
function takesPath(option: SdOption): boolean {
  return /\b(path to|directory|dir\b|file\b)/i.test(option.description) && option.type === 'string'
}

/**
 * Options sd-cli offers that the catalog does not cover yet — rendered generically and sent
 * through `setup.cliOptions`. A new sd.cpp release adds rows here automatically.
 */
export function extraHelpOptions(help: SdHelp): SdOption[] {
  return help.options.filter(
    (option) =>
      option.section !== 'CLI' &&
      !APP_MANAGED_FLAGS.has(option.flag) &&
      !CATALOG_FLAGS.has(option.flag) &&
      !takesPath(option) &&
      !/^deprecated/i.test(option.description)
  )
}

export type CliOptionValue = string | number | boolean
export type CliOptions = Record<string, CliOptionValue>

/**
 * Validate free options against the installed sd-cli's help and append them to argv.
 * Rejects (throws) instead of dropping, so the user sees why a run did not start.
 */
export function appendCliOptions(args: string[], values: unknown, help: SdHelp): void {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return
  const allowed = new Set(extraHelpOptions(help).map((option) => option.flag))
  const present = new Set(args.filter((arg) => arg.startsWith('-')))
  for (const [flag, raw] of Object.entries(values as Record<string, unknown>)) {
    if (raw === '' || raw === null || raw === undefined || raw === false) continue
    const option = findOption(help, flag)
    if (!option || !allowed.has(option.flag)) {
      throw new Error(`${flag} is not an option this sd.cpp build lets the app set.`)
    }
    if (present.has(option.flag)) continue
    if (option.type === 'bool') {
      if (raw === true) args.push(option.flag)
      continue
    }
    args.push(option.flag, checkValue(option, raw))
  }
}

function checkValue(option: SdOption, raw: unknown): string {
  const text = String(raw).trim()
  const fail = (expected: string): never => {
    throw new Error(`sd.cpp expects ${expected} for ${option.flag}, got "${text.slice(0, 40)}".`)
  }
  if (option.type === 'int') {
    const value = Number(text)
    if (!Number.isInteger(value) || Math.abs(value) > 1e9) fail('a whole number')
    return String(value)
  }
  if (option.type === 'float') {
    const value = Number(text)
    if (!Number.isFinite(value)) fail('a number')
    return String(value)
  }
  if (option.type === 'enum') {
    if (!option.choices?.includes(text)) fail(`one of ${option.choices?.join(', ')}`)
    return text
  }
  // Free text: one line, no paths, no flag-looking values.
  if (!text || text.length > 400 || /[\r\n]/.test(text)) fail('a short single-line value')
  if (/[\\/]|\.\./.test(text)) fail('a value without file paths')
  if (text.startsWith('-') && !Number.isFinite(Number(text))) fail('a value')
  return text
}

/**
 * Check values the app's own argv builders produced against the installed sd-cli's help:
 * enum flags must use a listed choice and numeric flags must be numbers. Throws a readable
 * error instead of letting sd-cli fail with a usage dump.
 */
export function checkArgValues(args: readonly string[], help: SdHelp): void {
  const names = helpFlagNames(help)
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i]
    if (!flag.startsWith('-') || !names.has(flag)) continue
    const option = findOption(help, flag)
    if (!option || option.type === 'bool') continue
    const value = args[i + 1]
    if (value === undefined) continue
    i += 1
    if (option.type === 'enum' && option.choices && !option.choices.includes(value)) {
      const alias = new RegExp(`\\b${escapeRegExp(value)}=`, 'i').test(option.description)
      if (!alias) {
        throw new Error(
          `sd.cpp does not accept "${value}" for ${option.flag}. Choose one of: ${option.choices.join(', ')}.`
        )
      }
    }
    if ((option.type === 'int' || option.type === 'float') && !Number.isFinite(Number(value))) {
      throw new Error(`sd.cpp expects a number for ${option.flag}, got "${value}".`)
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Choices for a catalog select: fixed list, or the flag's enum from the installed sd-cli. */
export function optionChoices(
  option: CatalogOption,
  help: SdHelp | null
): Array<{ value: string; label: string }> {
  if (option.choices) return option.choices
  const helpOption = help && option.flag ? findOption(help, option.flag) : undefined
  return (helpOption?.choices || []).map((value) => ({ value, label: value }))
}
