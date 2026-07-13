<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type Component } from 'vue'
import { renderSVG } from 'uqr'
import { apiGet, apiPost } from '@/services/api'
import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
  Sun
} from '@/lib/icons'
import Select from '@/components/ui/Select.vue'
import { useSetup } from '@/composables/useSetup'
import { useTheme, type ThemePreference } from '@/composables/useTheme'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import {
  isModelDirectoryKey,
  type StorageDirectoryId,
  type StorageSettings
} from '../../../shared/storage'
import type { LanAccessLevel, LanSharingStatus, LanTransport } from '../../../shared/lan'
import { setRemoteAccessLevel, useRemoteSession } from '@/composables/useRemoteSession'

const { reopenSetup } = useSetup()
const { themePreference, setTheme } = useTheme()
const { fetchCapabilities } = useBackendCapabilities()
const { isRemote, accessLevel } = useRemoteSession()

type SettingsCategory = 'backend' | 'installation' | 'network' | 'storage' | 'appearance'

const desktopSettingsAvailable = Boolean(window.electronAPI)
const activeCategory = ref<SettingsCategory>(desktopSettingsAvailable ? 'backend' : 'appearance')
const allSettingsCategories: Array<{
  id: SettingsCategory
  label: string
  description: string
  icon: Component
}> = [
  {
    id: 'backend',
    label: 'Backend',
    description: 'Runtime selection, binary health, and API status.',
    icon: Database
  },
  {
    id: 'installation',
    label: 'Installation',
    description: 'Download and install compatible backend releases.',
    icon: Download
  },
  {
    id: 'network',
    label: 'Network',
    description: 'Control encrypted and authenticated access from your local network.',
    icon: Activity
  },
  {
    id: 'storage',
    label: 'Storage',
    description: 'Choose where generated images, temporary files, and models are stored.',
    icon: FolderOpen
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Choose how Flaxeo follows light and dark mode.',
    icon: Sun
  }
]
const settingsCategories = computed(() =>
  desktopSettingsAvailable
    ? allSettingsCategories
    : allSettingsCategories.filter((category) => category.id === 'appearance')
)

const activeCategoryDetails = computed(
  () => settingsCategories.value.find((category) => category.id === activeCategory.value)!
)

const themeOptions: Array<{
  value: ThemePreference
  label: string
}> = [
  { value: 'light', label: 'White' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
]

const storageLocations = [
  { id: 'output', label: 'Image output' },
  { id: 'temp', label: 'Temporary files' }
] as const

const modelLocations = [
  { id: 'diffusion', label: 'Diffusion (including high-noise)' },
  { id: 'uncond_diffusion', label: 'Unconditional diffusion' },
  { id: 'vae', label: 'VAE' },
  { id: 'audio_vae', label: 'Audio VAE' },
  { id: 'llm', label: 'LLM' },
  { id: 'llm_vision', label: 'Vision LLM' },
  { id: 't5xxl', label: 'T5-XXL' },
  { id: 'embeddings_connectors', label: 'Embedding connector models' },
  { id: 'clip', label: 'CLIP encoders (CLIP-L / CLIP-G)' },
  { id: 'clip_vision', label: 'CLIP Vision' },
  { id: 'loras', label: 'LoRAs' },
  { id: 'controlnet', label: 'ControlNet' },
  { id: 'photomaker', label: 'PhotoMaker' },
  { id: 'upscale', label: 'Image upscalers' },
  { id: 'hires_upscalers', label: 'Hi-res upscalers' },
  { id: 'taesd', label: 'TAESD' },
  { id: 'embeddings', label: 'Textual embeddings' }
] as const

const storageSettings = ref<StorageSettings | null>(null)
const storageBusy = ref<StorageDirectoryId | null>(null)
const storageError = ref('')

interface BackendConfig {
  activeVersion: string
  customBinaryExists: boolean
  installedVersions: string[]
  activeBackendPath: string
  activeBackendValid: boolean
}

interface ReleaseAsset {
  name: string
  size: number
  url: string
}

interface Release {
  tag: string
  name: string
  published: string
  assets: ReleaseAsset[]
}

interface SystemInfo {
  platform: string
  arch: string
  note: string
}

// Backend state
const config = ref<BackendConfig>({
  activeVersion: 'custom',
  customBinaryExists: false,
  installedVersions: [],
  activeBackendPath: '',
  activeBackendValid: false
})

const releases = ref<Release[]>([])
const systemInfo = ref<SystemInfo>({ platform: '', arch: '', note: '' })
const selectedRelease = ref('')
const selectedVariant = ref('')
const isDownloading = ref(false)
const downloadStatus = ref('')
const serverOnline = ref(false)

// Network state
const lanStatus = ref<LanSharingStatus | null>(null)
const lanAddress = ref('')
const lanTransport = ref<LanTransport>('https')
const lanAccessLevel = ref<LanAccessLevel>('generation')
const lanBusy = ref(false)
const lanError = ref('')
const lanPairingUrl = computed(() => {
  const status = lanStatus.value
  if (!status?.url || !status.pairingCode) return ''
  return `${status.url}/#pair=${encodeURIComponent(status.pairingCode)}`
})
const lanQrSvg = computed(() =>
  lanPairingUrl.value ? renderSVG(lanPairingUrl.value, { ecc: 'M', border: 2 }) : ''
)

// Get variants for selected release
const selectedReleaseAssets = computed(() => {
  const release = releases.value.find((r) => r.tag === selectedRelease.value)
  return release?.assets || []
})

/**
 * fetchConfig() - Fetches current backend configuration
 */
async function fetchConfig(): Promise<void> {
  try {
    const data = await apiGet<BackendConfig>('/api/backend/config')
    config.value = data
  } catch (e) {
    console.error('Failed to fetch backend config:', e)
  }
}

/**
 * fetchReleases() - Fetches available releases from GitHub API
 */
async function fetchReleases(): Promise<void> {
  try {
    const data = await apiGet<Release[]>('/api/backend/releases')
    releases.value = data
    // Auto-select first release
    if (data.length > 0 && !selectedRelease.value) {
      selectedRelease.value = data[0].tag
    }
  } catch (e) {
    console.error('Failed to fetch releases:', e)
  }
}

/**
 * detectSystem() - Detect system info for binary recommendation
 */
async function detectSystem(): Promise<void> {
  try {
    const data = await apiGet<SystemInfo>('/api/backend/detect')
    systemInfo.value = data
    // Auto-select best variant
    autoSelectVariant()
  } catch (e) {
    console.error('Failed to detect system:', e)
  }
}

/**
 * autoSelectVariant() - Auto select best variant based on system
 */
function autoSelectVariant(): void {
  if (selectedReleaseAssets.value.length === 0) return

  const platform = systemInfo.value.platform

  // Find matching variant
  let best = selectedReleaseAssets.value[0]
  for (const asset of selectedReleaseAssets.value) {
    const name = asset.name.toLowerCase()
    if (platform === 'win32' && name.includes('win')) {
      if (name.includes('cuda') || name.includes('vulkan')) {
        best = asset
        break
      }
      best = asset
    } else if (platform === 'darwin' && name.includes('macos')) {
      best = asset
    } else if (platform === 'linux' && name.includes('ubuntu')) {
      best = asset
    }
  }
  selectedVariant.value = best.name
}

// Watch for release change to update variants
watch(selectedRelease, () => {
  autoSelectVariant()
})

/**
 * checkServerStatus() - Check if server is online
 */
async function checkServerStatus(): Promise<void> {
  try {
    await apiGet('/api/status')
    serverOnline.value = true
  } catch {
    serverOnline.value = false
  }
}

async function refreshLanStatus(): Promise<void> {
  if (!window.electronAPI?.getLanSharingStatus) return
  try {
    lanError.value = ''
    lanStatus.value = await window.electronAPI.getLanSharingStatus()
    lanAddress.value =
      lanStatus.value.selectedAddress || lanStatus.value.interfaces[0]?.address || ''
    lanTransport.value = lanStatus.value.transport
    lanAccessLevel.value = lanStatus.value.accessLevel
    if (lanStatus.value.error) lanError.value = lanStatus.value.error
  } catch (error) {
    lanError.value = error instanceof Error ? error.message : 'Failed to load LAN sharing status.'
  }
}

async function setLanSharing(enabled: boolean): Promise<void> {
  if (!window.electronAPI?.setLanSharing) return
  try {
    lanBusy.value = true
    lanError.value = ''
    lanStatus.value = await window.electronAPI.setLanSharing(enabled, {
      address: lanAddress.value || undefined,
      transport: lanTransport.value,
      accessLevel: lanAccessLevel.value
    })
    lanTransport.value = lanStatus.value.transport
    lanAccessLevel.value = lanStatus.value.accessLevel
  } catch (error) {
    lanError.value = error instanceof Error ? error.message : 'Failed to change LAN sharing.'
    await refreshLanStatus()
  } finally {
    lanBusy.value = false
  }
}

async function applyLanAddress(): Promise<void> {
  if (lanStatus.value?.enabled) await setLanSharing(true)
}

async function rotateLanPairingCode(): Promise<void> {
  try {
    lanBusy.value = true
    lanStatus.value = await window.electronAPI.rotateLanPairingCode()
  } catch (error) {
    lanError.value = error instanceof Error ? error.message : 'Failed to rotate pairing code.'
  } finally {
    lanBusy.value = false
  }
}

async function revokeLanSessions(): Promise<void> {
  try {
    lanBusy.value = true
    lanStatus.value = await window.electronAPI.revokeLanSessions()
  } catch (error) {
    lanError.value = error instanceof Error ? error.message : 'Failed to revoke paired devices.'
  } finally {
    lanBusy.value = false
  }
}

async function revokeLanSession(deviceId: string): Promise<void> {
  try {
    lanBusy.value = true
    lanStatus.value = await window.electronAPI.revokeLanSession(deviceId)
  } catch (error) {
    lanError.value = error instanceof Error ? error.message : 'Failed to revoke paired device.'
  } finally {
    lanBusy.value = false
  }
}

async function exportLanCaCertificate(): Promise<void> {
  try {
    lanError.value = ''
    await window.electronAPI.exportLanCaCertificate()
  } catch (error) {
    lanError.value = error instanceof Error ? error.message : 'Failed to export certificate.'
  }
}

function pairedDeviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser'
  const platform = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iPhone / iPad'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'unknown device'
  return `${browser} on ${platform}`
}

/**
 * downloadAndInstall() - Downloads and installs selected release variant
 */
async function downloadAndInstall(): Promise<void> {
  if (!selectedRelease.value || !selectedVariant.value || isDownloading.value) return

  const asset = selectedReleaseAssets.value.find((a) => a.name === selectedVariant.value)
  if (!asset) return

  isDownloading.value = true
  downloadStatus.value = 'Downloading...'

  try {
    await apiPost('/api/backend/download', {
      url: asset.url,
      variant: asset.name,
      version: selectedRelease.value
    })

    downloadStatus.value = 'Installation complete!'
    await fetchConfig()

    setTimeout(() => {
      downloadStatus.value = ''
    }, 3000)
  } catch (e) {
    downloadStatus.value = 'Download failed: ' + (e instanceof Error ? e.message : 'Unknown error')
  } finally {
    isDownloading.value = false
  }
}

/**
 * setActiveVersion() - Sets the active backend version
 */
async function setActiveVersion(version: string): Promise<void> {
  try {
    await apiPost('/api/backend/set-active', { version })
    await fetchConfig()
    await fetchCapabilities(true)
  } catch (e) {
    console.error('Failed to set version:', e)
  }
}

/**
 * openCustomFolder() - Open the custom backend folder
 */
function openCustomFolder(): void {
  window.electronAPI?.openCustomFolder()
}

/**
 * copyUrl() - Copy URL to clipboard
 */
async function copyUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

async function disconnectRemoteSession(): Promise<void> {
  try {
    await apiPost('/api/auth/logout', {})
  } finally {
    setRemoteAccessLevel(null)
    window.location.reload()
  }
}

const remoteAccessDescription = computed(() => {
  if (accessLevel.value === 'control') return 'Generation, gallery, runtime, and log controls'
  if (accessLevel.value === 'gallery') return 'Generation and read-only gallery access'
  return 'Generation and model selection only'
})

function storagePath(id: StorageDirectoryId): string {
  const settings = storageSettings.value
  if (!settings) return ''
  if (id === 'modelsRoot') return settings.modelsRootDir
  if (id === 'output') return settings.outputDir
  if (id === 'temp') return settings.tempDir
  return settings.modelDirs[id]
}

function storageIsCustom(id: StorageDirectoryId): boolean {
  const overrides = storageSettings.value?.overrides
  if (!overrides) return false
  if (id === 'modelsRoot') return !!overrides.modelsRootDir
  if (id === 'output') return !!overrides.outputDir
  if (id === 'temp') return !!overrides.tempDir
  return isModelDirectoryKey(id) && !!overrides.modelDirs?.[id]
}

async function loadStorageSettings(): Promise<void> {
  if (!window.electronAPI?.getStorageSettings) {
    storageError.value = 'Storage locations can only be changed in the desktop app.'
    return
  }

  try {
    storageError.value = ''
    storageSettings.value = await window.electronAPI.getStorageSettings()
  } catch (error) {
    storageError.value =
      error instanceof Error ? error.message : 'Failed to load storage locations.'
  }
}

async function chooseStorageDirectory(id: StorageDirectoryId): Promise<void> {
  try {
    storageBusy.value = id
    storageError.value = ''
    const updated = await window.electronAPI.chooseStorageDirectory(id)
    if (updated) storageSettings.value = updated
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Failed to change directory.'
  } finally {
    storageBusy.value = null
  }
}

async function resetStorageDirectory(id: StorageDirectoryId): Promise<void> {
  try {
    storageBusy.value = id
    storageError.value = ''
    storageSettings.value = await window.electronAPI.resetStorageDirectory(id)
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Failed to reset directory.'
  } finally {
    storageBusy.value = null
  }
}

async function openStorageDirectory(id: StorageDirectoryId): Promise<void> {
  try {
    storageError.value = ''
    await window.electronAPI.openStorageDirectory(id)
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Failed to open directory.'
  }
}

onMounted(async () => {
  if (!desktopSettingsAvailable) return
  await loadStorageSettings()
  await checkServerStatus()
  await fetchConfig()
  await fetchReleases()
  await detectSystem()
  await refreshLanStatus()
})

const lanStatusTimer = window.setInterval(() => {
  if (lanStatus.value?.enabled) void refreshLanStatus()
}, 5000)

onUnmounted(() => window.clearInterval(lanStatusTimer))
</script>

<template>
  <div
    class="workspace-view flex h-full min-h-0 flex-col bg-background text-foreground md:flex-row"
  >
    <aside
      class="shrink-0 border-b border-border/80 bg-muted/15 px-3 py-3 md:w-44 md:border-b-0 md:border-r md:px-3 md:py-5"
    >
      <nav
        class="no-scrollbar flex gap-1 overflow-x-auto pr-12 md:flex-col md:overflow-visible md:pr-0"
        aria-label="Settings categories"
      >
        <button
          v-for="category in settingsCategories"
          :key="category.id"
          type="button"
          class="inline-flex h-9 shrink-0 items-center gap-2.5 rounded-md px-3 text-left text-sm font-normal transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:w-full"
          :class="
            activeCategory === category.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :aria-current="activeCategory === category.id ? 'page' : undefined"
          @click="activeCategory = category.id"
        >
          <component :is="category.icon" class="size-4 shrink-0" />
          <span>{{ category.label }}</span>
        </button>
      </nav>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="aui-scroll-header bg-background px-4 py-4 pr-14 md:px-6 md:py-5">
        <h2 id="settings-title" class="text-lg font-semibold tracking-[-0.02em]">
          {{ activeCategoryDetails.label }}
        </h2>
        <p class="mt-1 text-sm leading-5 text-muted-foreground">
          {{ activeCategoryDetails.description }}
        </p>
        <div class="aui-scroll-header__fade" aria-hidden="true" />
      </header>

      <div class="flex-1 overflow-y-auto p-4 md:p-6">
        <div class="mx-auto w-full max-w-2xl space-y-4">
          <section
            v-if="activeCategory === 'backend'"
            class="fade-in animate-in overflow-hidden duration-200"
          >
            <div class="flex flex-wrap items-center justify-end gap-3 px-1 pb-4">
              <button
                type="button"
                @click="reopenSetup"
                title="Run setup wizard"
                class="inline-flex h-8 items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <RefreshCw class="size-3.5" />
                Setup wizard
              </button>
              <button
                type="button"
                @click="openCustomFolder"
                title="Open custom folder"
                class="inline-flex h-8 items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <FolderOpen class="size-3.5" />
                Custom folder
              </button>
            </div>

            <div
              class="flex flex-col gap-3 px-1 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="aui-label text-[11px] font-medium text-muted-foreground">
                  Active version
                </p>
                <p class="mt-1 truncate text-sm font-medium">
                  {{ config.activeVersion || 'Not configured' }}
                </p>
              </div>
              <span
                class="aui-status-badge inline-flex w-fit items-center gap-1.5 text-[10px] font-medium"
                :class="config.activeBackendValid ? 'text-foreground' : 'text-destructive'"
              >
                <span
                  class="size-1.5 rounded-full"
                  :class="config.activeBackendValid ? 'bg-foreground' : 'bg-destructive'"
                ></span>
                {{ config.activeBackendValid ? 'Valid binary' : 'Binary not found' }}
              </span>
            </div>

            <div
              v-if="config.installedVersions.length > 0 || config.customBinaryExists"
              class="mt-4 px-1 pt-2"
            >
              <label class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
                >Switch version</label
              >
              <Select
                :model-value="config.activeVersion"
                @update:model-value="(val) => setActiveVersion(val)"
                size="md"
                class="aui-field sm:max-w-sm"
                :options="[
                  {
                    label: `Custom ${config.customBinaryExists ? '(Found)' : '(Not Found)'}`,
                    value: 'custom'
                  },
                  ...config.installedVersions.map((v) => ({ label: v, value: v }))
                ]"
              />
            </div>

            <div v-if="!config.activeBackendValid" class="mt-4">
              <div
                class="aui-alert flex items-start gap-2 bg-linear-to-r from-muted/50 to-transparent px-3 py-2.5 text-xs leading-5 text-muted-foreground"
              >
                <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-foreground" />
                <span
                  >Place sd-cli and sd-server binaries in the custom folder, or download a release
                  below.</span
                >
              </div>
            </div>

            <div
              v-if="systemInfo.platform"
              class="mt-4 flex flex-col gap-1 px-1 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="aui-label text-[11px] font-medium text-muted-foreground">
                  Detected system
                </p>
                <p class="mt-0.5 text-xs font-medium">
                  {{
                    systemInfo.platform === 'win32'
                      ? 'Windows'
                      : systemInfo.platform === 'darwin'
                        ? 'macOS'
                        : 'Linux'
                  }}
                  <span class="font-normal text-muted-foreground">({{ systemInfo.arch }})</span>
                </p>
              </div>
              <p
                v-if="systemInfo.note"
                class="max-w-md text-[11px] text-muted-foreground sm:text-right"
              >
                {{ systemInfo.note }}
              </p>
            </div>
          </section>

          <section
            v-if="activeCategory === 'installation'"
            class="aui-dialog-surface overflow-hidden rounded-lg border border-border/70 bg-card"
          >
            <div class="space-y-4 p-4">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
                    >Release version</label
                  >
                  <Select
                    v-model="selectedRelease"
                    size="md"
                    class="aui-field"
                    placeholder="Select version..."
                    :options="
                      releases.map((r) => ({ label: `${r.tag} - ${r.name}`, value: r.tag }))
                    "
                  />
                </div>
                <div>
                  <label
                    class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
                    >Binary variant</label
                  >
                  <Select
                    v-model="selectedVariant"
                    size="md"
                    class="aui-field"
                    placeholder="Select variant..."
                    :options="selectedReleaseAssets.map((a) => ({ label: a.name, value: a.name }))"
                  />
                </div>
              </div>

              <div
                v-if="downloadStatus"
                class="aui-alert rounded-lg border px-3 py-2.5 text-xs"
                :class="
                  downloadStatus.includes('failed')
                    ? 'border-destructive/25 bg-destructive/10 text-destructive'
                    : 'border-border bg-muted/30 text-foreground'
                "
              >
                {{ downloadStatus }}
              </div>

              <button
                type="button"
                @click="downloadAndInstall"
                :disabled="!selectedRelease || !selectedVariant || isDownloading"
                class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <Loader2 v-if="isDownloading" class="size-4 animate-spin" />
                <Download v-else class="size-4" />
                {{ isDownloading ? 'Downloading...' : 'Download & Install' }}
              </button>

              <div
                v-if="releases.length === 0"
                class="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"
              >
                <Loader2 class="size-3.5 animate-spin" />
                <span>Loading releases...</span>
              </div>
            </div>
          </section>

          <section
            v-if="activeCategory === 'network'"
            class="aui-dialog-surface overflow-hidden rounded-lg border border-border/70 bg-card"
          >
            <div class="px-4 py-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-medium">Localhost</p>
                  <p class="mt-1 text-[11px] leading-4 text-muted-foreground">
                    Used internally by the desktop app. It remains private to this computer.
                  </p>
                </div>
                <span
                  class="aui-status-badge inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[10px] font-medium text-foreground"
                >
                  <span class="size-1.5 rounded-full bg-foreground"></span>
                  Always on
                </span>
              </div>
            </div>

            <div class="border-t border-border/70 px-4 py-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-medium">Local network sharing</p>
                  <p class="mt-1 text-[11px] leading-4 text-muted-foreground">
                    Share the generation interface with paired devices on one private network
                    adapter.
                  </p>
                </div>
                <label class="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    :checked="lanStatus?.enabled"
                    :disabled="lanBusy || !lanStatus?.interfaces.length"
                    @change="setLanSharing(!lanStatus?.enabled)"
                    class="peer sr-only"
                    aria-label="Toggle local network sharing"
                  />
                  <span
                    class="h-5 w-9 rounded-md border border-border bg-muted transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-sm after:border after:border-border after:bg-background after:shadow-sm after:transition-transform after:duration-200 after:content-[''] peer-checked:bg-foreground peer-checked:after:translate-x-4 peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30"
                  ></span>
                </label>
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <label class="block text-[11px] font-medium text-muted-foreground">
                  Connection mode
                  <select
                    v-model="lanTransport"
                    :disabled="lanBusy"
                    @change="applyLanAddress"
                    class="aui-field mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="https">Secure HTTPS</option>
                    <option value="http">Quick HTTP</option>
                  </select>
                </label>
                <label class="block text-[11px] font-medium text-muted-foreground">
                  Paired device access
                  <select
                    v-model="lanAccessLevel"
                    :disabled="lanBusy || lanTransport === 'http'"
                    @change="applyLanAddress"
                    class="aui-field mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="generation">Generation only</option>
                    <option value="gallery">Generation + gallery</option>
                    <option value="control">Full safe remote control</option>
                  </select>
                </label>
              </div>

              <div
                v-if="lanTransport === 'http'"
                class="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-800 dark:text-amber-300"
              >
                Quick HTTP is not encrypted, allows generation only, expires after 15 minutes, and
                is disabled after restart. Use it only on a trusted home network.
              </div>
              <div
                v-else-if="lanAccessLevel === 'control'"
                class="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-800 dark:text-amber-300"
              >
                Full remote control includes safe runtime and log controls. Backend installation,
                storage, certificates, downloads, and security settings always remain desktop-only.
              </div>

              <label class="mt-4 block text-[11px] font-medium text-muted-foreground">
                Network adapter
                <select
                  v-model="lanAddress"
                  :disabled="lanBusy"
                  @change="applyLanAddress"
                  class="aui-field mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option
                    v-for="item in lanStatus?.interfaces || []"
                    :key="item.address"
                    :value="item.address"
                  >
                    {{ item.name }} — {{ item.address }}
                  </option>
                </select>
              </label>

              <div
                v-if="lanError"
                class="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {{ lanError }}
              </div>

              <template v-if="lanStatus?.enabled && lanPairingUrl">
                <div class="mt-4 grid gap-4 sm:grid-cols-[164px_1fr]">
                  <div
                    class="overflow-hidden rounded-md border border-border bg-white p-2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                    v-html="lanQrSvg"
                  ></div>
                  <div class="min-w-0 text-[11px] leading-4 text-muted-foreground">
                    <p class="font-medium text-foreground">Scan to pair</p>
                    <p v-if="lanStatus.transport === 'https'" class="mt-1">
                      Install and trust the Flaxeo certificate before pairing. Never bypass a
                      browser certificate warning.
                    </p>
                    <p v-else class="mt-1">
                      Quick sharing is unencrypted and intended only for a trusted home network.
                    </p>
                    <button
                      type="button"
                      @click="copyUrl(lanPairingUrl)"
                      class="aui-field mt-3 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 font-mono text-[10px] hover:bg-muted/40"
                    >
                      <span class="truncate">{{ lanStatus.url }}</span>
                      <Copy class="size-3.5 shrink-0" />
                    </button>
                    <p class="mt-2 font-mono text-foreground">Code: {{ lanStatus.pairingCode }}</p>
                    <p v-if="lanStatus.pairingExpiresAt" class="mt-1">
                      Expires {{ new Date(lanStatus.pairingExpiresAt).toLocaleTimeString() }}
                    </p>
                  </div>
                </div>

                <div
                  v-if="lanStatus.transport === 'https'"
                  class="mt-4 rounded-md bg-muted/30 p-3 text-[10px] leading-4 text-muted-foreground"
                >
                  <p class="font-medium text-foreground">Certificate SHA-256 fingerprint</p>
                  <p class="mt-1 break-all font-mono">{{ lanStatus.certificateFingerprint }}</p>
                  <p class="mt-2">
                    Export and install the Flaxeo local CA certificate as trusted on the client
                    device, then reopen this address. Do not continue through a certificate warning.
                  </p>
                  <button
                    type="button"
                    @click="exportLanCaCertificate"
                    class="mt-2 font-medium text-foreground hover:opacity-65"
                  >
                    Export trusted certificate
                  </button>
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-4 text-xs">
                  <button
                    type="button"
                    :disabled="lanBusy"
                    @click="rotateLanPairingCode"
                    class="font-medium text-foreground hover:opacity-65 disabled:opacity-40"
                  >
                    Rotate QR
                  </button>
                  <button
                    type="button"
                    :disabled="lanBusy"
                    @click="revokeLanSessions"
                    class="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    Revoke {{ lanStatus.sessionCount }} paired session{{
                      lanStatus.sessionCount === 1 ? '' : 's'
                    }}
                  </button>
                </div>

                <div class="mt-5 border-t border-border/70 pt-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-xs font-medium">Paired devices</p>
                    <button
                      type="button"
                      :disabled="lanBusy"
                      class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                      @click="refreshLanStatus"
                    >
                      <RefreshCw class="size-3" />
                      Refresh
                    </button>
                  </div>
                  <div
                    v-if="lanStatus.devices?.length"
                    class="mt-2 divide-y divide-border/70 rounded-md border border-border/70"
                  >
                    <div
                      v-for="device in lanStatus.devices || []"
                      :key="device.id"
                      class="flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <div class="min-w-0 text-[10px] leading-4 text-muted-foreground">
                        <p
                          class="truncate text-xs font-medium text-foreground"
                          :title="device.userAgent"
                        >
                          {{ pairedDeviceLabel(device.userAgent) }}
                        </p>
                        <p>{{ device.address }}</p>
                        <p>Access: {{ device.accessLevel }}</p>
                        <p>Last active {{ new Date(device.lastSeenAt).toLocaleString() }}</p>
                      </div>
                      <button
                        type="button"
                        :disabled="lanBusy"
                        @click="revokeLanSession(device.id)"
                        class="shrink-0 text-xs text-muted-foreground hover:text-destructive disabled:opacity-40"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                  <p v-else class="mt-2 text-xs leading-5 text-muted-foreground">
                    No paired browser sessions are currently active.
                  </p>
                </div>
              </template>
            </div>
          </section>

          <section
            v-if="activeCategory === 'storage'"
            class="fade-in animate-in space-y-7 duration-200"
          >
            <div
              v-if="storageSettings?.restartRequired"
              class="bg-linear-to-r from-amber-500/12 to-transparent px-3 py-2.5 text-xs leading-5 text-foreground"
            >
              Restart Flaxeo to apply the new storage locations. Existing files will not be moved.
            </div>

            <div
              v-if="storageError"
              class="bg-linear-to-r from-destructive/10 to-transparent px-3 py-2.5 text-xs text-destructive"
            >
              {{ storageError }}
            </div>

            <div
              v-if="!storageSettings && !storageError"
              class="flex items-center gap-2 py-4 text-sm text-muted-foreground"
            >
              <Loader2 class="size-4 animate-spin" />
              Loading storage locations...
            </div>

            <template v-if="storageSettings">
              <div class="rounded-lg border border-border/70 bg-card p-4">
                <h3 class="text-sm font-medium">Generated files</h3>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">
                  Choose where images and temporary working files are written.
                </p>

                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                  <div v-for="location in storageLocations" :key="location.id" class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium">{{ location.label }}</p>
                      <span
                        v-if="storageIsCustom(location.id)"
                        class="text-[10px] uppercase tracking-wide text-muted-foreground"
                        >Custom</span
                      >
                    </div>
                    <p
                      class="mt-1 truncate font-mono text-[10px] leading-4 text-muted-foreground"
                      :title="storagePath(location.id)"
                    >
                      {{ storagePath(location.id) }}
                    </p>
                    <div class="mt-2 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 font-medium text-foreground hover:opacity-65 disabled:opacity-40"
                        :disabled="storageBusy === location.id"
                        @click="chooseStorageDirectory(location.id)"
                      >
                        <Loader2 v-if="storageBusy === location.id" class="size-3 animate-spin" />
                        Change
                      </button>
                      <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground"
                        @click="openStorageDirectory(location.id)"
                      >
                        Open
                      </button>
                      <button
                        v-if="storageIsCustom(location.id)"
                        type="button"
                        class="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        :disabled="storageBusy === location.id"
                        @click="resetStorageDirectory(location.id)"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="rounded-lg border border-border/70 bg-card p-4">
                <h3 class="text-sm font-medium">Model directories</h3>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">
                  Change the root for all default model folders, then override individual types if
                  needed. Existing files are not moved.
                </p>

                <div class="mt-4 rounded-md border border-border/70 bg-muted/20 p-3">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">Models root</p>
                    <span
                      v-if="storageIsCustom('modelsRoot')"
                      class="text-[10px] uppercase tracking-wide text-muted-foreground"
                      >Custom</span
                    >
                  </div>
                  <p
                    class="mt-1 truncate font-mono text-[10px] leading-4 text-muted-foreground"
                    :title="storagePath('modelsRoot')"
                  >
                    {{ storagePath('modelsRoot') }}
                  </p>
                  <div class="mt-2 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 font-medium text-foreground hover:opacity-65 disabled:opacity-40"
                      :disabled="storageBusy === 'modelsRoot'"
                      @click="chooseStorageDirectory('modelsRoot')"
                    >
                      <Loader2 v-if="storageBusy === 'modelsRoot'" class="size-3 animate-spin" />
                      Change root
                    </button>
                    <button
                      type="button"
                      class="text-muted-foreground hover:text-foreground"
                      @click="openStorageDirectory('modelsRoot')"
                    >
                      Open
                    </button>
                    <button
                      v-if="storageIsCustom('modelsRoot')"
                      type="button"
                      class="text-muted-foreground hover:text-foreground disabled:opacity-40"
                      :disabled="storageBusy === 'modelsRoot'"
                      @click="resetStorageDirectory('modelsRoot')"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div class="mt-5 grid gap-3 sm:grid-cols-2">
                  <div v-for="location in modelLocations" :key="location.id" class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium">{{ location.label }}</p>
                      <span
                        v-if="storageIsCustom(location.id)"
                        class="text-[10px] uppercase tracking-wide text-muted-foreground"
                        >Custom</span
                      >
                    </div>
                    <p
                      class="mt-1 truncate font-mono text-[10px] leading-4 text-muted-foreground"
                      :title="storagePath(location.id)"
                    >
                      {{ storagePath(location.id) }}
                    </p>
                    <div class="mt-2 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 font-medium text-foreground hover:opacity-65 disabled:opacity-40"
                        :disabled="storageBusy === location.id"
                        @click="chooseStorageDirectory(location.id)"
                      >
                        <Loader2 v-if="storageBusy === location.id" class="size-3 animate-spin" />
                        Change
                      </button>
                      <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground"
                        @click="openStorageDirectory(location.id)"
                      >
                        Open
                      </button>
                      <button
                        v-if="storageIsCustom(location.id)"
                        type="button"
                        class="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        :disabled="storageBusy === location.id"
                        @click="resetStorageDirectory(location.id)"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </section>

          <section
            v-if="activeCategory === 'appearance'"
            class="fade-in animate-in duration-200"
            aria-label="Theme preference"
          >
            <div>
              <h3 class="text-sm font-medium">Theme</h3>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                Choose an interface theme or follow your system.
              </p>
            </div>

            <div class="mt-4 grid max-w-sm grid-cols-3 gap-3">
              <button
                v-for="option in themeOptions"
                :key="option.value"
                type="button"
                class="group flex min-w-0 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                :class="
                  themePreference === option.value
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                :aria-pressed="themePreference === option.value"
                @click="setTheme(option.value)"
              >
                <span
                  class="relative aspect-square w-20 overflow-hidden rounded-sm shadow-sm transition-[opacity,transform,box-shadow] duration-150 group-hover:-translate-y-0.5 sm:w-24"
                  :class="[
                    option.value === 'light'
                      ? 'bg-[#fdfdfd] text-[#0d0d0d]'
                      : option.value === 'dark'
                        ? 'bg-[#141414] text-white'
                        : 'bg-linear-to-br from-[#fdfdfd] from-45% to-[#141414] to-55% text-[#737373]',
                    themePreference === option.value
                      ? 'opacity-100 shadow-md'
                      : 'opacity-60 group-hover:opacity-90'
                  ]"
                >
                  <span
                    class="absolute inset-x-[10%] top-[10%] h-[9%] bg-current opacity-65"
                  ></span>
                  <span
                    class="absolute bottom-[10%] left-[10%] top-[27%] w-[21%] bg-current opacity-20"
                  ></span>
                  <span
                    class="absolute bottom-[10%] left-[37%] right-[10%] top-[27%] bg-current opacity-10"
                  ></span>
                  <span
                    class="absolute left-[44%] top-[39%] h-[8%] w-[38%] bg-current opacity-30"
                  ></span>
                  <span
                    class="absolute left-[44%] top-[55%] h-[19%] w-[24%] bg-current opacity-15"
                  ></span>
                </span>
                <span class="mt-2 flex items-center justify-center gap-1 text-xs font-medium">
                  {{ option.label }}
                  <Check v-if="themePreference === option.value" class="size-3" />
                </span>
              </button>
            </div>

            <div v-if="isRemote" class="mt-8 max-w-sm border-t border-border/70 pt-5">
              <h3 class="text-sm font-medium">Paired remote session</h3>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ remoteAccessDescription }}. Host storage, downloads, installation, certificates,
                and security settings remain desktop-only.
              </p>
              <div class="mt-3 flex items-center gap-3 text-xs">
                <span class="rounded-md bg-muted px-2 py-1 font-medium capitalize text-foreground">
                  {{ accessLevel || 'generation' }} access
                </span>
                <button
                  type="button"
                  class="font-medium text-muted-foreground hover:text-foreground"
                  @click="disconnectRemoteSession"
                >
                  Disconnect this device
                </button>
              </div>
            </div>
          </section>

          <section
            v-if="activeCategory === 'backend'"
            class="fade-in animate-in flex items-center justify-between gap-4 px-1 py-3 duration-200"
          >
            <div>
              <h2 class="text-sm font-medium">Express server</h2>
              <p class="mt-0.5 text-[11px] text-muted-foreground">Backend API connection status</p>
            </div>
            <div class="flex items-center gap-1.5">
              <span
                class="aui-status-badge inline-flex items-center gap-1.5 text-[10px] font-medium"
                :class="serverOnline ? 'text-foreground' : 'text-muted-foreground'"
              >
                <span
                  class="size-1.5 rounded-full"
                  :class="serverOnline ? 'bg-foreground' : 'bg-destructive'"
                ></span>
                {{ serverOnline ? 'Online' : 'Offline' }}
              </span>
              <button
                type="button"
                @click="checkServerStatus"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                aria-label="Refresh server status"
              >
                <RefreshCw class="size-3.5" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>
