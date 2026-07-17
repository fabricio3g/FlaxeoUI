import { ref } from 'vue'
import { apiGet } from '@/services/api'

export interface ModelCategories {
  diffusion: string[]
  uncondDiffusion: string[]
  loras: string[]
  vae: string[]
  audioVae: string[]
  llm: string[]
  llmVision: string[]
  t5xxl: string[]
  embeddingsConnectors: string[]
  clip: string[]
  clipG: string[]
  clipVision: string[]
  controlnet: string[]
  photomaker: string[]
  upscale: string[]
  hiresUpscalers: string[]
  taesd: string[]
  embeddings: string[]
  adetailer: string[]
  animatediff: string[]
}

const emptyModels = (): ModelCategories => ({
  diffusion: [],
  uncondDiffusion: [],
  loras: [],
  vae: [],
  audioVae: [],
  llm: [],
  llmVision: [],
  t5xxl: [],
  embeddingsConnectors: [],
  clip: [],
  clipG: [],
  clipVision: [],
  controlnet: [],
  photomaker: [],
  upscale: [],
  hiresUpscalers: [],
  taesd: [],
  embeddings: [],
  adetailer: [],
  animatediff: []
})

/** Module-level singleton — all callers share one list (avoids N× /api/models on mount). */
const models = ref<ModelCategories>(emptyModels())
const isLoading = ref(false)
const error = ref('')
const lastFetchedAt = ref(0)
let inflight: Promise<void> | null = null

export interface FetchModelsOptions {
  /** Bypass short client TTL and request server refresh */
  force?: boolean
}

/**
 * useModels() - Shared model file lists across App / Config / Gallery / Quant / Setup.
 */
export function useModels() {
  /**
   * fetchModels() - Fetches available models from /api/models
   * Concurrent callers share one in-flight request.
   */
  async function fetchModels(options: FetchModelsOptions = {}): Promise<void> {
    if (inflight) {
      if (!options.force) return inflight
      await inflight
    }

    // Soft client TTL (2s) — rapid remounts (route switches) reuse memory
    if (!options.force && lastFetchedAt.value && Date.now() - lastFetchedAt.value < 2000) {
      return
    }

    isLoading.value = true
    const force = options.force === true
    inflight = (async () => {
      try {
        error.value = ''
        const endpoint = force ? '/api/models?refresh=1' : '/api/models'
        const data = await apiGet<Partial<ModelCategories>>(endpoint)
        models.value = { ...emptyModels(), ...data }
        lastFetchedAt.value = Date.now()
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'Model list unavailable'
        console.error('Failed to fetch models:', e)
      } finally {
        isLoading.value = false
        inflight = null
      }
    })()

    return inflight
  }

  return {
    models,
    isLoading,
    error,
    lastFetchedAt,
    fetchModels
  }
}
