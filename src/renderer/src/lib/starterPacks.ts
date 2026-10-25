export interface HubFile {
  label: string
  category: string
  filename: string
  url: string
  required?: boolean
  /** Hosted in a gated Hugging Face repo: needs an access token + accepted license */
  gated?: boolean
}

export type HubPackKind = 'image' | 'edit' | 'video' | 'other'

export interface HubModel {
  id: string
  name: string
  description: string
  presetId: string
  docsUrl: string
  files: HubFile[]
  /** Browse category for Model Hub filters */
  kind?: HubPackKind
  tags?: string[]
  /** Short card subtitle */
  blurb?: string
  sizeGb?: number
  minVramGb?: number
  featured?: boolean
}

export interface HubPackMeta {
  kind: HubPackKind
  tags?: string[]
  blurb: string
  sizeGb?: number
  minVramGb?: number
  featured?: boolean
}

/** Card/filter metadata layered onto hub packs (keeps download defs lean). */
export const HUB_PACK_META: Record<string, HubPackMeta> = {
  'qwen-image-21': {
    kind: 'edit',
    tags: ['qwen', 'edit', 'text'],
    blurb: 'Qwen Image 2.1 — stills and reference edits.',
    sizeGb: 14,
    minVramGb: 12
  },
  'iris-3b': {
    kind: 'image',
    tags: ['small', 'pixel-space'],
    blurb: 'Compact 3B pixel-space model.',
    sizeGb: 9,
    minVramGb: 8
  },
  'chroma-radiance': {
    kind: 'image',
    tags: ['chroma', 'pixel-space'],
    blurb: 'Chroma in pixel space, no VAE.',
    sizeGb: 20,
    minVramGb: 12
  },
  'ovis-image': {
    kind: 'image',
    tags: ['text', 'gguf'],
    blurb: 'Strong text-in-image at 7B.',
    sizeGb: 12,
    minVramGb: 10
  },
  'ernie-image-turbo': {
    kind: 'image',
    tags: ['fast', 'low-vram'],
    blurb: 'Eight-step model for small GPUs.',
    sizeGb: 16,
    minVramGb: 4
  },
  'moss-image-sft': {
    kind: 'image',
    tags: ['qwen3.5'],
    blurb: 'MOSS-Image SFT with Qwen3.5.',
    sizeGb: 12,
    minVramGb: 10
  },
  'longcat-image': {
    kind: 'image',
    tags: ['text', 'bilingual'],
    blurb: 'Bilingual text rendering.',
    sizeGb: 15,
    minVramGb: 10
  },
  'hunyuan-video-15': {
    kind: 'video',
    tags: ['video', '720p'],
    blurb: '720p text-to-video.',
    sizeGb: 40,
    minVramGb: 16
  },
  'mage-flow': {
    kind: 'image',
    tags: ['fast', 'turbo'],
    blurb: 'Four-step stills.',
    sizeGb: 15,
    minVramGb: 10
  },
  'mage-flow-edit': {
    kind: 'edit',
    tags: ['edit', 'turbo'],
    blurb: 'Fast reference edits.',
    sizeGb: 16,
    minVramGb: 10
  },
  'boogu-image': {
    kind: 'image',
    tags: ['qwen3-vl'],
    blurb: 'Boogu base text-to-image.',
    sizeGb: 25,
    minVramGb: 16
  },
  'boogu-image-edit': {
    kind: 'edit',
    tags: ['edit'],
    blurb: 'Boogu instruction edits.',
    sizeGb: 26,
    minVramGb: 16
  },
  'ming-image': {
    kind: 'image',
    tags: ['design', 'rgba'],
    blurb: 'Design assets with transparency.',
    sizeGb: 15,
    minVramGb: 10
  },
  'llada-image': {
    kind: 'image',
    tags: ['diffusion-llm'],
    blurb: 'Diffusion-LLM image model.',
    sizeGb: 20,
    minVramGb: 12
  },
  'z-image-l2p': {
    kind: 'image',
    tags: ['pixel-space', 'z-image'],
    blurb: 'Z-Image without a VAE.',
    sizeGb: 26,
    minVramGb: 12
  },
  'hidream-o1-dev': {
    kind: 'image',
    tags: ['single-file'],
    blurb: 'HiDream-O1 Dev checkpoint.',
    sizeGb: 20,
    minVramGb: 16
  },
  'sdxs-512': {
    kind: 'image',
    tags: ['one-step', 'tiny'],
    blurb: 'Instant one-step drafts.',
    sizeGb: 1,
    minVramGb: 2
  },
  'ssd-1b': {
    kind: 'image',
    tags: ['sdxl', 'distilled'],
    blurb: 'Smaller, faster SDXL.',
    sizeGb: 5,
    minVramGb: 6
  },
  sd15: {
    kind: 'image',
    tags: ['sd15', 'checkpoint', 'starter'],
    blurb: 'Classic SD 1.5 checkpoint + VAE. The smallest pack.',
    sizeGb: 5,
    minVramGb: 4,
    featured: true
  },
  sdxl: {
    kind: 'image',
    tags: ['sdxl', 'checkpoint', 'starter'],
    blurb: 'Classic SDXL checkpoint + VAE. Smallest reliable still pack.',
    sizeGb: 7,
    minVramGb: 8,
    featured: true
  },
  sd35: {
    kind: 'image',
    tags: ['sd3', 'split'],
    blurb: 'SD3.5 Large with CLIP + T5 encoders.',
    sizeGb: 16,
    minVramGb: 12
  },
  'flux1-dev': {
    kind: 'image',
    tags: ['flux', 'gguf', 'quality'],
    blurb: 'High-quality FLUX.1 Dev stills (GGUF + AE).',
    sizeGb: 24,
    minVramGb: 12,
    featured: true
  },
  flux2: {
    kind: 'image',
    tags: ['flux2', 'llm'],
    blurb: 'FLUX.2 with Mistral LLM and dedicated AE.',
    sizeGb: 28,
    minVramGb: 16
  },
  'flux3-klein': {
    kind: 'edit',
    tags: ['flux3', 'edit', 'fast', 'game-assets'],
    blurb: 'Fast stills and consistent multi-ref edits — great for sprite frames.',
    sizeGb: 5,
    minVramGb: 8,
    featured: true
  },
  'qwen-image': {
    kind: 'image',
    tags: ['qwen', 't2i'],
    blurb: 'Qwen Image T2I with VL LLM + VAE.',
    sizeGb: 20,
    minVramGb: 12
  },
  wan21: {
    kind: 'video',
    tags: ['wan', 't2v', 'starter'],
    blurb: 'Wan2.1 short video generation.',
    sizeGb: 14,
    minVramGb: 12,
    featured: true
  },
  'animatediff-v3': {
    kind: 'video',
    tags: ['animatediff', 'sd15', 'motion', 't2v'],
    blurb: 'AnimateDiff v3 + Realistic Vision SD1.5 fp16 base (smallest official).',
    sizeGb: 3,
    minVramGb: 4,
    featured: true
  },
  wan22: {
    kind: 'video',
    tags: ['wan', 't2v'],
    blurb: 'Wan2.2 dual-stream video (high + low noise).',
    sizeGb: 30,
    minVramGb: 16
  },
  ltx23: {
    kind: 'video',
    tags: ['ltx', 'video'],
    blurb: 'LTX-2.3 video with Gemma LLM and dual VAE.',
    sizeGb: 40,
    minVramGb: 16
  },
  'flux-kontext': {
    kind: 'edit',
    tags: ['flux', 'kontext', 'ref'],
    blurb: 'FLUX Kontext multi-reference edit.',
    sizeGb: 22,
    minVramGb: 12
  },
  'qwen-image-edit': {
    kind: 'edit',
    tags: ['qwen', 'edit'],
    blurb: 'Qwen Image Edit with multi-ref instruction.',
    sizeGb: 20,
    minVramGb: 12,
    featured: true
  },
  'qwen-image-edit-2511': {
    kind: 'edit',
    tags: ['qwen', 'edit', '2511'],
    blurb: 'Newer Qwen edit (zero-cond-t quality).',
    sizeGb: 14,
    minVramGb: 12
  },
  'z-image-turbo': {
    kind: 'image',
    tags: ['turbo', 'fast'],
    blurb: 'Fast turbo stills with Qwen3-4B.',
    sizeGb: 8,
    minVramGb: 8
  },
  chroma: {
    kind: 'image',
    tags: ['chroma'],
    blurb: 'Chroma1-HD DiT + T5 + AE.',
    sizeGb: 12,
    minVramGb: 10
  },
  krea2: {
    kind: 'image',
    tags: ['krea'],
    blurb: 'Krea-2 base with Qwen3-VL and Wan VAE.',
    sizeGb: 14,
    minVramGb: 12
  },
  lens: {
    kind: 'image',
    tags: ['lens', 'large'],
    blurb: 'Lens + GPT-OSS-20B (large; prefer offload).',
    sizeGb: 35,
    minVramGb: 16
  },
  ideogram4: {
    kind: 'image',
    tags: ['ideogram'],
    blurb: 'Ideogram4 dual diffusion + Qwen3-VL.',
    sizeGb: 30,
    minVramGb: 16
  },
  anima: {
    kind: 'image',
    tags: ['anima', 'anime', 'edit-lora'],
    blurb: 'Fast Anima T2I. Community Edit LoRA (optional) for Ref Edit.',
    sizeGb: 6,
    minVramGb: 8,
    featured: true
  },
  'lingbot-video': {
    kind: 'video',
    tags: ['lingbot', 't2v'],
    blurb: 'LingBot dense 1.3B video (Wan VAE).',
    sizeGb: 12,
    minVramGb: 12
  },
  minit2i: {
    kind: 'image',
    tags: ['mini', 'light'],
    blurb: 'Lightweight MiniT2I DiT + FLAN-T5.',
    sizeGb: 5,
    minVramGb: 6
  }
}

/** Hub packs with card/filter metadata applied. */
export function enrichHubModel(model: HubModel): HubModel {
  const meta = HUB_PACK_META[model.id]
  if (!meta) return { ...model, kind: model.kind || 'other' }
  return {
    ...model,
    kind: model.kind || meta.kind,
    tags: model.tags || meta.tags,
    blurb: model.blurb || meta.blurb,
    sizeGb: model.sizeGb ?? meta.sizeGb,
    minVramGb: model.minVramGb ?? meta.minVramGb,
    featured: model.featured ?? meta.featured
  }
}

export type HubFilterKind = 'all' | HubPackKind | 'installed'

export function filterHubModels(
  packs: HubModel[],
  opts: { query?: string; filter?: HubFilterKind; isReady?: (m: HubModel) => boolean }
): HubModel[] {
  const q = (opts.query || '').trim().toLowerCase()
  const filter = opts.filter || 'all'
  return packs.filter((raw) => {
    const m = enrichHubModel(raw)
    if (filter === 'installed') {
      if (!opts.isReady?.(m)) return false
    } else if (filter !== 'all' && (m.kind || 'other') !== filter) {
      return false
    }
    if (!q) return true
    const hay = [m.id, m.name, m.description, m.blurb || '', ...(m.tags || [])]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export const hubModels: HubModel[] = [
  {
    id: 'sd15',
    name: 'SD 1.5',
    description:
      'Smallest classic checkpoint. Runs on low-VRAM cards; downloads the v1.5 checkpoint plus the improved MSE VAE.',
    presetId: 'builtin-sd15',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/sd.md',
    files: [
      {
        label: 'SD 1.5 checkpoint',
        category: 'diffusion',
        filename: 'v1-5-pruned-emaonly.safetensors',
        required: true,
        url: 'https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors'
      },
      {
        label: 'VAE ft-MSE',
        category: 'vae',
        filename: 'vae-ft-mse-840000-ema-pruned.safetensors',
        required: false,
        url: 'https://huggingface.co/stabilityai/sd-vae-ft-mse-original/resolve/main/vae-ft-mse-840000-ema-pruned.safetensors'
      }
    ]
  },
  {
    id: 'sdxl',
    name: 'SDXL',
    description:
      'Classic checkpoint workflow. Downloads the SDXL base checkpoint plus recommended VAE.',
    presetId: 'builtin-sdxl',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/sd.md',
    files: [
      {
        label: 'SDXL Base 1.0 checkpoint',
        category: 'diffusion',
        filename: 'sd_xl_base_1.0.safetensors',
        required: true,
        url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors'
      },
      {
        label: 'SDXL VAE fp16 fix',
        category: 'vae',
        filename: 'sdxl_vae-fp16-fix.safetensors',
        required: false,
        url: 'https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors'
      }
    ]
  },
  {
    id: 'sd35',
    name: 'SD3 / SD3.5',
    description: 'Split text encoders with CLIP-L, CLIP-G, T5XXL, and SD3.5 diffusion model.',
    presetId: 'builtin-sd35',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/sd3.md',
    files: [
      {
        label: 'SD3.5 Large diffusion',
        category: 'diffusion',
        filename: 'sd3.5_large.safetensors',
        required: true,
        url: 'https://huggingface.co/stabilityai/stable-diffusion-3.5-large/resolve/main/sd3.5_large.safetensors',
        gated: true
      },
      {
        label: 'CLIP-L',
        category: 'clip',
        filename: 'clip_l.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/clip_l.safetensors'
      },
      {
        label: 'CLIP-G',
        category: 'clipG',
        filename: 'clip_g.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/clip_g.safetensors'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/t5xxl_fp16.safetensors'
      }
    ]
  },
  {
    id: 'flux1-dev',
    name: 'FLUX.1 Dev',
    description: 'FLUX split workflow with AE, CLIP-L, T5XXL, low CFG, and flash attention.',
    presetId: 'builtin-flux-dev',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux.md',
    files: [
      {
        label: 'FLUX.1 Dev diffusion GGUF Q8',
        category: 'diffusion',
        filename: 'flux1-dev-q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/FLUX.1-dev-gguf/resolve/main/flux1-dev-q8_0.gguf'
      },
      {
        label: 'CLIP-L',
        category: 'clip',
        filename: 'clip_l.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors'
      }
    ]
  },
  {
    id: 'flux2',
    name: 'FLUX.2',
    description:
      'FLUX.2 uses an LLM text encoder and Flux2 VAE format. Includes a Dev GGUF diffusion option and Flux2 VAE.',
    presetId: 'builtin-flux2-dev',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md',
    files: [
      {
        label: 'FLUX.2 Dev diffusion GGUF Q4_K_S',
        category: 'diffusion',
        filename: 'flux2-dev-Q4_K_S.gguf',
        required: true,
        url: 'https://huggingface.co/city96/FLUX.2-dev-gguf/resolve/main/flux2-dev-Q4_K_S.gguf'
      },
      {
        label: 'Mistral Small 3.2 LLM GGUF Q4_K_M',
        category: 'llm',
        filename: 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf'
      },
      {
        label: 'Flux2 AE',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors'
      }
    ]
  },
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    description:
      'Qwen Image split workflow with Qwen VAE, Qwen VL LLM, flow shift 3, and flash attention.',
    presetId: 'builtin-qwen-image',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image.md',
    files: [
      {
        label: 'Qwen Image diffusion GGUF Q8',
        category: 'diffusion',
        filename: 'qwen-image-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Qwen-Image-GGUF/resolve/main/Qwen_Image-Q8_0.gguf'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      }
    ]
  },
  {
    id: 'wan21',
    name: 'Wan2.1 Video',
    description:
      'Wan video preset with UMT5, Wan VAE, flow shift, and optional CLIP Vision for I2V/FLF2V.',
    presetId: 'builtin-wan21',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md',
    files: [
      {
        label: 'Wan2.1 T2V 1.3B diffusion',
        category: 'diffusion',
        filename: 'wan2.1_t2v_1.3B_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors'
      },
      {
        label: 'Wan2.1 VAE',
        category: 'vae',
        filename: 'wan_2.1_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors'
      },
      {
        label: 'UMT5 XXL fp16',
        category: 't5xxl',
        filename: 'umt5_xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors'
      },
      {
        label: 'CLIP Vision H',
        category: 'clip_vision',
        filename: 'clip_vision_h.safetensors',
        required: false,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors'
      }
    ]
  },
  {
    id: 'wan22',
    name: 'Wan2.2 Video',
    description:
      'Wan2.2 preset supports high-noise + low-noise diffusion pairs and Wan VAE variants.',
    presetId: 'builtin-wan22-a14b',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md',
    files: [
      {
        label: 'Wan2.2 T2V A14B Low Noise',
        category: 'diffusion',
        filename: 'Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Wan2.2-T2V-A14B-GGUF/resolve/main/LowNoise/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf'
      },
      {
        label: 'Wan2.2 T2V A14B High Noise',
        category: 'diffusion',
        filename: 'Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Wan2.2-T2V-A14B-GGUF/resolve/main/HighNoise/Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf'
      },
      {
        label: 'Wan2.2 VAE',
        category: 'vae',
        filename: 'wan2.2_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors'
      },
      {
        label: 'UMT5 XXL fp16',
        category: 't5xxl',
        filename: 'umt5_xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors'
      }
    ]
  },
  {
    id: 'ltx23',
    name: 'LTX-2.3 Video',
    description:
      'LTX-2.3 video preset with LLM, embeddings connectors, audio VAE, and temporal tiling args.',
    presetId: 'builtin-ltx23',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ltx2.md',
    files: [
      {
        label: 'LTX-2.3 Dev diffusion GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'ltx-2.3-22b-dev-UD-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/ltx-2.3-22b-dev-UD-Q4_K_M.gguf'
      },
      {
        label: 'Gemma 3 12B LLM GGUF Q4_K_XL',
        category: 'llm',
        filename: 'gemma-3-12b-it-UD-Q4_K_XL.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-UD-Q4_K_XL.gguf'
      },
      {
        label: 'LTX video VAE',
        category: 'vae',
        filename: 'ltx-2.3-22b-dev_video_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/vae/ltx-2.3-22b-dev_video_vae.safetensors'
      },
      {
        label: 'LTX audio VAE',
        category: 'audio_vae',
        filename: 'ltx-2.3-22b-dev_audio_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/vae/ltx-2.3-22b-dev_audio_vae.safetensors'
      },
      {
        label: 'Embeddings connectors',
        category: 'embeddings_connectors',
        filename: 'ltx-2.3-22b-dev_embeddings_connectors.safetensors',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/text_encoders/ltx-2.3-22b-dev_embeddings_connectors.safetensors'
      },
      {
        label: 'LTX spatial upscaler',
        category: 'hires_upscalers',
        filename: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        required: false,
        url: 'https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-spatial-upscaler-x2-1.1.safetensors'
      }
    ]
  },
  {
    id: 'flux-kontext',
    name: 'FLUX Kontext',
    description:
      'Image edit workflow with multi-ref support. Uses Kontext diffusion, FLUX AE, CLIP-L, and T5XXL. CFG 1 recommended.',
    presetId: 'builtin-flux-kontext',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/kontext.md',
    files: [
      {
        label: 'FLUX.1 Kontext Dev GGUF Q8',
        category: 'diffusion',
        filename: 'flux1-kontext-dev-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/FLUX.1-Kontext-dev-GGUF/resolve/main/flux1-kontext-dev-Q8_0.gguf'
      },
      {
        label: 'CLIP-L',
        category: 'clip',
        filename: 'clip_l.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors'
      }
    ]
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen Image Edit',
    description:
      'Instruction image editing with multi-ref. Includes Edit diffusion, Qwen VAE, and Qwen2.5-VL LLM. Use Edit workspace → Ref Edit.',
    presetId: 'builtin-qwen-image-edit',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_edit.md',
    files: [
      {
        label: 'Qwen Image Edit GGUF Q8',
        category: 'diffusion',
        filename: 'Qwen_Image_Edit-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Qwen-Image-Edit-GGUF/resolve/main/Qwen_Image_Edit-Q8_0.gguf'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      }
    ]
  },
  {
    id: 'qwen-image-edit-2511',
    name: 'Qwen Image Edit 2511',
    description:
      'Newer Qwen edit variant. Enables qwen_image_zero_cond_t for quality. Use Edit → Ref Edit after applying the pack.',
    presetId: 'builtin-qwen-image-edit-2511',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_edit.md',
    files: [
      {
        label: 'Qwen Image Edit 2511 GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'qwen-image-edit-2511-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF/resolve/main/qwen-image-edit-2511-Q4_K_M.gguf'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      }
    ]
  },
  {
    id: 'flux3-klein',
    name: 'FLUX.3 Klein',
    description:
      'Distilled FLUX.3 for fast stills and reference edits (up to 10 refs). Klein GGUF + Qwen3-VL 4B + Flux2 AE. CFG 1, 16 steps.',
    presetId: 'builtin-flux3-klein',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux3.md',
    files: [
      {
        label: 'FLUX.3 Klein GGUF Q4_K',
        category: 'diffusion',
        filename: 'flux3-image-klein-Q4_K.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/flux-3-image-klein-GGUF/resolve/main/flux3-image-klein-Q4_K.gguf'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Flux2 AE',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors'
      }
    ]
  },
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    description:
      'Fast low-VRAM image model. Diffusion GGUF + Qwen3 4B LLM + FLUX AE. CFG 1, 8 steps recommended.',
    presetId: 'builtin-z-image-turbo',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/z_image.md',
    files: [
      {
        label: 'Z-Image Turbo GGUF Q4_0',
        category: 'diffusion',
        filename: 'z_image_turbo-Q4_0.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_0.gguf'
      },
      {
        label: 'Qwen3 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors'
      }
    ]
  },
  {
    id: 'chroma',
    name: 'Chroma',
    description:
      'FLUX-family DiT with T5XXL + AE. CFG ~4. Disables DiT mask by default (matches chroma docs).',
    presetId: 'builtin-chroma',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/chroma.md',
    files: [
      {
        label: 'Chroma1-HD GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'Chroma1-HD-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/silveroxides/Chroma1-HD-GGUF/resolve/main/Chroma1-HD-Q4_K_M.gguf'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors'
      }
    ]
  },
  {
    id: 'krea2',
    name: 'Krea2',
    description:
      'Krea2 diffusion + Wan2.1 VAE + Qwen3-VL 4B LLM. Flash attention and CPU offload recommended.',
    presetId: 'builtin-krea2',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/krea2.md',
    files: [
      {
        label: 'Krea2 Base GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'Krea-2-Base-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/realrebelai/KREA-2_GGUFs/resolve/main/BASE/Krea-2-Base-Q4_K_M.gguf'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3-VL-4B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Wan2.1 VAE',
        category: 'vae',
        filename: 'wan_2.1_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors'
      }
    ]
  },
  {
    id: 'lens',
    name: 'Lens',
    description:
      'Lens diffusion + Flux2 VAE + GPT-OSS-20B LLM. Large download; prefer offload. Turbo preset is 4 steps / CFG 1.',
    presetId: 'builtin-lens',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/lens.md',
    files: [
      {
        label: 'Lens diffusion bf16',
        category: 'diffusion',
        filename: 'lens_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Lens/resolve/main/diffusion_models/lens_bf16.safetensors'
      },
      {
        label: 'GPT-OSS-20B GGUF Q4_K_M',
        category: 'llm',
        filename: 'gpt-oss-20b-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/gpt-oss-20b-GGUF/resolve/main/gpt-oss-20b-Q4_K_M.gguf'
      },
      {
        label: 'Flux2 AE',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors'
      }
    ]
  },
  {
    id: 'ideogram4',
    name: 'Ideogram4',
    description:
      'Ideogram4 needs a main diffusion model, uncond diffusion model, Qwen3-VL LLM, and Flux2 VAE.',
    presetId: 'builtin-ideogram4',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ideogram4.md',
    files: [
      {
        label: 'Ideogram4 diffusion fp8',
        category: 'diffusion',
        filename: 'ideogram4_fp8.safetensors',
        required: true,
        url: 'https://huggingface.co/ideogram-ai/ideogram-4-fp8/resolve/main/transformer/diffusion_pytorch_model.safetensors',
        gated: true
      },
      {
        label: 'Ideogram4 uncond diffusion fp8',
        category: 'uncond_diffusion',
        filename: 'ideogram4_uncond_fp8.safetensors',
        required: true,
        url: 'https://huggingface.co/ideogram-ai/ideogram-4-fp8/resolve/main/unconditional_transformer/diffusion_pytorch_model.safetensors',
        gated: true
      },
      {
        label: 'Qwen3-VL 8B LLM GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-VL-8B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3-VL-8B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Flux2 AE',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors'
      }
    ]
  },
  {
    id: 'anima',
    name: 'Anima',
    description:
      'Fast T2I with Qwen3-0.6B + Qwen image VAE. For Ref Edit, a community-made Anima Edit LoRA is optional (not bundled): https://civitai.com/models/2650553/anima-edit — place it under models/loras, enable at strength ~1; Flaxeo applies cosmos_reference automatically.',
    presetId: 'builtin-anima',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/anima.md',
    files: [
      {
        label: 'Anima diffusion (preview)',
        category: 'diffusion',
        filename: 'anima-preview.safetensors',
        required: true,
        url: 'https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-preview.safetensors'
      },
      {
        label: 'Qwen3 0.6B Base GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-0.6B-Base.Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen3-0.6B-Base-GGUF/resolve/main/Qwen3-0.6B-Base.Q4_K_M.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      }
    ]
  },
  {
    id: 'animatediff-v3',
    name: 'AnimateDiff v3',
    description:
      'Recommended AnimateDiff stack from sd.cpp docs: Realistic Vision V6.0 B1 (SD1.5) + motion module mm_sd15_v3 @ 512². Use Video workspace (standard load). Optional domain adapter: <lora:mm_sd15_v3_adapter:1.0>.',
    presetId: 'builtin-animatediff-v3',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/animatediff.md',
    files: [
      {
        label: 'Realistic Vision V6.0 B1 fp16 (SD1.5 base, smallest official)',
        category: 'diffusion',
        filename: 'Realistic_Vision_V6.0_NV_B1_fp16.safetensors',
        required: true,
        // Official SG161222 fp16 (~2.1 GB) — smallest single-file RV6.0 B1 on HF
        url: 'https://huggingface.co/SG161222/Realistic_Vision_V6.0_B1_noVAE/resolve/main/Realistic_Vision_V6.0_NV_B1_fp16.safetensors?download=true'
      },
      {
        label: 'Motion module mm_sd15_v3 (fp16)',
        category: 'animatediff',
        filename: 'mm_sd15_v3.safetensors',
        required: true,
        url: 'https://huggingface.co/conrevo/AnimateDiff-A1111/resolve/main/motion_module/mm_sd15_v3.safetensors?download=true'
      },
      {
        label: 'Domain adapter LoRA (v3, optional)',
        category: 'loras',
        filename: 'mm_sd15_v3_adapter.safetensors',
        required: false,
        url: 'https://huggingface.co/conrevo/AnimateDiff-A1111/resolve/main/lora/mm_sd15_v3_adapter.safetensors?download=true'
      }
    ]
  },
  {
    id: 'lingbot-video',
    name: 'LingBot Video',
    description:
      'LingBot dense 1.3B T2V/I2V with Wan2.1 VAE and Qwen3-VL 4B. Use Video workspace (frames 33/49/81).',
    presetId: 'builtin-lingbot-video',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/lingbot_video.md',
    files: [
      {
        label: 'LingBot dense 1.3B (diffusion)',
        category: 'diffusion',
        filename: 'lingbot-video-dense-1.3b.safetensors',
        required: true,
        // Transformer shards are multi-file on HF; users may replace with a single merged weight.
        url: 'https://huggingface.co/robbyant/lingbot-video-dense-1.3b/resolve/main/transformer/diffusion_pytorch_model.safetensors'
      },
      {
        label: 'Wan2.1 VAE',
        category: 'vae',
        filename: 'wan_2.1_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3-VL-4B-Instruct-Q4_K_M.gguf'
      }
    ]
  },
  {
    id: 'minit2i',
    name: 'MiniT2I',
    description: 'Compact DiT + flan-t5-large text encoder for lightweight T2I (512², many steps).',
    presetId: 'builtin-minit2i',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/minit2i.md',
    files: [
      {
        label: 'MiniT2I diffusion (B-16)',
        category: 'diffusion',
        filename: 'minit2i_diffusion_pytorch_model.safetensors',
        required: true,
        url: 'https://huggingface.co/MiniT2I/MiniT2I/resolve/main/minit2i-b-16/transformer/diffusion_pytorch_model.safetensors'
      },
      {
        label: 'FLAN-T5 Large (T5XXL slot)',
        category: 't5xxl',
        filename: 'flan-t5-large.safetensors',
        required: true,
        url: 'https://huggingface.co/google/flan-t5-large/resolve/main/model.safetensors'
      }
    ]
  },
  {
    id: 'qwen-image-21',
    name: 'Qwen Image 2.1',
    description:
      'Qwen Image 2.1 GGUF with Qwen3-VL 8B and its own VAE; the vision projector enables reference edits. CFG 6.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_2.1.md',
    files: [
      {
        label: 'Qwen Image 2.1 GGUF Q4_K',
        category: 'diffusion',
        filename: 'qwen_image_2.1-Q4_K.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/Qwen-Image-2.1-GGUF/resolve/main/qwen_image_2.1-Q4_K.gguf'
      },
      {
        label: 'Qwen3-VL 8B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Qwen Image 2.1 VAE',
        category: 'vae',
        filename: 'qwen_image_2.1_vae_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors'
      },
      {
        label: 'Qwen3-VL 8B vision projector',
        category: 'llm_vision',
        filename: 'mmproj-Qwen3VL-8B-Instruct-F16.gguf',
        required: false,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-8B-Instruct-F16.gguf'
      }
    ]
  },
  {
    id: 'iris-3b',
    name: 'Iris-3B',
    description: 'Compact pixel-space model (no VAE) with Qwen3-VL 4B. CFG 3, 1024px.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/iris.md',
    files: [
      {
        label: 'Iris-3B diffusion',
        category: 'diffusion',
        filename: 'iris-3b.safetensors',
        required: true,
        url: 'https://huggingface.co/speridlabs/iris-3b/resolve/main/model.safetensors'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf'
      }
    ]
  },
  {
    id: 'chroma-radiance',
    name: 'Chroma1-Radiance',
    description: 'Pixel-space Chroma (no VAE) with T5-XXL. CFG 4.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/chroma_radiance.md',
    files: [
      {
        label: 'Chroma1-Radiance v0.4 GGUF Q8',
        category: 'diffusion',
        filename: 'Chroma1-Radiance-v0.4-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/silveroxides/Chroma1-Radiance-GGUF/resolve/main/Chroma1-Radiance-v0.4/Chroma1-Radiance-v0.4-Q8_0.gguf'
      },
      {
        label: 'T5-XXL FP16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors'
      }
    ]
  },
  {
    id: 'ovis-image',
    name: 'Ovis-Image',
    description: 'Ovis-Image 7B GGUF with the Ovis 2.5 encoder and FLUX autoencoder. CFG 5.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ovis_image.md',
    files: [
      {
        label: 'Ovis-Image 7B GGUF Q4_0',
        category: 'diffusion',
        filename: 'ovis_image-Q4_0.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/Ovis-Image-7B-GGUF/resolve/main/ovis_image-Q4_0.gguf'
      },
      {
        label: 'Ovis 2.5 text encoder',
        category: 'llm',
        filename: 'ovis_2.5.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Ovis-Image/resolve/main/split_files/text_encoders/ovis_2.5.safetensors'
      },
      {
        label: 'FLUX autoencoder',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors'
      }
    ]
  },
  {
    id: 'ernie-image-turbo',
    name: 'ERNIE-Image Turbo',
    description:
      'Eight-step ERNIE-Image with Ministral 3B; runs on small GPUs with offload. CFG 1.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ernie_image.md',
    files: [
      {
        label: 'ERNIE-Image Turbo',
        category: 'diffusion',
        filename: 'ernie-image-turbo.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/ERNIE-Image/resolve/main/diffusion_models/ernie-image-turbo.safetensors'
      },
      {
        label: 'Ministral 3B text encoder',
        category: 'llm',
        filename: 'ministral-3-3b.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/ERNIE-Image/resolve/main/text_encoders/ministral-3-3b.safetensors'
      },
      {
        label: 'FLUX.2 autoencoder',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors'
      }
    ]
  },
  {
    id: 'moss-image-sft',
    name: 'MOSS-Image SFT',
    description: 'MOSS-Image SFT GGUF with Qwen3.5 9B, its tokenizer and the FLUX.2 VAE. CFG 3.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/moss_image.md',
    files: [
      {
        label: 'MOSS-Image SFT GGUF Q4_K',
        category: 'diffusion',
        filename: 'MOSS-Image-SFT-Q4_K.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/MOSS-Image-SFT-GGUF/resolve/main/MOSS-Image-SFT-Q4_K.gguf'
      },
      {
        label: 'Qwen3.5 9B GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3.5-9B-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf'
      },
      {
        label: 'MOSS FLUX.2 VAE',
        category: 'vae',
        filename: 'moss_flux2-vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/MOSS-Image/resolve/main/vae/flux2-vae.safetensors'
      },
      {
        label: 'Qwen3.5 tokenizer',
        category: 'tokenizers',
        filename: 'tokenizer_qwen3.5.json',
        required: true,
        url: 'https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base/resolve/main/tokenizer/tokenizer.json'
      }
    ]
  },
  {
    id: 'longcat-image',
    name: 'LongCat Image',
    description:
      'LongCat Image GGUF with Qwen2.5-VL 7B and the FLUX autoencoder. CFG 5, flow shift 3.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/longcat_image.md',
    files: [
      {
        label: 'LongCat Image GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'LongCat-Image-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/vantagewithai/LongCat-Image-GGUF/resolve/main/comfy/LongCat-Image-Q4_K_M.gguf'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'FLUX autoencoder',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors'
      }
    ]
  },
  {
    id: 'hunyuan-video-15',
    name: 'HunyuanVideo 1.5',
    description: '720p text-to-video with Qwen2.5-VL and ByT5 encoders. Large download.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/hunyuan_video.md',
    files: [
      {
        label: 'HunyuanVideo 1.5 720p T2V',
        category: 'diffusion',
        filename: 'hunyuanvideo1.5_720p_t2v_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/diffusion_models/hunyuanvideo1.5_720p_t2v_fp16.safetensors'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'ByT5 GlyphXL encoder',
        category: 't5xxl',
        filename: 'byt5_small_glyphxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/text_encoders/byt5_small_glyphxl_fp16.safetensors'
      },
      {
        label: 'HunyuanVideo 1.5 VAE',
        category: 'vae',
        filename: 'hunyuanvideo15_vae_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/vae/hunyuanvideo15_vae_fp16.safetensors'
      }
    ]
  },
  {
    id: 'mage-flow',
    name: 'Mage-Flow Turbo',
    description: 'Four-step Mage-Flow with Qwen3-VL 4B. CFG 1.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/mage_flow.md',
    files: [
      {
        label: 'Mage-Flow Turbo',
        category: 'diffusion',
        filename: 'mage_flow_turbo_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Mage-Flow/resolve/main/diffusion_models/mage_flow_turbo_bf16.safetensors'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Mage-Flow VAE',
        category: 'vae',
        filename: 'mage_flow_vae_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Mage-Flow/resolve/main/vae/mage_flow_vae_bf16.safetensors'
      }
    ]
  },
  {
    id: 'mage-flow-edit',
    name: 'Mage-Flow Edit',
    description: 'Reference-image editing (turbo) with the Qwen3-VL 4B vision projector.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/mage_flow.md',
    files: [
      {
        label: 'Mage-Flow Edit Turbo',
        category: 'diffusion',
        filename: 'mage_flow_edit_turbo_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Mage-Flow/resolve/main/diffusion_models/mage_flow_edit_turbo_bf16.safetensors'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Qwen3-VL 4B vision projector',
        category: 'llm_vision',
        filename: 'mmproj-Qwen3VL-4B-Instruct-F16.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-F16.gguf'
      },
      {
        label: 'Mage-Flow VAE',
        category: 'vae',
        filename: 'mage_flow_vae_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Mage-Flow/resolve/main/vae/mage_flow_vae_bf16.safetensors'
      }
    ]
  },
  {
    id: 'boogu-image',
    name: 'Boogu Image',
    description: 'Boogu Image base with Qwen3-VL 8B and the FLUX VAE.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/boogu_image.md',
    files: [
      {
        label: 'Boogu Image base',
        category: 'diffusion',
        filename: 'boogu_image_base_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_base_bf16.safetensors'
      },
      {
        label: 'Qwen3-VL 8B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'FLUX VAE',
        category: 'vae',
        filename: 'flux1_vae_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/vae/flux1_vae_bf16.safetensors'
      }
    ]
  },
  {
    id: 'boogu-image-edit',
    name: 'Boogu Image Edit',
    description: 'Instruction editing with reference images and the Qwen3-VL 8B projector.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/boogu_image.md',
    files: [
      {
        label: 'Boogu Image Edit',
        category: 'diffusion',
        filename: 'boogu_image_edit_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_edit_bf16.safetensors'
      },
      {
        label: 'Qwen3-VL 8B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Qwen3-VL 8B vision projector',
        category: 'llm_vision',
        filename: 'mmproj-Qwen3VL-8B-Instruct-F16.gguf',
        required: true,
        url: 'https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-8B-Instruct-F16.gguf'
      },
      {
        label: 'FLUX VAE',
        category: 'vae',
        filename: 'flux1_vae_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/vae/flux1_vae_bf16.safetensors'
      }
    ]
  },
  {
    id: 'ming-image',
    name: 'Ming-Image Design',
    description:
      'Design model with RGBA output: DiT, Ling-mini encoder, VAE and tokenizer. CFG 1, 12 steps.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ming_image.md',
    files: [
      {
        label: 'Ming-Image 0.1 Design (int8)',
        category: 'diffusion',
        filename: 'ming_image_0.1_design_int8_convrot.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Ming-Image/resolve/main/diffusion_models/ming_image_0.1_design_int8_convrot.safetensors'
      },
      {
        label: 'Ling-mini 2.0 encoder',
        category: 'llm',
        filename: 'ming_image_0.1_ling_mini_2.0_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Ming-Image/resolve/main/text_encoders/ming_image_0.1_ling_mini_2.0_bf16.safetensors'
      },
      {
        label: 'Ming-Image VAE',
        category: 'vae',
        filename: 'ming_image_vae_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Ming-Image/resolve/main/vae/ming_image_vae_bf16.safetensors'
      },
      {
        label: 'Ling tokenizer',
        category: 'tokenizers',
        filename: 'tokenizer_ling.json',
        required: true,
        url: 'https://huggingface.co/inclusionAI/Ming-Image-0.1-Design/resolve/main/mllm/tokenizer.json'
      }
    ]
  },
  {
    id: 'llada-image',
    name: 'LLaDA-Image',
    description:
      'LLaDA-Image GGUF with its encoder, connectors, VAE and tokenizer. 50 steps, CFG 5.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/llada_image.md',
    files: [
      {
        label: 'LLaDA-Image GGUF Q8',
        category: 'diffusion',
        filename: 'llada-image-q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/fszontagh/LLaDA-Image-GGUF/resolve/main/llada-image-q8_0.gguf'
      },
      {
        label: 'LLaDA text encoder Q8',
        category: 'llm',
        filename: 'llada-image-text_encoder-q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/fszontagh/LLaDA-Image-GGUF/resolve/main/llada-image-text_encoder-q8_0.gguf'
      },
      {
        label: 'LLaDA connectors',
        category: 'embeddings_connectors',
        filename: 'llada-image-connectors.safetensors',
        required: true,
        url: 'https://huggingface.co/fszontagh/LLaDA-Image-GGUF/resolve/main/llada-image-connectors.safetensors'
      },
      {
        label: 'LLaDA edit connectors',
        category: 'embeddings_connectors',
        filename: 'llada-image-connectors-edit.safetensors',
        required: false,
        url: 'https://huggingface.co/fszontagh/LLaDA-Image-GGUF/resolve/main/llada-image-connectors-edit.safetensors'
      },
      {
        label: 'LLaDA VAE',
        category: 'vae',
        filename: 'llada_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/inclusionAI/LLaDA-Image/resolve/main/vae/diffusion_pytorch_model.safetensors'
      },
      {
        label: 'LLaDA tokenizer',
        category: 'tokenizers',
        filename: 'tokenizer_llada.json',
        required: true,
        url: 'https://huggingface.co/inclusionAI/LLaDA-Image/resolve/main/tokenizer/tokenizer.json'
      }
    ]
  },
  {
    id: 'z-image-l2p',
    name: 'Z-Image L2P',
    description: 'Pixel-space Z-Image (no VAE) with Qwen3 4B. CFG 2, 30 steps.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/z_image_l2p.md',
    files: [
      {
        label: 'Z-Image L2P 1K',
        category: 'diffusion',
        filename: 'z_image_l2p_1k.safetensors',
        required: true,
        url: 'https://huggingface.co/zhen-nan/L2P/resolve/main/model-1k-merge.safetensors'
      },
      {
        label: 'Qwen3 4B text encoder',
        category: 'llm',
        filename: 'qwen_3_4b.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors'
      }
    ]
  },
  {
    id: 'hidream-o1-dev',
    name: 'HiDream-O1-Image Dev',
    description: 'Single-file HiDream-O1 Dev checkpoint. CFG 1.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/hidream_o1_image.md',
    files: [
      {
        label: 'HiDream-O1-Image Dev',
        category: 'diffusion',
        filename: 'hidream_o1_image_dev_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/HiDream-O1-Image/resolve/main/checkpoints/hidream_o1_image_dev_bf16.safetensors'
      }
    ]
  },
  {
    id: 'sdxs-512',
    name: 'SDXS-512',
    description: 'One-step SD for instant 512px drafts. Exactly 1 step at CFG 1.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/distilled_sd.md',
    files: [
      {
        label: 'SDXS-512 DreamShaper',
        category: 'diffusion',
        filename: 'sdxs.safetensors',
        required: true,
        url: 'https://huggingface.co/akleine/sdxs-512/resolve/main/sdxs.safetensors'
      }
    ]
  },
  {
    id: 'ssd-1b',
    name: 'SSD-1B',
    description: 'Distilled SDXL (50% smaller, faster) that runs as-is.',
    presetId: '',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/distilled_sd.md',
    files: [
      {
        label: 'SSD-1B (A1111 format)',
        category: 'diffusion',
        filename: 'SSD-1B-A1111.safetensors',
        required: true,
        url: 'https://huggingface.co/segmind/SSD-1B/resolve/main/SSD-1B-A1111.safetensors'
      }
    ]
  }
]

export type StarterPackId = 'sd15' | 'sdxl' | 'flux1-dev' | 'wan21'

export const STARTER_PACK_IDS: StarterPackId[] = ['sd15', 'sdxl', 'flux1-dev', 'wan21']

export interface StarterPackMeta {
  sizeGb: number
  minVramGb: number
  blurb: string
  recommended?: boolean
}

export const STARTER_PACK_META: Record<StarterPackId, StarterPackMeta> = {
  sd15: {
    sizeGb: 5,
    minVramGb: 4,
    blurb: 'Smallest download. Runs on almost anything.'
  },
  sdxl: {
    sizeGb: 7,
    minVramGb: 8,
    blurb: 'Sharper stills than 1.5, still modest.'
  },
  'flux1-dev': {
    sizeGb: 24,
    minVramGb: 12,
    blurb: 'Best quality for still images.',
    recommended: true
  },
  wan21: {
    sizeGb: 14,
    minVramGb: 12,
    blurb: 'Short video clips.'
  }
}
