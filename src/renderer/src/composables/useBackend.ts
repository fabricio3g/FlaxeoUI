import { computed, ref } from 'vue'
import { apiGet, apiPost } from '@/services/api'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import { useConnection } from '@/composables/useConnection'
import {
  assetMatchesPlatform,
  backendVariantLabel,
  cudaRuntimeFor,
  pickBestBackendAsset
} from '../../../shared/backendRelease'

export interface InstalledBuild {
  version: string
  /** Release file it came from ('' for builds installed before this was recorded) */
  asset: string
  installedAt: number
  sizeBytes: number
}

export interface BackendConfig {
  activeVersion: string
  customBinaryExists: boolean
  installedVersions: string[]
  installed?: InstalledBuild[]
  activeBackendPath: string
  activeBackendValid: boolean
  activeBackendPlatformMismatch?: boolean
  hostPlatform?: string
  customDir?: string
}

export interface ReleaseAsset {
  name: string
  size: number
  url: string
}

export interface Release {
  tag: string
  name: string
  published: string
  assets: ReleaseAsset[]
}

export interface SystemInfo {
  platform: string
  arch: string
  note: string | null
  /** Detection hint, e.g. win-cuda12-x64 */
  variant?: string | null
}

export interface InstallState {
  id: string
  version: string
  asset: string
  status: 'downloading' | 'completed' | 'failed' | 'cancelled'
  receivedBytes: number
  totalBytes: number | null
  error?: string
}

interface DownloadTask {
  id: string
  status: InstallState['status']
  receivedBytes: number
  totalBytes: number | null
  error?: string
}

/* One engine store for Settings, the setup wizard and the title bar. */
const config = ref<BackendConfig>({
  activeVersion: '',
  customBinaryExists: false,
  installedVersions: [],
  activeBackendPath: '',
  activeBackendValid: false
})
const releases = ref<Release[]>([])
const releasesError = ref('')
const releasesLoading = ref(false)
const system = ref<SystemInfo>({ platform: '', arch: '', note: null })
const install = ref<InstallState | null>(null)
let pollTimer = 0

export function buildLabel(asset: string): string {
  return asset ? backendVariantLabel(asset) : 'Unknown build'
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

/**
 * The sd.cpp engine: what is installed and active, the published builds, the best one for
 * this computer, and installs with live progress (the server installs in the background).
 */
export function useBackend() {
  const { fetchCapabilities } = useBackendCapabilities()
  const connection = useConnection()

  const platform = computed(() => system.value.platform || config.value.hostPlatform || 'win32')
  const installed = computed<InstalledBuild[]>(
    () =>
      config.value.installed ||
      config.value.installedVersions.map((version) => ({
        version,
        asset: '',
        installedAt: 0,
        sizeBytes: 0
      }))
  )
  const activeBuild = computed(() =>
    installed.value.find((b) => b.version === config.value.activeVersion)
  )
  const latest = computed(() => releases.value[0] || null)

  /** Newest release + the build that suits this OS and GPU. */
  const recommended = computed(() => {
    const release = latest.value
    if (!release) return null
    const name = pickBestBackendAsset(release.assets, platform.value, system.value.variant)
    const asset = release.assets.find((a) => a.name === name)
    return asset ? { release, asset } : null
  })

  const updateAvailable = computed(
    () =>
      !!recommended.value &&
      config.value.activeBackendValid &&
      config.value.activeVersion !== 'custom' &&
      !installed.value.some((b) => b.version === recommended.value?.release.tag)
  )

  const isInstalling = computed(() => install.value?.status === 'downloading')

  function fitsThisComputer(asset: ReleaseAsset): boolean {
    return assetMatchesPlatform(asset.name, platform.value)
  }

  async function fetchConfig(): Promise<void> {
    try {
      config.value = await apiGet<BackendConfig>('/api/backend/config')
    } catch {
      /* the connection status explains an unreachable service */
    }
  }

  async function fetchReleases(): Promise<void> {
    releasesLoading.value = true
    try {
      releases.value = await apiGet<Release[]>('/api/backend/releases')
      releasesError.value = releases.value.length
        ? ''
        : 'No builds were found. GitHub may be rate limiting you; try again in a minute.'
    } catch (e) {
      releasesError.value =
        e instanceof Error
          ? `Could not reach GitHub: ${e.message}`
          : 'Could not reach GitHub. Check your internet connection.'
    } finally {
      releasesLoading.value = false
    }
  }

  async function detectSystem(): Promise<void> {
    try {
      system.value = await apiGet<SystemInfo>('/api/backend/detect')
    } catch {
      /* fall back to the host platform from the config */
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([fetchConfig(), detectSystem()])
    if (!releases.value.length) await fetchReleases()
  }

  async function afterChange(): Promise<void> {
    await fetchConfig()
    await fetchCapabilities(true)
    await connection.refreshConnection()
  }

  function pollInstall(): void {
    window.clearInterval(pollTimer)
    pollTimer = window.setInterval(async () => {
      const current = install.value
      if (!current) return window.clearInterval(pollTimer)
      try {
        const { downloads } = await apiGet<{ downloads: DownloadTask[] }>('/api/downloads')
        const task = downloads.find((t) => t.id === current.id)
        if (!task) return
        install.value = { ...current, ...task }
        if (task.status !== 'downloading') {
          window.clearInterval(pollTimer)
          if (task.status === 'completed') await afterChange()
        }
      } catch {
        /* keep polling; the service may be busy extracting */
      }
    }, 600)
  }

  /** Start installing; resolves when the build is ready (throws with the reason otherwise). */
  async function installBuild(release: Release, asset: ReleaseAsset): Promise<void> {
    const runtime = cudaRuntimeFor(release.assets, asset.name)
    const { id } = await apiPost<{ id: string }>('/api/backend/download', {
      url: asset.url,
      variant: asset.name,
      version: release.tag,
      runtimeUrl: runtime?.url
    })
    install.value = {
      id,
      version: release.tag,
      asset: asset.name,
      status: 'downloading',
      receivedBytes: 0,
      totalBytes: asset.size + (runtime?.size || 0) || null
    }
    pollInstall()
    await new Promise<void>((resolve, reject) => {
      const wait = window.setInterval(() => {
        const state = install.value
        if (!state || state.id !== id || state.status === 'downloading') return
        window.clearInterval(wait)
        if (state.status === 'completed') resolve()
        else reject(new Error(state.error || 'The install was cancelled.'))
      }, 300)
    })
  }

  async function cancelInstall(): Promise<void> {
    if (install.value) await apiPost(`/api/downloads/${install.value.id}/cancel`, {})
  }

  function dismissInstall(): void {
    if (!isInstalling.value) install.value = null
  }

  async function setActiveVersion(version: string): Promise<void> {
    await apiPost('/api/backend/set-active', { version })
    await afterChange()
  }

  async function removeBuild(version: string): Promise<void> {
    await apiPost('/api/backend/remove', { version })
    await fetchConfig()
  }

  /** Older callers (setup wizard): install and refresh. */
  async function downloadRelease(release: Release, asset?: ReleaseAsset): Promise<void> {
    const pick = asset || release.assets[0]
    if (pick) await installBuild(release, pick)
  }

  return {
    config,
    releases,
    releasesError,
    releasesLoading,
    system,
    install,
    installed,
    activeBuild,
    latest,
    recommended,
    updateAvailable,
    isInstalling,
    isDownloading: isInstalling,
    fitsThisComputer,
    fetchConfig,
    fetchReleases,
    detectSystem,
    refresh,
    installBuild,
    cancelInstall,
    dismissInstall,
    setActiveVersion,
    removeBuild,
    downloadRelease
  }
}
