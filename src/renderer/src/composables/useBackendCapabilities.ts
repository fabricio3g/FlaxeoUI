import { computed, ref } from 'vue'
import { apiGet } from '@/services/api'

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

  async function fetchCapabilities(force = false): Promise<BackendCapabilities> {
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
    fetchCapabilities
  }
}
