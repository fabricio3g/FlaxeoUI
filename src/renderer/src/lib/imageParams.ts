/**
 * Shared types and helpers for PNG generation metadata (webui / sd.cpp style).
 */

export interface ImageGenerationParams {
  prompt?: string
  negative_prompt?: string
  negativePrompt?: string
  steps?: number
  cfg_scale?: number
  cfgScale?: number
  seed?: number
  width?: number
  height?: number
  sampler?: string
  scheduler?: string
  model?: string
  diffusionModel?: string
  guidance?: number
  clip_skip?: number
  clipSkip?: number
}

export type ImageParamsReuseMode = 'seed' | 'all'

export function galleryFilenameFromUrlOrPath(imagePath: string): string {
  if (!imagePath) return ''
  if (imagePath.startsWith('http')) {
    try {
      const url = new URL(imagePath)
      return decodeURIComponent(url.pathname.replace(/^\/output\//, ''))
    } catch {
      return imagePath
    }
  }
  if (imagePath.includes('/output/')) {
    return imagePath.split('/output/').pop() || imagePath
  }
  return imagePath.replace(/^.*[\\/]/, '')
}

export function normalizeImageParams(
  raw: Record<string, unknown> | null | undefined
): ImageGenerationParams {
  if (!raw || typeof raw !== 'object') return {}
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : undefined
  const negative =
    typeof raw.negative_prompt === 'string'
      ? raw.negative_prompt
      : typeof raw.negativePrompt === 'string'
        ? raw.negativePrompt
        : undefined
  const steps = numberOrUndefined(raw.steps)
  const cfg = numberOrUndefined(raw.cfg_scale ?? raw.cfgScale)
  const seed = numberOrUndefined(raw.seed)
  const width = numberOrUndefined(raw.width)
  const height = numberOrUndefined(raw.height)
  const sampler = typeof raw.sampler === 'string' ? raw.sampler : undefined
  const scheduler = typeof raw.scheduler === 'string' ? raw.scheduler : undefined
  const model =
    typeof raw.diffusionModel === 'string'
      ? raw.diffusionModel
      : typeof raw.model === 'string'
        ? raw.model
        : undefined
  const guidance = numberOrUndefined(raw.guidance)
  const clipSkip = numberOrUndefined(raw.clip_skip ?? raw.clipSkip)

  return {
    prompt,
    negative_prompt: negative,
    negativePrompt: negative,
    steps,
    cfg_scale: cfg,
    cfgScale: cfg,
    seed,
    width,
    height,
    sampler,
    scheduler,
    model,
    diffusionModel: model,
    guidance,
    clip_skip: clipSkip,
    clipSkip
  }
}

export function hasUsableImageParams(params: ImageGenerationParams): boolean {
  return Boolean(
    params.prompt ||
    params.seed != null ||
    params.steps != null ||
    params.width != null ||
    params.cfgScale != null ||
    params.cfg_scale != null
  )
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === '' || value == null) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}
