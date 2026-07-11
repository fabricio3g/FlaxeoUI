import type { AppContext } from './types'
import { listFiles, modelDirectory } from './utils'

/** Avoid re-walking 16+ model trees on every poll; invalidate after downloads/convert. */
const MODELS_CACHE_TTL_MS = 8000

let modelsCache: { at: number; payload: Record<string, string[]> } | null = null

export function invalidateModelsCache(): void {
  modelsCache = null
}

export function buildModelsPayload(ctx: AppContext): Record<string, string[]> {
  const modelDir = (subdir: string) => modelDirectory(ctx, subdir)
  return {
    diffusion: listFiles(modelDir('diffusion')),
    uncondDiffusion: listFiles(modelDir('uncond_diffusion')),
    loras: listFiles(modelDir('loras')),
    vae: listFiles(modelDir('vae')),
    audioVae: listFiles(modelDir('audio_vae')),
    llm: listFiles(modelDir('llm')),
    llmVision: listFiles(modelDir('llm_vision')),
    t5xxl: listFiles(modelDir('t5xxl')),
    embeddingsConnectors: listFiles(modelDir('embeddings_connectors')),
    clip: listFiles(modelDir('clip')),
    clipG: listFiles(modelDir('clip')),
    clipVision: listFiles(modelDir('clip_vision')),
    controlnet: listFiles(modelDir('controlnet')),
    photomaker: listFiles(modelDir('photomaker')),
    upscale: listFiles(modelDir('upscale')),
    hiresUpscalers: listFiles(modelDir('hires_upscalers')),
    taesd: listFiles(modelDir('taesd')),
    embeddings: listFiles(modelDir('embeddings'))
  }
}

export function getModelsPayload(ctx: AppContext, forceRefresh = false): Record<string, string[]> {
  if (!forceRefresh && modelsCache && Date.now() - modelsCache.at < MODELS_CACHE_TTL_MS) {
    return modelsCache.payload
  }
  const payload = buildModelsPayload(ctx)
  modelsCache = { at: Date.now(), payload }
  return payload
}
