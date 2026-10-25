/**
 * Catalog of every model family stable-diffusion.cpp supports (README "Supported models").
 * Each family says which files it needs, how to recognise them on disk, what settings the
 * upstream docs recommend, and which features the UI may offer for it.
 *
 * Sources: leejet/stable-diffusion.cpp docs/*.md. Slots and defaults only encode what the
 * docs show; anything not documented keeps the app default.
 */
import {
  DEFAULT_SETUP,
  filesIn,
  mainModel,
  mainModelKey,
  matchSlotFile,
  type InstalledModels,
  type MachineFields,
  type ModelSetup,
  type SetupModelKey
} from './modelSetup.ts'

export type FamilyKind = 'image' | 'edit' | 'video'

export interface FamilySlot {
  key: SetupModelKey
  label: string
  required: boolean
  /** Ordered patterns tried against installed file names (first match wins) */
  match: RegExp[]
  hint?: string
}

export interface FamilyCaps {
  txt2img: boolean
  img2img: boolean
  inpaint: boolean
  /** Reference-image editing (-r) */
  refEdit: boolean
  maxRefs: number
  t2v: boolean
  i2v: boolean
  flf2v: boolean
  hires: boolean
  ipAdapter: boolean
  pulid: boolean
  controlNet: boolean
  photoMaker: boolean
  qwenLayers: boolean
  highNoise: boolean
  ref2va: boolean
  loras: boolean
}

/**
 * - packs:  one-click download available (verified files)
 * - manual: works; get the files yourself (docs list them)
 * - docs:   supported by sd.cpp but not runnable from the UI yet, or files are gated
 */
export type FamilySupport = 'packs' | 'manual' | 'docs'

export interface ModelFamily {
  id: string
  name: string
  kind: FamilyKind
  /** Card grouping in the catalog */
  group: string
  docs: string
  blurb: string
  loadMode: 'standard' | 'split'
  /** Main model slot label + file patterns */
  main: { label: string; match: RegExp[] }
  /** Infers this family from a diffusion file name */
  detect: RegExp
  /** Lower runs first during detection (specific variants before their base family) */
  priority: number
  slots: FamilySlot[]
  defaults: Partial<ModelSetup>
  caps: FamilyCaps
  packIds: string[]
  support: FamilySupport
  note?: string
  /** Performance settings the docs recommend (shown as a hint, applied on request) */
  machineHints?: Partial<MachineFields>
}

const NO_CAPS: FamilyCaps = {
  txt2img: false,
  img2img: false,
  inpaint: false,
  refEdit: false,
  maxRefs: 0,
  t2v: false,
  i2v: false,
  flf2v: false,
  hires: false,
  ipAdapter: false,
  pulid: false,
  controlNet: false,
  photoMaker: false,
  qwenLayers: false,
  highNoise: false,
  ref2va: false,
  loras: true
}

function caps(partial: Partial<FamilyCaps>): FamilyCaps {
  return { ...NO_CAPS, ...partial }
}

const IMAGE = caps({ txt2img: true, img2img: true, inpaint: true, hires: true })
const EDIT = (maxRefs: number): FamilyCaps =>
  caps({ txt2img: true, img2img: true, inpaint: true, hires: true, refEdit: true, maxRefs })

const DOCS = 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/'
const OFFLOAD: Partial<MachineFields> = { flashAttention: true, cpuOffload: true }

/* Common companion slots */
const slot = (
  key: SetupModelKey,
  label: string,
  match: RegExp[],
  required = true,
  hint?: string
): FamilySlot => ({ key, label, required, match, hint })

const CLIP_L = slot('clipModel', 'CLIP-L', [/clip_l/i])
const CLIP_G = slot('clipGModel', 'CLIP-G', [/clip_g/i])
const T5XXL = slot('t5xxlModel', 'T5-XXL text encoder', [/t5xxl/i, /t5/i])
const FLUX_AE = slot('vaeModel', 'FLUX autoencoder', [
  /^ae\.(safetensors|sft)$/i,
  /flux1?[_-]?(ae|vae)/i
])
const FLUX2_AE = slot('vaeModel', 'FLUX.2 autoencoder', [/flux2[_-]?(ae|vae)/i])
const QWEN_IMAGE_VAE = slot('vaeModel', 'Qwen Image VAE', [/qwen_image_vae/i])
const QWEN25_VL = slot('llmModel', 'Qwen2.5-VL 7B text encoder', [/qwen2\.?5[-_]?vl/i])
const QWEN3_VL_4B = slot('llmModel', 'Qwen3-VL 4B text encoder', [/qwen3[-_]?vl[-_]?4b/i])
const QWEN3_VL_8B = slot('llmModel', 'Qwen3-VL 8B text encoder', [/qwen3[-_]?vl[-_]?8b/i])
const QWEN3_4B = slot('llmModel', 'Qwen3 4B text encoder', [/qwen[-_]?3[-_]4b/i, /qwen3-4b/i])
const UMT5 = slot('t5xxlModel', 'UMT5-XXL text encoder', [/umt5/i])
const WAN_VAE = slot('vaeModel', 'Wan VAE', [/wan[_.-]?2\.?[12][_-]?vae/i, /wan.*vae/i])
const mmproj = (size: string): FamilySlot =>
  slot(
    'llmVisionModel',
    `Qwen3-VL ${size} vision projector`,
    [new RegExp(`mmproj.*qwen3[-_]?vl[-_]?${size}`, 'i'), /mmproj/i],
    true,
    'Needed to read reference images'
  )

export const MODEL_FAMILIES: ModelFamily[] = [
  /* ----------------------------- Stable Diffusion ----------------------------- */
  {
    id: 'sd15',
    name: 'SD 1.x / 2.x',
    kind: 'image',
    group: 'Stable Diffusion',
    docs: `${DOCS}sd.md`,
    blurb: 'The classic, lightweight checkpoints and their huge LoRA ecosystem.',
    loadMode: 'standard',
    main: {
      label: 'Checkpoint',
      match: [/v1-5|sd[-_]?1|sd15|sd[-_]?2|sd21|realistic|dreamshaper/i]
    },
    detect: /v1-5|sd[-_]?v?1[._-]?5|sd15|sd[-_]?2(\.|_)?1?|sd-turbo|realistic_vision|dreamshaper/i,
    priority: 50,
    slots: [
      slot(
        'vaeModel',
        'VAE',
        [/vae-ft-mse|sd15.*vae|vae/i],
        false,
        'Optional — baked-in VAE otherwise'
      )
    ],
    defaults: {
      cfgScale: 7,
      steps: 20,
      width: 512,
      height: 512,
      sampler: 'euler_a',
      scheduler: 'discrete'
    },
    caps: { ...IMAGE, ipAdapter: true, controlNet: true },
    packIds: ['sd15'],
    support: 'packs'
  },
  {
    id: 'sdxl',
    name: 'SDXL',
    kind: 'image',
    group: 'Stable Diffusion',
    docs: `${DOCS}sd.md`,
    blurb: 'Versatile 1024px checkpoints; IP-Adapter and PhotoMaker capable.',
    loadMode: 'standard',
    main: { label: 'Checkpoint', match: [/sdxl|sd_xl|xl/i] },
    detect: /sdxl|sd_xl|xl_base|xl-base|ssd-1b|segmind-vega|pony|illustrious/i,
    priority: 40,
    slots: [
      slot('vaeModel', 'VAE', [/sdxl.*vae|xl.*vae/i], false, 'Optional — fp16-fix VAE avoids NaNs')
    ],
    defaults: {
      cfgScale: 7,
      steps: 25,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      scheduler: 'discrete'
    },
    caps: { ...IMAGE, ipAdapter: true, photoMaker: true },
    packIds: ['sdxl', 'ssd-1b'],
    support: 'packs'
  },
  {
    id: 'sd-distilled',
    name: 'Distilled SD (SDXS)',
    kind: 'image',
    group: 'Stable Diffusion',
    docs: `${DOCS}distilled_sd.md`,
    blurb: 'One-step and tiny SD variants for instant drafts on any hardware.',
    loadMode: 'standard',
    main: { label: 'Checkpoint', match: [/sdxs|tiny-sd|bk-sdm/i] },
    detect: /sdxs|tiny[-_]sd|bk-sdm/i,
    priority: 10,
    slots: [],
    defaults: {
      cfgScale: 1,
      steps: 1,
      width: 512,
      height: 512,
      sampler: 'euler',
      scheduler: 'discrete'
    },
    caps: caps({ txt2img: true, img2img: true }),
    packIds: ['sdxs-512'],
    support: 'packs',
    note: 'SDXS needs exactly 1 step and CFG 1.'
  },
  {
    id: 'sd3',
    name: 'SD3 / SD3.5',
    kind: 'image',
    group: 'Stable Diffusion',
    docs: `${DOCS}sd3.md`,
    blurb: 'MMDiT with CLIP-L, CLIP-G and T5 text encoders.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/sd3/i] },
    detect: /sd3/i,
    priority: 30,
    slots: [CLIP_L, CLIP_G, T5XXL],
    defaults: { cfgScale: 4.5, steps: 28, width: 1024, height: 1024, sampler: 'euler' },
    caps: IMAGE,
    packIds: ['sd35'],
    support: 'packs',
    machineHints: { clipOnCpu: true }
  },
  /* ---------------------------------- FLUX ---------------------------------- */
  {
    id: 'flux1-dev',
    name: 'FLUX.1 Dev',
    kind: 'image',
    group: 'FLUX',
    docs: `${DOCS}flux.md`,
    blurb: 'High-quality stills; PuLID face identity supported.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/flux1?[-_.]?dev/i, /flux/i] },
    detect: /flux[-_.]?1[-_.]?dev|flux1-dev|flux-dev/i,
    priority: 30,
    slots: [CLIP_L, T5XXL, FLUX_AE],
    defaults: {
      cfgScale: 1,
      guidance: 3.5,
      steps: 28,
      width: 1024,
      height: 1024,
      sampler: 'euler'
    },
    caps: { ...IMAGE, pulid: true },
    packIds: ['flux1-dev'],
    support: 'packs',
    machineHints: { flashAttention: true, clipOnCpu: true }
  },
  {
    id: 'flux1-schnell',
    name: 'FLUX.1 Schnell',
    kind: 'image',
    group: 'FLUX',
    docs: `${DOCS}flux.md`,
    blurb: 'Four-step FLUX for fast drafts.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/schnell/i] },
    detect: /schnell/i,
    priority: 20,
    slots: [CLIP_L, T5XXL, FLUX_AE],
    defaults: { cfgScale: 1, guidance: 3.5, steps: 4, width: 1024, height: 1024, sampler: 'euler' },
    caps: { ...IMAGE, pulid: true },
    packIds: [],
    support: 'manual',
    machineHints: { flashAttention: true, clipOnCpu: true }
  },
  {
    id: 'flux-kontext',
    name: 'FLUX.1 Kontext',
    kind: 'edit',
    group: 'FLUX',
    docs: `${DOCS}kontext.md`,
    blurb: 'Instruction image editing with reference images.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/kontext/i] },
    detect: /kontext/i,
    priority: 10,
    slots: [CLIP_L, T5XXL, FLUX_AE],
    defaults: {
      cfgScale: 1,
      guidance: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler'
    },
    caps: EDIT(4),
    packIds: ['flux-kontext'],
    support: 'packs',
    machineHints: { ...OFFLOAD, clipOnCpu: true }
  },
  {
    id: 'flux2-dev',
    name: 'FLUX.2 Dev',
    kind: 'image',
    group: 'FLUX',
    docs: `${DOCS}flux2.md`,
    blurb: 'FLUX.2 with a Mistral text encoder and multi-reference edits.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/flux[-_.]?2[-_.]?dev/i] },
    detect: /flux[-_.]?2[-_.]?dev/i,
    priority: 20,
    slots: [slot('llmModel', 'Mistral Small 3.2 text encoder', [/mistral/i]), FLUX2_AE],
    defaults: {
      cfgScale: 1,
      guidance: 3.5,
      steps: 28,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      vaeFormat: 'flux2'
    },
    caps: EDIT(4),
    packIds: ['flux2'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'flux2-klein',
    name: 'FLUX.2 Klein',
    kind: 'image',
    group: 'FLUX',
    docs: `${DOCS}flux2.md`,
    blurb: 'Small, fast FLUX.2 for stills and edits.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/flux[-_.]?2.*klein/i] },
    detect: /flux[-_.]?2.*klein/i,
    priority: 15,
    slots: [slot('llmModel', 'Qwen3 text encoder', [/qwen[-_]?3/i]), FLUX2_AE],
    defaults: {
      cfgScale: 1,
      guidance: 3.5,
      steps: 4,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      vaeFormat: 'flux2'
    },
    caps: EDIT(4),
    packIds: [],
    support: 'manual',
    machineHints: OFFLOAD
  },
  {
    id: 'flux3-klein',
    name: 'FLUX.3 Klein',
    kind: 'edit',
    group: 'FLUX',
    docs: `${DOCS}flux3.md`,
    blurb: 'Distilled FLUX.3: fast stills and consistent edits with up to 10 references.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/flux[-_.]?3.*klein(?!.*base)/i, /flux[-_.]?3/i] },
    detect: /flux[-_.]?3.*klein/i,
    priority: 15,
    slots: [QWEN3_VL_4B, FLUX2_AE],
    defaults: {
      cfgScale: 1,
      steps: 16,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      vaeFormat: 'flux2'
    },
    caps: EDIT(10),
    packIds: ['flux3-klein'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'flux3-klein-base',
    name: 'FLUX.3 Klein Base',
    kind: 'image',
    group: 'FLUX',
    docs: `${DOCS}flux3.md`,
    blurb: 'Undistilled FLUX.3 Klein: more steps, higher CFG, more variety.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/flux[-_.]?3.*klein.*base/i] },
    detect: /flux[-_.]?3.*klein.*base/i,
    priority: 10,
    slots: [QWEN3_VL_4B, FLUX2_AE],
    defaults: {
      cfgScale: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      vaeFormat: 'flux2'
    },
    caps: IMAGE,
    packIds: [],
    support: 'manual',
    machineHints: OFFLOAD
  },
  /* ---------------------------------- Qwen ---------------------------------- */
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    kind: 'image',
    group: 'Qwen',
    docs: `${DOCS}qwen_image.md`,
    blurb: 'Strong text rendering and layouts. Layered output with Qwen Image Layered.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/qwen[-_]?image/i] },
    detect: /qwen[-_]?image(?![-_.]?2)(?!.*edit)/i,
    priority: 40,
    slots: [QWEN25_VL, QWEN_IMAGE_VAE],
    defaults: {
      cfgScale: 2.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      flowShift: 3
    },
    caps: { ...IMAGE, qwenLayers: true },
    packIds: ['qwen-image'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'qwen-image-21',
    name: 'Qwen Image 2.1',
    kind: 'edit',
    group: 'Qwen',
    docs: `${DOCS}qwen_image_2.1.md`,
    blurb: 'Newer Qwen Image with Qwen3-VL; edits with the vision projector.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/qwen[-_]?image[-_.]?2[._]?1/i] },
    detect: /qwen[-_]?image[-_.]?2[._]?1/i,
    priority: 20,
    slots: [
      QWEN3_VL_8B,
      slot('vaeModel', 'Qwen Image 2.1 VAE', [/qwen_image_2\.1_vae/i]),
      { ...mmproj('8b'), required: false, hint: 'Only for editing with reference images' }
    ],
    defaults: { cfgScale: 6, steps: 20, width: 1024, height: 1024, sampler: 'euler' },
    caps: EDIT(4),
    packIds: ['qwen-image-21'],
    support: 'packs',
    note: 'Width and height must be multiples of 32. Turbo weights: CFG 1, 8 steps, sigmas qwen-image-2.1-turbo.',
    machineHints: OFFLOAD
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen Image Edit',
    kind: 'edit',
    group: 'Qwen',
    docs: `${DOCS}qwen_image_edit.md`,
    blurb: 'Instruction edits and multi-image composition (Edit, 2509, 2511).',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/qwen.*edit/i] },
    detect: /qwen.*edit/i,
    priority: 10,
    slots: [QWEN25_VL, QWEN_IMAGE_VAE],
    defaults: {
      cfgScale: 2.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      flowShift: 3
    },
    caps: EDIT(3),
    packIds: ['qwen-image-edit', 'qwen-image-edit-2511'],
    support: 'packs',
    note: '2511 weights want “Zero cond T” on (Advanced).',
    machineHints: OFFLOAD
  },
  /* ------------------------------ Other image ------------------------------ */
  {
    id: 'z-image',
    name: 'Z-Image Turbo',
    kind: 'image',
    group: 'Z-Image',
    docs: `${DOCS}z_image.md`,
    blurb: 'Fast, low-VRAM photoreal stills in 8 steps.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/z[-_]?image/i] },
    detect: /z[-_]?image(?!.*l2p)/i,
    priority: 30,
    slots: [QWEN3_4B, FLUX_AE],
    defaults: { cfgScale: 1, steps: 8, width: 512, height: 1024, sampler: 'euler' },
    caps: IMAGE,
    packIds: ['z-image-turbo'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'z-image-l2p',
    name: 'Z-Image L2P',
    kind: 'image',
    group: 'Z-Image',
    docs: `${DOCS}z_image_l2p.md`,
    blurb: 'Pixel-space Z-Image: no VAE, crisp detail.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/l2p|model-1k-merge/i] },
    detect: /l2p|model-1k-merge/i,
    priority: 10,
    slots: [QWEN3_4B],
    defaults: {
      cfgScale: 2,
      steps: 30,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      quantizationType: 'bf16'
    },
    caps: caps({ txt2img: true }),
    packIds: ['z-image-l2p'],
    support: 'packs',
    note: 'No VAE. Loads the transformer as BF16 to save memory.'
  },
  {
    id: 'chroma',
    name: 'Chroma',
    kind: 'image',
    group: 'Chroma',
    docs: `${DOCS}chroma.md`,
    blurb: 'Open FLUX-derived model with a T5 encoder.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/chroma/i] },
    detect: /chroma(?!.*radiance)/i,
    priority: 30,
    slots: [T5XXL, FLUX_AE],
    defaults: {
      cfgScale: 4,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      chromaDisableDitMask: true
    },
    caps: IMAGE,
    packIds: ['chroma'],
    support: 'packs',
    machineHints: { ...OFFLOAD, clipOnCpu: true }
  },
  {
    id: 'chroma-radiance',
    name: 'Chroma1-Radiance',
    kind: 'image',
    group: 'Chroma',
    docs: `${DOCS}chroma_radiance.md`,
    blurb: 'Pixel-space Chroma — no VAE needed.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/radiance/i] },
    detect: /radiance/i,
    priority: 10,
    slots: [T5XXL],
    defaults: { cfgScale: 4, steps: 20, width: 1024, height: 1024, sampler: 'euler' },
    caps: caps({ txt2img: true, img2img: true }),
    packIds: ['chroma-radiance'],
    support: 'packs'
  },
  {
    id: 'krea2',
    name: 'Krea2',
    kind: 'edit',
    group: 'Other image',
    docs: `${DOCS}krea2.md`,
    blurb: 'Aesthetic-focused model with Qwen3-VL; edit LoRAs supported.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/krea[-_]?2/i] },
    detect: /krea[-_]?2/i,
    priority: 20,
    slots: [QWEN3_VL_4B, WAN_VAE],
    defaults: { cfgScale: 3.5, steps: 20, width: 1024, height: 1024, sampler: 'euler' },
    caps: EDIT(1),
    packIds: ['krea2'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'lens',
    name: 'Lens',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}lens.md`,
    blurb: 'GPT-OSS text encoder with the FLUX.2 VAE. Turbo variant: CFG 1, 4 steps.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/lens/i] },
    detect: /(^|[^a-z])lens/i,
    priority: 30,
    slots: [slot('llmModel', 'GPT-OSS text encoder', [/gpt[-_]?oss/i]), FLUX2_AE],
    defaults: {
      cfgScale: 5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      vaeFormat: 'flux2'
    },
    caps: IMAGE,
    packIds: ['lens'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'ideogram4',
    name: 'Ideogram4',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}ideogram4.md`,
    blurb: 'Typography-strong model with a separate unconditional branch.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/ideogram4(?!.*uncond)/i] },
    detect: /ideogram/i,
    priority: 20,
    slots: [
      slot('uncondDiffusionModel', 'Unconditional model', [/uncond/i]),
      QWEN3_VL_8B,
      FLUX2_AE
    ],
    defaults: {
      cfgScale: 3.5,
      steps: 20,
      width: 1024,
      height: 1024,
      sampler: 'euler',
      vaeFormat: 'flux2'
    },
    caps: IMAGE,
    packIds: ['ideogram4'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'anima',
    name: 'Anima',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}anima.md`,
    blurb: 'Anime-style model; reference edits with the Anima edit LoRA.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/anima/i] },
    detect: /(^|[^a-z])anima/i,
    priority: 20,
    slots: [slot('llmModel', 'Qwen3 0.6B text encoder', [/qwen3[-_]?0\.6b/i]), QWEN_IMAGE_VAE],
    defaults: { cfgScale: 6, steps: 20, width: 1024, height: 1024, sampler: 'euler' },
    caps: EDIT(1),
    packIds: ['anima'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'minit2i',
    name: 'MiniT2I',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}minit2i.md`,
    blurb: 'Tiny text-to-image model with Flan-T5.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/minit2i/i] },
    detect: /minit2i/i,
    priority: 20,
    slots: [slot('t5xxlModel', 'Flan-T5 text encoder', [/flan[-_]?t5/i, /t5/i])],
    defaults: { cfgScale: 6, steps: 100, width: 512, height: 512, sampler: 'euler' },
    caps: caps({ txt2img: true }),
    packIds: ['minit2i'],
    support: 'packs'
  },
  {
    id: 'moss-image',
    name: 'MOSS-Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}moss_image.md`,
    blurb: 'Qwen3.5-based model (Base / SFT) with the FLUX.2 VAE.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/moss/i] },
    detect: /moss/i,
    priority: 20,
    slots: [
      slot('llmModel', 'Qwen3.5 9B text encoder', [/qwen3\.?5[-_]?9b/i]),
      FLUX2_AE,
      slot('tokenizerModel', 'Qwen3.5 tokenizer', [/qwen3\.?5/i, /moss/i, /tokenizer/i])
    ],
    defaults: { cfgScale: 3, steps: 20, width: 1024, height: 1024 },
    caps: caps({ txt2img: true, img2img: true, hires: true }),
    packIds: ['moss-image-sft'],
    support: 'packs',
    note: 'Width and height must be multiples of 16.',
    machineHints: OFFLOAD
  },
  {
    id: 'longcat',
    name: 'LongCat Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}longcat_image.md`,
    blurb: 'Bilingual text rendering with Qwen2.5-VL.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/longcat/i] },
    detect: /longcat(?!.*edit)/i,
    priority: 20,
    slots: [QWEN25_VL, FLUX_AE],
    defaults: { cfgScale: 5, steps: 20, width: 1024, height: 1024, sampler: 'euler', flowShift: 3 },
    caps: IMAGE,
    packIds: ['longcat-image'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'longcat-edit',
    name: 'LongCat Image Edit',
    kind: 'edit',
    group: 'Other image',
    docs: `${DOCS}longcat_image.md`,
    blurb: 'Instruction editing variant of LongCat.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/longcat.*edit/i] },
    detect: /longcat.*edit/i,
    priority: 10,
    slots: [
      QWEN25_VL,
      FLUX_AE,
      slot(
        'llmVisionModel',
        'Qwen2.5-VL vision projector',
        [/mmproj/i],
        false,
        'Needed with a GGUF text encoder'
      )
    ],
    defaults: { cfgScale: 5, steps: 20, width: 1024, height: 1024, sampler: 'euler', flowShift: 3 },
    caps: EDIT(1),
    packIds: [],
    support: 'manual',
    machineHints: OFFLOAD
  },
  {
    id: 'ovis-image',
    name: 'Ovis-Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}ovis_image.md`,
    blurb: '7B model tuned for text-in-image with the Ovis 2.5 encoder.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/ovis_image|ovis-image/i] },
    detect: /ovis[-_]image/i,
    priority: 20,
    slots: [slot('llmModel', 'Ovis 2.5 text encoder', [/ovis_2\.5|ovis-2\.5/i]), FLUX_AE],
    defaults: { cfgScale: 5, steps: 20, width: 1024, height: 1024 },
    caps: IMAGE,
    packIds: ['ovis-image'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'ernie-image-turbo',
    name: 'ERNIE-Image Turbo',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}ernie_image.md`,
    blurb: '8-step model that runs on 4 GB GPUs with offloading.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/ernie.*turbo/i] },
    detect: /ernie.*turbo/i,
    priority: 10,
    slots: [slot('llmModel', 'Ministral 3B text encoder', [/ministral/i]), FLUX2_AE],
    defaults: { cfgScale: 1, steps: 8, width: 1024, height: 1024 },
    caps: IMAGE,
    packIds: ['ernie-image-turbo'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'ernie-image',
    name: 'ERNIE-Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}ernie_image.md`,
    blurb: 'Base ERNIE-Image (CFG 5).',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/ernie/i] },
    detect: /ernie/i,
    priority: 20,
    slots: [slot('llmModel', 'Ministral 3B text encoder', [/ministral/i]), FLUX2_AE],
    defaults: { cfgScale: 5, steps: 20, width: 1024, height: 1024 },
    caps: IMAGE,
    packIds: [],
    support: 'manual',
    machineHints: OFFLOAD
  },
  {
    id: 'boogu-image',
    name: 'Boogu Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}boogu_image.md`,
    blurb: 'Qwen3-VL 8B based text-to-image (base and turbo).',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/boogu(?!.*edit)/i] },
    detect: /boogu(?!.*edit)/i,
    priority: 20,
    slots: [QWEN3_VL_8B, slot('vaeModel', 'FLUX autoencoder', [/flux1_vae/i, /^ae\./i])],
    defaults: { width: 1024, height: 1024 },
    caps: IMAGE,
    packIds: ['boogu-image'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'boogu-image-edit',
    name: 'Boogu Image Edit',
    kind: 'edit',
    group: 'Other image',
    docs: `${DOCS}boogu_image.md`,
    blurb: 'Instruction editing with reference images.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/boogu.*edit/i] },
    detect: /boogu.*edit/i,
    priority: 10,
    slots: [
      QWEN3_VL_8B,
      slot('vaeModel', 'FLUX autoencoder', [/flux1_vae/i, /^ae\./i]),
      mmproj('8b')
    ],
    defaults: { width: 1024, height: 1024 },
    caps: EDIT(4),
    packIds: ['boogu-image-edit'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'mage-flow',
    name: 'Mage-Flow',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}mage_flow.md`,
    blurb: 'Turbo text-to-image in 4 steps (Base: 30 steps).',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/mage[-_]?flow(?!.*edit)/i] },
    detect: /mage[-_]?flow(?!.*edit)/i,
    priority: 20,
    slots: [QWEN3_VL_4B, slot('vaeModel', 'Mage-Flow VAE', [/mage[-_]?(flow_)?vae/i])],
    defaults: { cfgScale: 1, steps: 4, width: 1024, height: 1024 },
    caps: IMAGE,
    packIds: ['mage-flow'],
    support: 'packs',
    note: 'Base weights: 30 steps.',
    machineHints: OFFLOAD
  },
  {
    id: 'mage-flow-edit',
    name: 'Mage-Flow Edit',
    kind: 'edit',
    group: 'Other image',
    docs: `${DOCS}mage_flow.md#image-editing`,
    blurb: 'Edits from one or more reference images.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/mage[-_]?flow.*edit/i] },
    detect: /mage[-_]?flow.*edit/i,
    priority: 10,
    slots: [
      QWEN3_VL_4B,
      slot('vaeModel', 'Mage-Flow VAE', [/mage[-_]?(flow_)?vae/i]),
      mmproj('4b')
    ],
    defaults: { cfgScale: 4, steps: 4, width: 1024, height: 1024, sampler: 'euler' },
    caps: EDIT(4),
    packIds: ['mage-flow-edit'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'hidream-o1',
    name: 'HiDream-O1-Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}hidream_o1_image.md`,
    blurb: 'Single-file checkpoint; Dev variant runs at CFG 1.',
    loadMode: 'standard',
    main: { label: 'Checkpoint', match: [/hidream/i] },
    detect: /hidream/i,
    priority: 20,
    slots: [],
    defaults: { cfgScale: 1, steps: 20, width: 1024, height: 1024 },
    caps: caps({ txt2img: true }),
    packIds: ['hidream-o1-dev'],
    support: 'packs'
  },
  {
    id: 'llada-image',
    name: 'LLaDA-Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}llada_image.md`,
    blurb: 'Diffusion-LLM image model; 50 steps at CFG 5.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/llada-image-(f16|q\d)/i] },
    detect: /llada/i,
    priority: 20,
    slots: [
      slot('llmModel', 'LLaDA text encoder', [/llada-image-text_encoder/i]),
      slot('vaeModel', 'LLaDA VAE', [/llada.*vae/i]),
      slot('embeddingsConnectorsModel', 'LLaDA connectors', [
        /llada-image-connectors(?!-edit)/i,
        /llada.*connectors/i
      ]),
      slot('tokenizerModel', 'LLaDA tokenizer', [/llada/i, /tokenizer/i])
    ],
    defaults: { cfgScale: 5, steps: 50, width: 1024, height: 1024, scheduler: 'llada_image' },
    caps: caps({ txt2img: true, refEdit: true, maxRefs: 1 }),
    packIds: ['llada-image'],
    support: 'packs',
    note: 'For editing, use the edit connectors file (llada-image-connectors-edit) and sizes divisible by 32.'
  },
  {
    id: 'ming-image',
    name: 'Ming-Image Design',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}ming_image.md`,
    blurb: 'Design-oriented model with transparent (RGBA) output.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/ming_image.*design|ming-image/i] },
    detect: /ming[-_]image/i,
    priority: 20,
    slots: [
      slot('llmModel', 'Ling-mini 2.0 text encoder', [/ling[-_]?mini/i]),
      slot('vaeModel', 'Ming-Image VAE', [/ming_image_vae/i]),
      slot('tokenizerModel', 'Ling tokenizer', [/ling/i, /ming/i, /tokenizer/i])
    ],
    defaults: { cfgScale: 1, steps: 12, width: 1024, height: 1024, sampler: 'euler' },
    caps: caps({ txt2img: true }),
    packIds: ['ming-image'],
    support: 'packs',
    note: 'Save as PNG to keep the alpha channel.'
  },
  {
    id: 'iris-3b',
    name: 'Iris-3B',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}iris.md`,
    blurb: 'Compact pixel-space 3B model — no VAE.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/iris/i] },
    detect: /iris/i,
    priority: 20,
    slots: [QWEN3_VL_4B],
    defaults: { cfgScale: 3, steps: 20, width: 1024, height: 1024 },
    caps: caps({ txt2img: true }),
    packIds: ['iris-3b'],
    support: 'packs',
    note: 'Prompts are limited to about 300 tokens.'
  },
  {
    id: 'pid',
    name: 'PiD (PixelDiT)',
    kind: 'edit',
    group: 'Other image',
    docs: `${DOCS}pid.md`,
    blurb: 'Pixel-space detailer: turns a small image into a 2K–4K one in 4 steps.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/(^|[_-])pid|pixeldit/i] },
    detect: /(^|[_-])pid[_-]|pixeldit/i,
    priority: 10,
    slots: [
      slot('llmModel', 'Gemma 2 2B text encoder', [/gemma[-_]?2[-_]?2b/i]),
      slot('tokenizerModel', 'Gemma 2 tokenizer', [/gemma/i, /tokenizer/i]),
      slot('vaeModel', 'Backbone VAE', [/^ae\./i, /flux2/i, /vae/i])
    ],
    defaults: { cfgScale: 1, steps: 4, width: 2048, height: 2048, vaeFormat: 'flux' },
    caps: caps({ refEdit: true, maxRefs: 1 }),
    packIds: [],
    support: 'manual',
    note: 'Needs a reference image. The Gemma tokenizer is gated on Hugging Face (accept the license first).'
  },
  {
    id: 'sefi-image',
    name: 'SeFi-Image',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}sefi_image.md`,
    blurb: '1B–5B family; turbo runs in 4 steps.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/sefi/i] },
    detect: /sefi/i,
    priority: 20,
    slots: [slot('llmModel', 'Qwen3-VL text encoder', [/qwen3[-_]?vl/i]), FLUX2_AE],
    defaults: { cfgScale: 4, steps: 50, width: 1024, height: 1024 },
    caps: caps({ txt2img: true }),
    packIds: [],
    support: 'docs',
    note: 'Weights are gated and must be converted; see the docs.'
  },
  {
    id: 'pixart',
    name: 'PixArt-Σ / α',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}pixart.md`,
    blurb: 'PixArt transformers with T5-XXL.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/pixart/i] },
    detect: /pixart/i,
    priority: 20,
    slots: [T5XXL, slot('vaeModel', 'PixArt VAE', [/pixart.*vae/i, /vae/i])],
    defaults: { cfgScale: 4.5, steps: 20, width: 1024, height: 1024 },
    caps: caps({ txt2img: true }),
    packIds: [],
    support: 'docs',
    note: 'Needs files exported from the diffusers repo and model-args; see the docs.'
  },
  {
    id: 'sensenova-u1',
    name: 'SenseNova U1.5',
    kind: 'image',
    group: 'Other image',
    docs: `${DOCS}sensenova_u1.md`,
    blurb: '8B MoT model trained at 2048×2048.',
    loadMode: 'standard',
    main: { label: 'Model', match: [/sensenova/i] },
    detect: /sensenova/i,
    priority: 20,
    slots: [],
    defaults: { cfgScale: 4, steps: 50, width: 2048, height: 2048, flowShift: 3 },
    caps: caps({ txt2img: true }),
    packIds: [],
    support: 'docs',
    note: 'Loads a whole model folder (--model <dir>), which this UI does not support yet.'
  },
  /* ---------------------------------- Video ---------------------------------- */
  {
    id: 'wan21',
    name: 'Wan2.1',
    kind: 'video',
    group: 'Wan',
    docs: `${DOCS}wan.md`,
    blurb: 'Text and image to video; VACE control.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/wan2?\.?1/i, /wan/i] },
    detect: /wan[_.-]?2[._]?1/i,
    priority: 20,
    slots: [
      UMT5,
      WAN_VAE,
      slot('clipVisionModel', 'CLIP Vision', [/clip_vision/i], false, 'For image-to-video')
    ],
    defaults: {
      videoMode: true,
      cfgScale: 6,
      steps: 20,
      width: 832,
      height: 480,
      sampler: 'euler',
      flowShift: 3,
      videoFrames: 33,
      videoFps: 16
    },
    caps: caps({ t2v: true, i2v: true, flf2v: true }),
    packIds: ['wan21'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'wan22',
    name: 'Wan2.2 A14B',
    kind: 'video',
    group: 'Wan',
    docs: `${DOCS}wan.md`,
    blurb: 'Mixture-of-experts video: high-noise + low-noise models.',
    loadMode: 'split',
    main: { label: 'Low-noise model', match: [/low[-_]?noise/i, /wan2?\.?2/i] },
    detect: /wan[_.-]?2[._]?2/i,
    priority: 15,
    slots: [
      slot('highNoiseDiffusionModel', 'High-noise model', [/high[-_]?noise/i]),
      UMT5,
      WAN_VAE
    ],
    defaults: {
      videoMode: true,
      cfgScale: 3.5,
      steps: 10,
      width: 832,
      height: 480,
      sampler: 'euler',
      flowShift: 3,
      videoFrames: 33,
      videoFps: 16
    },
    caps: caps({ t2v: true, i2v: true, flf2v: true, highNoise: true }),
    packIds: ['wan22'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'ltx23',
    name: 'LTX-2.3',
    kind: 'video',
    group: 'LTX',
    docs: `${DOCS}ltx2.md`,
    blurb: 'Video with sound; spatial latent upscaler for hi-res.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/ltx[-_.]?2\.3/i] },
    detect: /ltx[-_.]?2[._]?3/i,
    priority: 20,
    slots: [
      slot('llmModel', 'Gemma 3 12B text encoder', [/gemma[-_]?3/i]),
      slot('embeddingsConnectorsModel', 'Embeddings connectors', [/embeddings_connectors/i]),
      slot('vaeModel', 'LTX video VAE', [/ltx.*video_vae|video_vae/i]),
      slot(
        'audioVaeModel',
        'LTX audio VAE',
        [/ltx.*audio_vae|audio_vae/i],
        false,
        'Adds a soundtrack'
      )
    ],
    defaults: {
      videoMode: true,
      cfgScale: 6,
      steps: 20,
      width: 1280,
      height: 720,
      sampler: 'euler',
      scheduler: 'ltx2',
      videoFrames: 33,
      videoFps: 24
    },
    caps: caps({ t2v: true, i2v: true, flf2v: true, hires: true }),
    packIds: ['ltx23'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'ltx25',
    name: 'LTX-2.5',
    kind: 'video',
    group: 'LTX',
    docs: `${DOCS}ltx2.md`,
    blurb: 'Gemma 4 encoder, 121-frame clips with audio.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/ltx[-_.]?2\.5/i] },
    detect: /ltx[-_.]?2[._]?5/i,
    priority: 20,
    slots: [
      slot('llmModel', 'Gemma 4 12B (LTX) text encoder', [/gemma4.*ltx/i, /gemma[-_]?4/i]),
      slot('vaeModel', 'LTX-2.5 video VAE (conv)', [/ltx-2\.5-video-vae-conv/i, /video-vae-conv/i]),
      slot('audioVaeModel', 'LTX-2.5 audio VAE', [/ltx-2\.5-audio-vae|audio-vae/i], false)
    ],
    defaults: {
      videoMode: true,
      cfgScale: 3,
      steps: 20,
      width: 1280,
      height: 720,
      sampler: 'euler',
      videoFrames: 121,
      videoFps: 24
    },
    caps: caps({ t2v: true, i2v: true, hires: true }),
    packIds: [],
    support: 'manual',
    note: 'Use the conv video VAE. Lightricks files need a Hugging Face login.',
    machineHints: OFFLOAD
  },
  {
    id: 'hunyuan-video-15',
    name: 'HunyuanVideo 1.5',
    kind: 'video',
    group: 'Other video',
    docs: `${DOCS}hunyuan_video.md`,
    blurb: '720p text-to-video with Qwen2.5-VL and ByT5 encoders.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/hunyuanvideo1\.5/i, /hunyuan/i] },
    detect: /hunyuan/i,
    priority: 20,
    slots: [
      QWEN25_VL,
      slot('t5xxlModel', 'ByT5 GlyphXL text encoder', [/byt5/i]),
      slot('vaeModel', 'HunyuanVideo 1.5 VAE', [/hunyuanvideo15_vae/i, /hunyuan.*vae/i])
    ],
    defaults: {
      videoMode: true,
      cfgScale: 6,
      steps: 20,
      width: 1280,
      height: 720,
      sampler: 'euler',
      videoFrames: 33,
      videoFps: 24
    },
    caps: caps({ t2v: true, i2v: true }),
    packIds: ['hunyuan-video-15'],
    support: 'packs',
    machineHints: { ...OFFLOAD, vaeTiling: true }
  },
  {
    id: 'minimax-h3',
    name: 'MiniMax-H3',
    kind: 'video',
    group: 'Other video',
    docs: `${DOCS}minimax_h3.md`,
    blurb: 'Reference-to-video with audio (Ref2VA): images, clips and voices as references.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/minimax/i] },
    detect: /minimax/i,
    priority: 20,
    slots: [
      slot('llmModel', 'Qwen3-VL 32B (MiniMax) text encoder', [/qwen3vl_32b|minimax/i]),
      slot('vaeModel', 'MiniMax-H3 video VAE', [/minimax_h3_video_vae|video_vae/i]),
      slot('audioVaeModel', 'MiniMax-H3 audio VAE', [/minimax_h3_audio_vae|audio_vae/i], false)
    ],
    defaults: {
      videoMode: true,
      cfgScale: 1,
      steps: 20,
      width: 864,
      height: 480,
      rngType: 'cpu',
      videoFrames: 56,
      videoFps: 24
    },
    caps: caps({ t2v: true, refEdit: true, maxRefs: 4, ref2va: true }),
    packIds: [],
    support: 'manual',
    note: 'Frames snap to 17k+5; output is 24 fps.',
    machineHints: OFFLOAD
  },
  {
    id: 'lingbot-video',
    name: 'LingBot-Video',
    kind: 'video',
    group: 'Other video',
    docs: `${DOCS}lingbot_video.md`,
    blurb: 'Small 1.3B video model with Qwen3-VL.',
    loadMode: 'split',
    main: { label: 'Diffusion model', match: [/lingbot/i] },
    detect: /lingbot/i,
    priority: 20,
    slots: [QWEN3_VL_4B, WAN_VAE],
    defaults: {
      videoMode: true,
      cfgScale: 3,
      steps: 20,
      width: 832,
      height: 480,
      sampler: 'euler',
      flowShift: 3,
      videoFrames: 33,
      videoFps: 16
    },
    caps: caps({ t2v: true, i2v: true }),
    packIds: ['lingbot-video'],
    support: 'packs',
    machineHints: OFFLOAD
  },
  {
    id: 'animatediff',
    name: 'AnimateDiff (SD 1.5)',
    kind: 'video',
    group: 'Other video',
    docs: `${DOCS}animatediff.md`,
    blurb: 'Animate any SD 1.5 checkpoint with a motion module.',
    loadMode: 'standard',
    main: { label: 'SD 1.5 checkpoint', match: [/realistic|v1-5|sd15|dreamshaper/i] },
    detect: /mm_sd15|animatediff/i,
    priority: 5,
    slots: [slot('motionModule', 'Motion module', [/mm_sd15_v3/i, /mm_sd|motion|animatediff/i])],
    defaults: {
      videoMode: true,
      cfgScale: 8,
      steps: 20,
      width: 512,
      height: 512,
      sampler: 'euler',
      flowShift: 0,
      img2imgStrength: 0.75,
      videoFrames: 16,
      videoFps: 8
    },
    caps: caps({ t2v: true, i2v: true }),
    packIds: ['animatediff-v3'],
    support: 'packs'
  }
]

const BY_ID = new Map(MODEL_FAMILIES.map((family) => [family.id, family]))
const DETECT_ORDER = [...MODEL_FAMILIES].sort((a, b) => a.priority - b.priority)

export function familyById(id: string | undefined | null): ModelFamily | undefined {
  return id ? BY_ID.get(id) : undefined
}

/** The family a hub pack installs (packs are listed on their family). */
export function familyForPack(packId: string): ModelFamily | undefined {
  return MODEL_FAMILIES.find((family) => family.packIds.includes(packId))
}

export function familiesOfKind(...kinds: FamilyKind[]): ModelFamily[] {
  return MODEL_FAMILIES.filter((family) => kinds.includes(family.kind))
}

/** Best-guess family for a main model file name (most specific family first). */
export function inferFamily(filename: string): ModelFamily | undefined {
  const name = filename.split(/[\\/]/).pop() || filename
  if (!name) return undefined
  return DETECT_ORDER.find((family) => family.detect.test(name))
}

/**
 * The family a setup is using: none until a model file is chosen (a remembered family id
 * alone says nothing), then the recorded family or the one its file name suggests.
 */
export function setupFamily(setup: ModelSetup): ModelFamily | undefined {
  const file = mainModel(setup)
  if (!file) return undefined
  return familyById(setup.modelFamily) || inferFamily(file)
}

/** Files of the main-model list that look like this family (matching first, then the rest). */
export function familyMainFiles(
  family: ModelFamily | undefined,
  installed: InstalledModels
): { matching: string[]; other: string[] } {
  const all = installed.diffusion || []
  if (!family) return { matching: [], other: all }
  const matching = all.filter((file) => inferFamily(file)?.id === family.id)
  return { matching, other: all.filter((file) => !matching.includes(file)) }
}

/** Every model key a family can use (main + slots), for clearing stale files on switch. */
const FAMILY_MODEL_KEYS: Array<keyof ModelSetup> = [
  'standardModel',
  'diffusionModel',
  'highNoiseDiffusionModel',
  'uncondDiffusionModel',
  't5xxlModel',
  'llmModel',
  'llmVisionModel',
  'clipModel',
  'clipGModel',
  'clipVisionModel',
  'embeddingsConnectorsModel',
  'vaeModel',
  'audioVaeModel',
  'tokenizerModel',
  'motionModule',
  'vaeFormat'
]

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Keys a family's documented defaults recommend (files and load mode are structural, not advice). */
function recommendedEntries(family: ModelFamily): Array<[keyof ModelSetup, unknown]> {
  return (Object.entries(family.defaults) as Array<[keyof ModelSetup, unknown]>).filter(
    ([key]) => !FAMILY_MODEL_KEYS.includes(key) && key !== 'loadMode' && key !== 'videoMode'
  )
}

/** Recommended values that differ from the setup ("Recommended for FLUX.3 Klein: 4 steps…"). */
export function familyRecommendations(
  setup: ModelSetup,
  family: ModelFamily
): Array<{ key: keyof ModelSetup; value: unknown }> {
  return recommendedEntries(family)
    .filter(([key, value]) => !sameValue(setup[key], value))
    .map(([key, value]) => ({ key, value }))
}

export function applyRecommendations(setup: ModelSetup, family: ModelFamily): ModelSetup {
  const next = { ...setup } as Record<string, unknown>
  for (const [key, value] of recommendedEntries(family)) next[key] = value
  return next as unknown as ModelSetup
}

/**
 * Switch a setup to a family: auto-match every companion file from installed files and take
 * its recommended settings only where the user has not tuned them (a value still equal to
 * the app default or to the previous family's recommendation). LoRAs and features are kept;
 * companions the new family does not use are cleared so they are not sent.
 */
export function applyFamily(
  setup: ModelSetup,
  family: ModelFamily,
  installed: InstalledModels,
  options: { mainFile?: string } = {}
): ModelSetup {
  const next: ModelSetup = { ...setup }
  const wasSameFamily = setup.modelFamily === family.id
  const previous = familyById(setup.modelFamily)
  for (const key of FAMILY_MODEL_KEYS) {
    ;(next as unknown as Record<string, unknown>)[key] = DEFAULT_SETUP[key]
  }
  const target = next as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(family.defaults) as Array<
    [keyof ModelSetup, unknown]
  >) {
    const current = setup[key]
    const untouched =
      sameValue(current, DEFAULT_SETUP[key]) ||
      (previous !== undefined && sameValue(current, previous.defaults[key]))
    if (FAMILY_MODEL_KEYS.includes(key) || untouched) target[key] = value
  }
  next.modelFamily = family.id
  next.loadMode = family.loadMode
  next.videoMode = family.kind === 'video'

  const mainKey = mainModelKey(next)
  const mainFiles = installed.diffusion || []
  const currentMain = wasSameFamily ? mainModel(setup) : ''
  next[mainKey] =
    options.mainFile && mainFiles.includes(options.mainFile)
      ? options.mainFile
      : currentMain && mainFiles.includes(currentMain)
        ? currentMain
        : familyMainFiles(family, installed).matching[0] ||
          matchSlotFile(mainFiles, family.main.match)

  for (const s of family.slots) {
    const current = wasSameFamily ? (setup[s.key] as string) : ''
    next[s.key] = matchSlotFile(filesIn(installed, s.key), s.match, current)
  }
  if (!wasSameFamily) {
    // Sampling defaults belong to the family; keep user LoRAs/features.
    next.loras = setup.loras.filter((l) => l.path)
  }
  return next
}

export interface SetupStatus {
  family?: ModelFamily
  ready: boolean
  /** Required files not chosen (or not installed) */
  missing: Array<{ key: SetupModelKey; label: string }>
  /** Chosen files that are no longer on disk */
  stale: Array<{ key: SetupModelKey; file: string }>
}

export function setupStatus(setup: ModelSetup, installed: InstalledModels): SetupStatus {
  const family = setupFamily(setup)
  const missing: SetupStatus['missing'] = []
  const stale: SetupStatus['stale'] = []
  const mainKey = mainModelKey(setup)
  const main = mainModel(setup)
  if (!main) missing.push({ key: mainKey, label: family?.main.label || 'Model' })
  else if (!(installed.diffusion || []).includes(main)) stale.push({ key: mainKey, file: main })
  for (const s of family?.slots || []) {
    const value = setup[s.key] as string
    if (!value) {
      if (s.required) missing.push({ key: s.key, label: s.label })
      continue
    }
    if (!filesIn(installed, s.key).includes(value)) stale.push({ key: s.key, file: value })
  }
  return { family, ready: missing.length === 0 && stale.length === 0, missing, stale }
}

/**
 * How usable a family is with what is installed:
 * ready = a model + every required companion; partial = model but missing parts; none = no model.
 */
export function familyReadiness(
  family: ModelFamily,
  installed: InstalledModels
): 'ready' | 'partial' | 'none' {
  if (!familyMainFiles(family, installed).matching.length) return 'none'
  const trial = applyFamily({ ...DEFAULT_SETUP }, family, installed)
  return setupStatus(trial, installed).ready ? 'ready' : 'partial'
}

/** One-line summary for cards: "FLUX.3 Klein · flux3-image-klein-Q4_K · 16 steps". */
export function setupSummary(setup: ModelSetup): string {
  const family = familyById(setup.modelFamily)
  const main = mainModel(setup)
  const file = main
    ? (main.split(/[\\/]/).pop() || main).replace(/\.(gguf|safetensors|sft|ckpt)$/i, '')
    : 'No model'
  return [family?.name, file, `${setup.steps} steps`].filter(Boolean).join(' · ')
}
