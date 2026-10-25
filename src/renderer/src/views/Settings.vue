<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  availableSettingsCategories,
  settingsCategoryFrom,
  type SettingsCategory
} from '@/lib/settingsCategories'
import { renderSVG } from 'uqr'
import { apiGet, apiPost } from '@/services/api'
import { Check, Copy, Loader2, RefreshCw } from '@/lib/icons'
import EngineSettings from '@/components/settings/EngineSettings.vue'
import ThemePicker from '@/components/ThemePicker.vue'

import { useLibraryStore } from '@/stores/library'
import {
  isModelDirectoryKey,
  type StorageDirectoryId,
  type StorageSettings
} from '../../../shared/storage'
import {
  buildLanPairingUrl,
  type LanAccessLevel,
  type LanSharingStatus,
  type LanTransport
} from '../../../shared/lan'
import { setRemoteAccessLevel, useRemoteSession } from '@/composables/useRemoteSession'
import { useOutputPreferences, type ArchiveImageFormat } from '@/composables/useOutputPreferences'
import { useConnection } from '@/composables/useConnection'

const { isRemote, accessLevel } = useRemoteSession()
const connection = useConnection()
const { defaultSaveFormat, autoDownloadGenerated, setDefaultSaveFormat, setAutoDownloadGenerated } =
  useOutputPreferences()

const route = useRoute()
const router = useRouter()
const desktopSettingsAvailable = Boolean(window.electronAPI)
const settingsCategories = computed(() => availableSettingsCategories())
/** The page shown follows ?category= so the main sidebar can switch it. */
const activeCategory = computed<SettingsCategory>({
  get: () => settingsCategoryFrom(route.query.category),
  set: (category) => void router.replace({ name: 'Settings', query: { category } })
})

const activeCategoryDetails = computed(
  () => settingsCategories.value.find((category) => category.id === activeCategory.value)!
)

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
  { id: 'ip_adapter', label: 'IP-Adapter' },
  { id: 'tokenizers', label: 'Tokenizers' },
  { id: 'pulid', label: 'PuLID' },
  { id: 'upscale', label: 'Image upscalers' },
  { id: 'hires_upscalers', label: 'Hi-res upscalers' },
  { id: 'taesd', label: 'TAESD' },
  { id: 'embeddings', label: 'Textual embeddings' },
  { id: 'adetailer', label: 'ADetailer detectors (YOLOv8 .safetensors)' },
  { id: 'animatediff', label: 'AnimateDiff motion modules' }
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
  /** Binaries present but built for another OS (e.g. sd-cli.exe on Linux) */
  activeBackendPlatformMismatch?: boolean
  hostPlatform?: string
  outputImageFormat?: 'png' | 'avif'
}

// Backend state
const config = ref<BackendConfig>({
  activeVersion: 'custom',
  customBinaryExists: false,
  installedVersions: [],
  activeBackendPath: '',
  activeBackendValid: false,
  outputImageFormat: 'png'
})

const outputImageFormat = ref<'png' | 'avif'>('png')
const outputFormatBusy = ref(false)
const outputFormatError = ref('')

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
  return buildLanPairingUrl(status.url, status.pairingCode)
})
const lanQrSvg = computed(() =>
  lanPairingUrl.value ? renderSVG(lanPairingUrl.value, { ecc: 'M', border: 2 }) : ''
)

/** Newest published release — the version we steer people to; the binary is their call */

async function setStoreImageFormat(format: 'png' | 'avif'): Promise<void> {
  if (outputFormatBusy.value || outputImageFormat.value === format) return
  outputFormatBusy.value = true
  outputFormatError.value = ''
  const previous = outputImageFormat.value
  outputImageFormat.value = format
  try {
    await apiPost('/api/backend/config', { outputImageFormat: format })
  } catch (error) {
    outputImageFormat.value = previous
    outputFormatError.value =
      error instanceof Error ? error.message : 'Failed to update store format'
  } finally {
    outputFormatBusy.value = false
  }
}

/**
 * fetchConfig() - Fetches current backend configuration
 */
async function fetchConfig(): Promise<void> {
  try {
    const data = await apiGet<BackendConfig>('/api/backend/config')
    config.value = data
    outputImageFormat.value = data.outputImageFormat === 'avif' ? 'avif' : 'png'
  } catch (e) {
    console.error('Failed to fetch backend config:', e)
  }
}

const library = useLibraryStore()
const memberNameDraft = ref('')
const nameError = ref('')

watch(
  () => library.memberName,
  (name) => (memberNameDraft.value = name),
  { immediate: true }
)

async function saveMemberName(): Promise<void> {
  if (memberNameDraft.value.trim() === library.memberName) return
  try {
    await library.saveMemberName(memberNameDraft.value.trim())
    nameError.value = ''
  } catch (e) {
    nameError.value = e instanceof Error ? e.message : 'Could not save the name'
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

/**
 * Build identity - values are injected at build time from package.json
 * (see electron.vite.config.ts), so they match the installed build exactly.
 */
const appVersion = __APP_VERSION__
const buildDate = new Date(__BUILD_DATE__)
const buildLabel = Number.isNaN(buildDate.getTime())
  ? ''
  : buildDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const runtimeVersions = window.electron?.process.versions

/** Single line with everything worth pasting into a bug report */
const versionSummary = computed(() => {
  const parts = [`Flaxeo Image v${appVersion}`]
  if (buildLabel) parts.push(`build ${buildLabel}`)
  if (runtimeVersions) {
    parts.push(`Electron ${runtimeVersions.electron}`, `Chromium ${runtimeVersions.chrome}`)
  }
  if (config.value.activeVersion) parts.push(`backend ${config.value.activeVersion}`)
  return parts.join(' · ')
})

const aboutRows = computed(() => {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'App version', value: `v${appVersion}` }
  ]
  if (buildLabel) rows.push({ label: 'Build date', value: buildLabel })
  if (desktopSettingsAvailable) {
    rows.push({ label: 'Backend', value: config.value.activeVersion || 'Not configured' })
  }
  if (runtimeVersions) {
    rows.push(
      { label: 'Electron', value: runtimeVersions.electron || '' },
      { label: 'Chromium', value: runtimeVersions.chrome || '' },
      { label: 'Node', value: runtimeVersions.node || '' }
    )
  }
  rows.push({
    label: 'Session',
    value: isRemote ? 'Remote' : desktopSettingsAvailable ? 'Desktop' : 'Browser'
  })
  return rows
})

const versionCopied = ref(false)
let versionCopiedTimer = 0

async function copyVersionInfo(): Promise<void> {
  await copyUrl(versionSummary.value)
  versionCopied.value = true
  window.clearTimeout(versionCopiedTimer)
  versionCopiedTimer = window.setTimeout(() => (versionCopied.value = false), 1500)
}

onMounted(async () => {
  if (!desktopSettingsAvailable) return
  await loadStorageSettings()
  await fetchConfig()
  await refreshLanStatus()
  await library.refresh()
})

const lanStatusTimer = window.setInterval(() => {
  if (lanStatus.value?.enabled) void refreshLanStatus()
}, 5000)

onUnmounted(() => {
  window.clearInterval(lanStatusTimer)
  window.clearTimeout(versionCopiedTimer)
})
</script>

<template>
  <div
    class="workspace-view flex h-full min-h-0 flex-col bg-background text-foreground md:flex-row"
  >
    <aside
      v-if="settingsCategories.length > 1"
      class="shrink-0 border-b border-border px-3 py-3 md:hidden"
    >
      <nav class="no-scrollbar flex gap-1 overflow-x-auto" aria-label="Settings categories">
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
      <header class="aui-scroll-header bg-background px-4 pb-2 pt-4 md:px-8 md:pt-6">
        <h2 id="settings-title" class="text-lg font-semibold tracking-[-0.02em]">
          {{ activeCategoryDetails.label }}
        </h2>
        <p class="mt-1 text-sm leading-5 text-muted-foreground">
          {{ activeCategoryDetails.description }}
        </p>
        <div class="aui-scroll-header__fade" aria-hidden="true" />
      </header>

      <div class="flex-1 overflow-y-auto px-4 pb-8 pt-2 md:px-8">
        <div class="w-full max-w-2xl space-y-8">
          <EngineSettings v-if="activeCategory === 'engine'" />

          <section v-if="activeCategory === 'sharing'">
            <div class="px-4 py-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-medium">Localhost</p>
                  <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Used internally by the desktop app. It remains private to this computer.
                  </p>
                </div>
                <span
                  class="aui-status-badge inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs font-medium text-foreground"
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
                  <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
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
                <label class="block text-sm font-medium text-muted-foreground">
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
                <label class="block text-sm font-medium text-muted-foreground">
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
                class="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-4 text-amber-800 dark:text-amber-300"
              >
                Quick HTTP is not encrypted, allows generation only, expires after 15 minutes, and
                is disabled after restart. Use it only on a trusted home network.
              </div>
              <div
                v-else-if="lanAccessLevel === 'control'"
                class="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-4 text-amber-800 dark:text-amber-300"
              >
                Full remote control includes safe runtime and log controls. Backend installation,
                storage, certificates, downloads, and security settings always remain desktop-only.
              </div>

              <label class="mt-4 block text-sm font-medium text-muted-foreground">
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
                  <div class="min-w-0 text-xs leading-relaxed text-muted-foreground">
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
                      class="aui-field mt-3 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/40"
                    >
                      <span class="truncate">{{ lanStatus.url }}</span>
                      <Copy class="size-3.5 shrink-0" />
                    </button>
                    <p class="mt-2 font-medium tracking-wide text-foreground tabular-nums">
                      Code: {{ lanStatus.pairingCode }}
                    </p>
                    <p v-if="lanStatus.pairingExpiresAt" class="mt-1">
                      Expires {{ new Date(lanStatus.pairingExpiresAt).toLocaleTimeString() }}
                    </p>
                  </div>
                </div>

                <div
                  v-if="lanStatus.transport === 'https'"
                  class="mt-4 rounded-md bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground"
                >
                  <p class="font-medium text-foreground">Certificate SHA-256 fingerprint</p>
                  <p class="mt-1 break-all tracking-wide tabular-nums">
                    {{ lanStatus.certificateFingerprint }}
                  </p>
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
                      <div class="min-w-0 text-xs leading-relaxed text-muted-foreground">
                        <p
                          class="truncate text-xs font-medium text-foreground"
                          :title="device.userAgent"
                        >
                          {{ device.name ? `${device.name} · ` : ''
                          }}{{ pairedDeviceLabel(device.userAgent) }}
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

          <section v-if="activeCategory === 'general'" class="fade-in animate-in duration-200">
            <div class="space-y-2">
              <label for="member-name" class="text-sm font-medium">Your name</label>
              <p class="text-xs leading-5 text-muted-foreground">
                Shown on your generations and in the queue when other devices use this computer.
              </p>
              <input
                id="member-name"
                v-model="memberNameDraft"
                maxlength="40"
                placeholder="e.g. Ana"
                class="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
                @blur="saveMemberName"
                @keydown.enter.prevent="saveMemberName"
              />
              <p v-if="nameError" class="text-xs text-destructive">{{ nameError }}</p>
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
              <div class="border-t border-border pt-4">
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
                        class="text-xs uppercase tracking-wide text-muted-foreground"
                        >Custom</span
                      >
                    </div>
                    <p
                      class="mt-1 truncate text-sm leading-relaxed text-muted-foreground"
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

                <div class="mt-5 space-y-4 border-t border-border/60 pt-4">
                  <div>
                    <p class="text-sm font-medium">Store generations as</p>
                    <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                      AVIF stages PNG in temp and publishes AVIF only to Image output. PNG keeps raw
                      outputs (best for reuse-settings from file metadata).
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors"
                        :class="
                          outputImageFormat === 'png'
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-input bg-background text-foreground hover:bg-accent'
                        "
                        :disabled="outputFormatBusy"
                        @click="setStoreImageFormat('png')"
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors"
                        :class="
                          outputImageFormat === 'avif'
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-input bg-background text-foreground hover:bg-accent'
                        "
                        :disabled="outputFormatBusy"
                        @click="setStoreImageFormat('avif')"
                      >
                        AVIF
                      </button>
                    </div>
                    <p v-if="outputFormatError" class="mt-2 text-xs text-destructive">
                      {{ outputFormatError }}
                    </p>
                  </div>

                  <div>
                    <p class="text-sm font-medium">Default save / archive format</p>
                    <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Used by Download and by automatic download. You can still pick PNG or AVIF per
                      save from the workspace Download menu.
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors"
                        :class="
                          defaultSaveFormat === 'png'
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-input bg-background text-foreground hover:bg-accent'
                        "
                        @click="setDefaultSaveFormat('png' as ArchiveImageFormat)"
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors"
                        :class="
                          defaultSaveFormat === 'avif'
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-input bg-background text-foreground hover:bg-accent'
                        "
                        @click="setDefaultSaveFormat('avif' as ArchiveImageFormat)"
                      >
                        AVIF
                      </button>
                    </div>
                  </div>

                  <label class="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      class="mt-0.5 size-4 rounded border-input accent-foreground"
                      :checked="autoDownloadGenerated"
                      @change="
                        setAutoDownloadGenerated(($event.target as HTMLInputElement).checked)
                      "
                    />
                    <span>
                      <span class="block text-sm font-medium"
                        >Download generated images automatically</span
                      >
                      <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        After a successful generation, save outputs with the default archive format
                        (same as the workspace Download button).
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div class="border-t border-border pt-4">
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
                      class="text-xs uppercase tracking-wide text-muted-foreground"
                      >Custom</span
                    >
                  </div>
                  <p
                    class="mt-1 truncate text-sm leading-relaxed text-muted-foreground"
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
                        class="text-xs uppercase tracking-wide text-muted-foreground"
                        >Custom</span
                      >
                    </div>
                    <p
                      class="mt-1 truncate text-sm leading-relaxed text-muted-foreground"
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
            v-if="activeCategory === 'general'"
            class="fade-in animate-in duration-200"
            aria-label="Theme preference"
          >
            <div>
              <h3 class="text-sm font-medium">Theme</h3>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                Choose an interface theme or follow your system.
              </p>
            </div>

            <ThemePicker class="mt-4" />

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
              <p class="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="connection.engineReady.value ? 'bg-success' : 'bg-warning'"
                  aria-hidden="true"
                />
                <span class="min-w-0">
                  {{ connection.summary.value }}
                  <template v-if="connection.loadedModel.value">
                    ·
                    {{
                      connection.loadedModel.value.status === 'ready'
                        ? `${connection.loadedModel.value.model} is kept loaded`
                        : connection.loadedModel.value.status === 'loading'
                          ? 'Loading the model…'
                          : 'Keeps the model loaded between images'
                    }}
                  </template>
                </span>
              </p>
            </div>
          </section>

          <section v-if="activeCategory === 'general'" class="fade-in animate-in duration-200">
            <div class="p-4">
              <div class="flex flex-wrap items-end justify-between gap-3 pb-4">
                <div class="min-w-0">
                  <p class="text-sm font-medium">Flaxeo Image</p>
                  <p class="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular-nums">
                    v{{ appVersion }}
                  </p>
                </div>
                <button
                  type="button"
                  @click="copyVersionInfo"
                  :title="versionSummary"
                  class="inline-flex h-9 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <Check v-if="versionCopied" class="size-4" />
                  <Copy v-else class="size-4" />
                  {{ versionCopied ? 'Copied' : 'Copy version info' }}
                </button>
              </div>

              <dl class="border-t border-border/50">
                <div
                  v-for="row in aboutRows"
                  :key="row.label"
                  class="flex items-center justify-between gap-4 border-b border-border/50 py-2.5"
                >
                  <dt class="shrink-0 text-sm text-muted-foreground">{{ row.label }}</dt>
                  <dd class="truncate text-sm font-medium tabular-nums">{{ row.value }}</dd>
                </div>
              </dl>

              <p class="mt-4 text-xs leading-5 text-muted-foreground">
                Include these details when reporting an issue on
                <a
                  href="https://github.com/fabricio3g/FlaxeoUI"
                  target="_blank"
                  rel="noreferrer"
                  class="font-medium text-foreground underline-offset-2 hover:underline"
                  >GitHub</a
                >.
              </p>
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>
