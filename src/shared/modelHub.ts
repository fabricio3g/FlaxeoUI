/**
 * Online model sources (Hugging Face, Civitai): the shapes the Models page shows and the
 * pure rules for reading them. The server fetches; images are shown straight from the
 * source (hotlinked), never downloaded.
 */

export type HubSource = 'huggingface' | 'civitai'

export interface HubFileEntry {
  name: string
  size: number
  url: string
  /** Folder under models/ it most likely belongs in */
  category: string
}

export interface HubVersion {
  id: string
  name: string
  baseModel: string
  files: HubFileEntry[]
}

export interface HubItem {
  source: HubSource
  id: string
  name: string
  author: string
  /** Checkpoint, LoRA, GGUF repo… */
  type: string
  image: string
  page: string
  downloads: number
  /** Civitai lists files per version; Hugging Face files load on demand */
  versions: HubVersion[]
  /** Base model a quantized repo was made from (Hugging Face) */
  baseModel?: string
}

export interface FamilyImage {
  repo: string
  page: string
  image: string
}

/** Files sd.cpp can load. */
export const MODEL_FILE = /\.(safetensors|gguf|ckpt|pth|pt|bin)$/i

/** Civitai model types and where their files go. */
export const CIVITAI_TYPES: Array<{ id: string; label: string; category: string }> = [
  { id: 'Checkpoint', label: 'Checkpoints', category: 'diffusion' },
  { id: 'LORA', label: 'LoRAs', category: 'loras' },
  { id: 'LoCon', label: 'LyCORIS', category: 'loras' },
  { id: 'TextualInversion', label: 'Embeddings', category: 'embeddings' },
  { id: 'VAE', label: 'VAEs', category: 'vae' },
  { id: 'Controlnet', label: 'ControlNet', category: 'controlnet' },
  { id: 'Upscaler', label: 'Upscalers', category: 'upscale' },
  { id: 'MotionModule', label: 'Motion modules', category: 'animatediff' }
]

export function civitaiCategory(type: string): string {
  return (
    CIVITAI_TYPES.find((t) => t.id.toLowerCase() === type.toLowerCase())?.category || 'diffusion'
  )
}

/** Best guess of the models/ folder for a file in a Hugging Face repo. */
export function guessCategory(path: string): string {
  const name = path.toLowerCase()
  if (/lora/.test(name)) return 'loras'
  if (/(^|[/_.-])(vae|ae)([/_.-]|$)|taesd|tae_/.test(name))
    return /taesd|tae_/.test(name) ? 'taesd' : 'vae'
  if (/umt5|t5xxl|t5-xxl|t5_xxl/.test(name)) return 't5xxl'
  if (/clip_g|clip-g/.test(name)) return 'clip'
  if (/clip_l|clip-l|clip_vision|clip-vision/.test(name))
    return /vision/.test(name) ? 'clip_vision' : 'clip'
  if (/mmproj/.test(name)) return 'llm_vision'
  if (/qwen|gemma|llama|mistral|glm|text_encoder|text-encoder|llm/.test(name)) return 'llm'
  if (/controlnet|control_/.test(name)) return 'controlnet'
  if (/esrgan|upscal|4x|2x_/.test(name)) return 'upscale'
  return 'diffusion'
}

/** Quantization in a file name (Q4_K_M, Q8_0, fp8, bf16…), for sorting and labels. */
export function quantOf(name: string): string {
  const m =
    /(?:^|[-_.])(i?q\d(?:_[0-9a-z]+)*|f16|fp16|bf16|f32|fp8(?:_[a-z0-9]+)?|nf4)(?=[-_.]|$)/i.exec(
      name
    )
  return m ? m[1].toUpperCase() : ''
}

/** HF repos that repackage or quantize; an official repo makes a better picture. */
const REPACKAGERS =
  /^(leejet|city96|quantstack|unsloth|second-state|comfy-org|comfyanonymous|bullerwins|gguf-org|calcuis|mradermacher|bartowski)\//i
const NOT_A_MODEL = /text_encoders?|clip|t5|vae|lora|controlnet|upscal/i

/**
 * The Hugging Face repo that best stands for a family, from the links in its sd.cpp doc:
 * the one whose name shares the most words with the family, official over repackaged.
 */
export function pickFamilyRepo(familyName: string, familyId: string, links: string[]): string {
  const words = `${familyName} ${familyId}`
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((w) => w.length > 1)
  const repos = [
    ...new Set(
      links
        .map((l) => /huggingface\.co\/([\w.-]+\/[\w.-]+)/.exec(l)?.[1])
        .filter((r): r is string => !!r && !/^(datasets|spaces|docs|blog)\//.test(r))
    )
  ]
  let best = ''
  let bestScore = -Infinity
  repos.forEach((repo, index) => {
    const name = repo.toLowerCase()
    let score = words.filter((w) => name.includes(w)).length * 3 - index * 0.1
    if (REPACKAGERS.test(repo) || /gguf|quant/i.test(repo)) score -= 4
    if (NOT_A_MODEL.test(repo.split('/')[1])) score -= 6
    if (score > bestScore) {
      best = repo
      bestScore = score
    }
  })
  return best
}

/** First real picture in a model card (skips badges and logos). */
export function readmeImage(readme: string, repo: string): string {
  const candidates = [
    ...readme.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)|<img[^>]+src=["']([^"']+)["']/gi)
  ].map((m) => m[1] || m[2])
  for (const raw of candidates) {
    if (/shields\.io|badge|logo|icon|\.svg(\?|$)|github\.com\/[^/]+\/[^/]+\/actions/i.test(raw))
      continue
    if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:/, 'https:')
    const clean = raw.replace(/^\.?\//, '')
    if (clean.startsWith('data:')) continue
    return `https://huggingface.co/${repo}/resolve/main/${clean}`
  }
  return ''
}

/** Hugging Face's own preview card for a repo (always exists, even for gated repos). */
export function hfSocialThumbnail(repo: string): string {
  return `https://cdn-thumbnails.huggingface.co/social-thumbnails/models/${repo}.png`
}

export function isRepoId(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[\w.-]{1,96}\/[\w.-]{1,96}$/.test(value) && !value.includes('..')
  )
}

/* --------------------------- Quantized variants --------------------------- */

const QUANT_TOKEN =
  /([-_.])(i?q\d(?:_[0-9a-z]+)*|f16|fp16|bf16|f32|fp8(?:_[a-z0-9]+)?|nf4)(?=[-_.]|$)/i

/** Bits per weight a quantization roughly stands for (for tiers and sorting). */
export function quantBits(quant: string): number {
  const q = quant.toUpperCase()
  if (/^(F32)$/.test(q)) return 32
  if (/^(F16|FP16|BF16)$/.test(q)) return 16
  if (/^FP8/.test(q)) return 8
  if (q === 'NF4') return 4
  const digit = /Q(\d)/.exec(q)
  return digit ? Number(digit[1]) : 0
}

/** The same file in other quantizations: same folder, same name once the quant is removed. */
export function quantSiblings(path: string, allPaths: string[]): string[] {
  const key = (p: string): string | null =>
    QUANT_TOKEN.test(p) ? p.replace(QUANT_TOKEN, '$1*').toLowerCase() : null
  const own = key(path)
  if (!own) return []
  return allPaths
    .filter((p) => key(p) === own)
    .sort((a, b) => quantBits(quantOf(a)) - quantBits(quantOf(b)) || a.localeCompare(b))
}

export type QuantTier = 'small' | 'balanced' | 'quality'

export const QUANT_TIERS: Array<{ id: QuantTier; label: string; hint: string; maxBits: number }> = [
  { id: 'small', label: 'Small', hint: 'Q3–Q4, for 6–8 GB VRAM', maxBits: 4 },
  { id: 'balanced', label: 'Balanced', hint: 'Q5–Q6, for 10–12 GB VRAM', maxBits: 6 },
  { id: 'quality', label: 'Best quality', hint: 'Q8, for 16 GB VRAM and up', maxBits: 8 }
]

/** The highest-precision variant within a tier (the smallest one if none fits). */
export function pickForTier(paths: string[], tier: QuantTier): string {
  const max = QUANT_TIERS.find((t) => t.id === tier)?.maxBits ?? 8
  const ranked = [...paths].sort((a, b) => quantBits(quantOf(a)) - quantBits(quantOf(b)))
  const fitting = ranked.filter((p) => quantBits(quantOf(p)) <= max)
  // Prefer K-quants (Q4_K_M) over legacy ones (Q4_0) at the same bits
  const top = fitting.length ? quantBits(quantOf(fitting[fitting.length - 1])) : 0
  const best = fitting.filter((p) => quantBits(quantOf(p)) === top)
  return (
    best.find((p) => /_K_M/i.test(p)) ||
    best.find((p) => /_K/i.test(p)) ||
    best[best.length - 1] ||
    ranked[0] ||
    ''
  )
}

/** Repo and path of a Hugging Face resolve URL. */
export function parseHfUrl(url: string): { repo: string; path: string } | null {
  const m = /^https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\/[^/]+\/([^?#]+)/.exec(url)
  return m ? { repo: m[1], path: decodeURIComponent(m[2]) } : null
}
