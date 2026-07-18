import { computed, ref } from 'vue'
import { apiGet, isRemoteBrowser } from '@/services/api'

export interface BackendProbeSlice {
  present?: boolean
  versionLine?: string
  flags?: string[]
  modes?: string[]
  error?: string
}

export interface BackendCapabilities {
  probed: boolean
  versionLine?: string
  flags: string[]
  modes: string[]
  error?: string
  /** CLI probe (same as flat flags/modes; soft-gates use CLI) */
  cli?: BackendProbeSlice
  /** sd-server --help probe (informational; generate path is still thin HTTP) */
  server?: BackendProbeSlice
}

const capabilities = ref<BackendCapabilities>({
  probed: false,
  flags: [],
  modes: []
})

const isProbing = ref(false)

/**
 * useBackendCapabilities() - Runtime sd-cli / sd-server --help probe cache
 * Soft-gates UI controls from CLI help; server slice is extra visibility.
 */
export function useBackendCapabilities() {
  const hasFlag = (flag: string): boolean => {
    if (!capabilities.value.probed) return true // optimistic until probed
    const normalized = flag.replace(/^--/, '')
    return capabilities.value.flags.some(
      (f) => f === flag || f === `--${normalized}` || f === normalized
    )
  }

  const hasMode = (mode: string): boolean => {
    if (!capabilities.value.probed) return true
    return capabilities.value.modes.includes(mode)
  }

  const supportsUpscale = computed(() => hasMode('upscale') || hasFlag('--upscale-model'))
  const supportsStreamLayers = computed(() => hasFlag('--stream-layers'))
  const supportsMaxVram = computed(() => hasFlag('--max-vram'))
  const supportsCacheMode = computed(() => hasFlag('--cache-mode'))
  const supportsVideoGen = computed(() => hasMode('vid_gen') || hasFlag('-M'))
  const supportsControlVideo = computed(() => hasFlag('--control-video'))
  const supportsHighNoise = computed(
    () =>
      hasFlag('--high-noise-diffusion-model') ||
      hasFlag('--high-noise-steps') ||
      hasFlag('--moe-boundary')
  )
  const supportsLivePreview = computed(
    () => hasFlag('--preview') || hasFlag('--preview-method') || hasFlag('--preview-path')
  )
  const supportsOffloadToCpu = computed(() => hasFlag('--offload-to-cpu'))
  const supportsDiffusionFa = computed(() => hasFlag('--diffusion-fa'))
  const supportsFlowShift = computed(() => hasFlag('--flow-shift'))
  const supportsFps = computed(() => hasFlag('--fps'))
  const supportsInpaint = computed(() => hasFlag('--mask'))
  /** YOLOv8 ADetailer (sd.cpp docs/adetailer.md). Soft-gate: older builds lack --ad-model. */
  const supportsAdetailer = computed(
    () => hasFlag('--ad-model') || hasFlag('--extra-ad-args') || hasMode('adetailer')
  )
  /** AnimateDiff motion module (sd.cpp docs/animatediff.md). */
  const supportsMotionModule = computed(() => hasFlag('--motion-module'))
  /**
   * PR #1780 unified ref processing. Master uses --ref-image-args; some mid-builds
   * advertised --ref-image-mode. Pessimistic until probed so old binaries never see the flag.
   */
  const supportsRefImageArgs = computed(() => {
    if (!capabilities.value.probed) return false
    return hasFlag('--ref-image-args') || hasFlag('--ref-image-mode')
  })

  /** CLI flag name this binary expects (when supportsRefImageArgs). */
  const refImageCliFlag = computed((): '--ref-image-args' | '--ref-image-mode' | null => {
    if (!capabilities.value.probed) return null
    if (hasFlag('--ref-image-args')) return '--ref-image-args'
    if (hasFlag('--ref-image-mode')) return '--ref-image-mode'
    return null
  })

  async function fetchCapabilities(force = false): Promise<BackendCapabilities> {
    if (isRemoteBrowser()) return capabilities.value
    if (isProbing.value) return capabilities.value
    if (capabilities.value.probed && !force) return capabilities.value

    isProbing.value = true
    try {
      const data = await apiGet<BackendCapabilities>('/api/backend/capabilities')
      capabilities.value = {
        probed: true,
        versionLine: data.versionLine,
        flags: Array.isArray(data.flags) ? data.flags : [],
        modes: Array.isArray(data.modes) ? data.modes : [],
        error: data.error,
        cli: data.cli,
        server: data.server
      }
    } catch (e) {
      capabilities.value = {
        probed: true,
        flags: [],
        modes: [],
        error: e instanceof Error ? e.message : 'Probe failed'
      }
    } finally {
      isProbing.value = false
    }
    return capabilities.value
  }

  return {
    capabilities,
    isProbing,
    hasFlag,
    hasMode,
    supportsUpscale,
    supportsStreamLayers,
    supportsMaxVram,
    supportsCacheMode,
    supportsVideoGen,
    supportsControlVideo,
    supportsHighNoise,
    supportsLivePreview,
    supportsOffloadToCpu,
    supportsDiffusionFa,
    supportsFlowShift,
    supportsFps,
    supportsInpaint,
    supportsAdetailer,
    supportsMotionModule,
    supportsRefImageArgs,
    refImageCliFlag,
    fetchCapabilities
  }
}
