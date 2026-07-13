import { computed, ref } from 'vue'
import { apiGet, isRemoteBrowser } from '@/services/api'

export interface BackendCapabilities {
  probed: boolean
  versionLine?: string
  flags: string[]
  modes: string[]
  error?: string
}

const capabilities = ref<BackendCapabilities>({
  probed: false,
  flags: [],
  modes: []
})

const isProbing = ref(false)

/**
 * useBackendCapabilities() - Runtime sd-cli --help probe cache
 * Soft-gates UI controls when the active binary lacks a flag/mode.
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
        error: data.error
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
    fetchCapabilities
  }
}
