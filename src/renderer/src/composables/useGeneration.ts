import { computed, ref, type Ref } from 'vue'
import { apiPost } from '@/services/api'
import { requestOpenLogs } from '@/lib/appEvents'
import type { useToast } from '@/composables/useToast'
import { useRemoteSession } from '@/composables/useRemoteSession'

export type GenerationSurface = 'text2image' | 'edit' | 'video' | 'upscale'

/**
 * Module-level busy flags shared across workspaces (single-flight client side).
 * Views own the HTTP call (buildGenerationPayload + apiPost/apiPostForm);
 * this module owns claim/release + shared isGenerating refs.
 */
const generationStatus: Record<GenerationSurface, Ref<boolean>> = {
  text2image: ref(false),
  edit: ref(false),
  video: ref(false),
  upscale: ref(false)
}

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
export function toastGenerationError(
  toast: ToastApi,
  err: unknown,
  fallback = 'Generation failed'
): void {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : fallback
  const { canControl } = useRemoteSession()
  toast.error(
    message,
    canControl.value
      ? {
          duration: 8000,
          action: {
            label: 'Open logs',
            onClick: () => requestOpenLogs()
          }
        }
      : { duration: 8000 }
  )
}

/**
 * Text2Image surface helpers (status + cancel). Generation HTTP lives in the view
 * so payload / FormData stay colocated with PhotoMaker and ControlNet uploads.
 */
export function useGeneration() {
  const { isGenerating } = useGenerationStatus('text2image')

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
    cancel
  }
}
