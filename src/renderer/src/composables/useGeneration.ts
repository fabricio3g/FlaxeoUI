import { computed, ref, type Ref } from 'vue'
import { apiPost } from '@/services/api'
import { requestOpenLogs } from '@/lib/appEvents'
import type { useToast } from '@/composables/useToast'

export type GenerationSurface = 'text2image' | 'edit' | 'video' | 'upscale'

export interface GenerationParams {
  prompt: string
  negative_prompt?: string
  steps?: number
  cfg_scale?: number
  width?: number
  height?: number
  seed?: number
  diffusionModel?: string
  vae?: string
  loadMode?: 'standard' | 'split'
  guidance?: number
  scheduler?: string
  samplingMethod?: string
  [key: string]: unknown
}

/**
 * Module-level busy flags shared across workspaces (single-flight client side).
 */
const generationStatus: Record<GenerationSurface, Ref<boolean>> = {
  text2image: ref(false),
  edit: ref(false),
  video: ref(false),
  upscale: ref(false)
}

const progress = ref(0)
const previewImage = ref<string | null>(null)
const generatedFiles = ref<string[]>([])
const error = ref<string | null>(null)

export function useGenerationStatus(surface: GenerationSurface) {
  return {
    isGenerating: generationStatus[surface]
  }
}

/** True if any CLI-backed surface is busy (generate / edit / video / upscale). */
export function isAnyGenerationBusy(): boolean {
  return Object.values(generationStatus).some((surface) => surface.value)
}

export function useGenerationBusy() {
  const busy = computed(() => isAnyGenerationBusy())
  return { busy, isAnyGenerationBusy }
}

/**
 * Try to claim a surface for generation. Returns false if any surface is busy.
 */
export function claimGeneration(surface: GenerationSurface): boolean {
  if (isAnyGenerationBusy()) return false
  generationStatus[surface].value = true
  return true
}

export function releaseGeneration(surface: GenerationSurface): void {
  generationStatus[surface].value = false
}

type ToastApi = ReturnType<typeof useToast>

/**
 * Show a generation failure toast with an Open logs action.
 */
export function toastGenerationError(toast: ToastApi, err: unknown, fallback = 'Generation failed'): void {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : fallback
  toast.error(message, {
    duration: 8000,
    action: {
      label: 'Open logs',
      onClick: () => requestOpenLogs()
    }
  })
}

export function useGeneration() {
  const { isGenerating } = useGenerationStatus('text2image')

  /**
   * generateImage() - Initiates image generation via /api/generate-cli
   * Prefer view-level handlers that use buildGenerationPayload; kept for simple JSON posts.
   */
  async function generateImage(params: GenerationParams): Promise<void> {
    if (!claimGeneration('text2image')) {
      error.value = 'Another generation is already running'
      return
    }
    error.value = null
    progress.value = 0

    try {
      const result = await apiPost<{ message: string; filenames?: string[] }>(
        '/api/generate-cli',
        params
      )

      if (result.filenames) {
        generatedFiles.value = result.filenames
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Generation failed'
    } finally {
      releaseGeneration('text2image')
      progress.value = 100
    }
  }

  async function cancel(): Promise<void> {
    try {
      await apiPost('/api/cancel-cli', {})
    } catch (e) {
      console.error('Cancel failed:', e)
    }
    releaseGeneration('text2image')
  }

  return {
    isGenerating,
    progress,
    previewImage,
    generatedFiles,
    error,
    generateImage,
    cancel
  }
}
