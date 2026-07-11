<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { apiGet, apiPost } from '@/services/api'
import {
  Settings as SettingsIcon,
  Download,
  Loader2,
  FolderOpen,
  RefreshCw,
  AlertTriangle,
  Copy
} from '@/lib/icons'
import Select from '@/components/ui/Select.vue'
import { useSetup } from '@/composables/useSetup'

const { reopenSetup } = useSetup()

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
const localNetworkEnabled = ref(false)
const localNetworkUrl = ref('')
const ngrokEnabled = ref(false)
const ngrokUrl = ref('')
const ngrokToken = ref('')
const ngrokError = ref('')
const cloudflareEnabled = ref(false)
const cloudflareUrl = ref('')

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

/**
 * fetchNetworkStatus() - Get network sharing status
 */
async function fetchNetworkStatus(): Promise<void> {
  try {
    const data = await apiGet<any>('/api/network/status')
    localNetworkEnabled.value = data.local?.enabled || false
    localNetworkUrl.value = data.local?.url || ''
    ngrokEnabled.value = data.ngrok?.enabled || false
    ngrokUrl.value = data.ngrok?.url || ''
    cloudflareEnabled.value = data.cloudflare?.enabled || false
    cloudflareUrl.value = data.cloudflare?.url || ''
  } catch (e) {
    console.log('Network status not available')
  }
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
  } catch (e) {
    console.error('Failed to set version:', e)
  }
}

/**
 * toggleNgrok() - Toggle ngrok tunnel
 */
async function toggleNgrok(): Promise<void> {
  try {
    ngrokError.value = ''
    const newState = !ngrokEnabled.value
    await apiPost('/api/network/ngrok', {
      enabled: newState,
      token: ngrokToken.value || undefined
    })
    await fetchNetworkStatus()
  } catch (e: any) {
    ngrokError.value = e.message || 'Failed to toggle ngrok'
    console.error('Failed to toggle ngrok:', e)
  }
}

/**
 * toggleCloudflare() - Toggle cloudflare tunnel
 */
async function toggleCloudflare(): Promise<void> {
  try {
    const newState = !cloudflareEnabled.value
    await apiPost('/api/network/cloudflare', { enabled: newState })
    await fetchNetworkStatus()
  } catch (e) {
    console.error('Failed to toggle cloudflare:', e)
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

onMounted(async () => {
  await checkServerStatus()
  await fetchConfig()
  await fetchReleases()
  await detectSystem()
  await fetchNetworkStatus()
})
</script>

<template>
  <div class="workspace-view h-full overflow-y-auto bg-background text-foreground">
    <div class="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 md:px-6 md:py-7">
      <header class="flex items-start gap-3 pb-1">
        <div
          class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/30"
        >
          <SettingsIcon class="size-4 text-muted-foreground" />
        </div>
        <div class="min-w-0">
          <h1 class="text-base font-medium tracking-tight">Settings</h1>
          <p class="mt-0.5 text-xs leading-5 text-muted-foreground">
            Manage the backend runtime and network access.
          </p>
        </div>
      </header>

      <section
        class="aui-dialog-surface overflow-hidden rounded-lg border border-border/70 bg-card"
      >
        <div
          class="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="text-sm font-medium">Backend</h2>
            <p class="mt-0.5 text-[11px] text-muted-foreground">
              Runtime selection and binary status
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              @click="reopenSetup"
              title="Run setup wizard"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <RefreshCw class="size-3.5" />
              Setup wizard
            </button>
            <button
              type="button"
              @click="openCustomFolder"
              title="Open custom folder"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <FolderOpen class="size-3.5" />
              Custom folder
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="aui-label text-[11px] font-medium text-muted-foreground">Active version</p>
            <p class="mt-1 truncate text-sm font-medium">
              {{ config.activeVersion || 'Not configured' }}
            </p>
          </div>
          <span
            class="aui-status-badge inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium"
            :class="
              config.activeBackendValid
                ? 'border-border bg-muted/40 text-foreground'
                : 'border-destructive/25 bg-destructive/10 text-destructive'
            "
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
          class="border-t border-border/70 px-4 py-4"
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

        <div v-if="!config.activeBackendValid" class="border-t border-border/70 p-4">
          <div
            class="aui-alert flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs leading-5 text-muted-foreground"
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
          class="flex flex-col gap-1 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="aui-label text-[11px] font-medium text-muted-foreground">Detected system</p>
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
        class="aui-dialog-surface overflow-hidden rounded-lg border border-border/70 bg-card"
      >
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-sm font-medium">Install a version</h2>
          <p class="mt-0.5 text-[11px] text-muted-foreground">
            Download a compatible backend release.
          </p>
        </div>

        <div class="space-y-4 p-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
                >Release version</label
              >
              <Select
                v-model="selectedRelease"
                size="md"
                class="aui-field"
                placeholder="Select version..."
                :options="releases.map((r) => ({ label: `${r.tag} - ${r.name}`, value: r.tag }))"
              />
            </div>
            <div>
              <label class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
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
        class="aui-dialog-surface overflow-hidden rounded-lg border border-border/70 bg-card"
      >
        <div class="border-b border-border/70 px-4 py-3">
          <h2 class="text-sm font-medium">Network sharing</h2>
          <p class="mt-0.5 text-[11px] text-muted-foreground">
            Control local and public access to the server.
          </p>
        </div>

        <div class="px-4 py-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium">Local network</p>
              <p class="mt-1 text-[11px] leading-4 text-muted-foreground">
                Access from other devices by starting with the
                <code
                  class="rounded border border-border bg-muted/40 px-1 py-0.5 text-[10px] text-foreground"
                  >--local</code
                >
                flag.
              </p>
            </div>
            <span
              class="aui-status-badge inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] font-medium"
              :class="localNetworkEnabled ? 'text-foreground' : 'text-muted-foreground'"
            >
              <span
                class="size-1.5 rounded-full"
                :class="localNetworkEnabled ? 'bg-foreground' : 'bg-muted-foreground/50'"
              ></span>
              {{ localNetworkEnabled ? 'Active' : 'Disabled' }}
            </span>
          </div>
          <button
            v-if="localNetworkUrl && localNetworkEnabled"
            type="button"
            @click="copyUrl(localNetworkUrl)"
            class="aui-field mt-3 flex h-9 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-200 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span class="truncate">{{ localNetworkUrl }}</span>
            <Copy class="size-3.5 shrink-0" />
          </button>
        </div>

        <div class="border-t border-border/70 px-4 py-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium">Ngrok tunnel</p>
              <p class="mt-1 text-[11px] leading-4 text-muted-foreground">
                Expose the server through an authenticated public tunnel.
                <a
                  href="https://dashboard.ngrok.com/get-started/your-authtoken"
                  target="_blank"
                  class="text-foreground underline decoration-border underline-offset-2 transition-colors duration-200 hover:decoration-foreground"
                  >Get auth token</a
                >
              </p>
            </div>
            <label class="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                :checked="ngrokEnabled"
                @change="toggleNgrok"
                class="peer sr-only"
                aria-label="Toggle Ngrok tunnel"
              />
              <span
                class="h-5 w-9 rounded-full border border-border bg-muted transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:border after:border-border after:bg-background after:shadow-sm after:transition-transform after:duration-200 after:content-[''] peer-checked:bg-foreground peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30"
              ></span>
            </label>
          </div>

          <input
            v-if="!ngrokEnabled"
            v-model="ngrokToken"
            type="password"
            placeholder="Ngrok auth token (optional if set in environment)"
            class="aui-field mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />

          <div
            v-if="ngrokError"
            class="aui-alert mt-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
          >
            {{ ngrokError }}
          </div>

          <button
            v-if="ngrokUrl"
            type="button"
            @click="copyUrl(ngrokUrl)"
            class="aui-field mt-3 flex h-9 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-200 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span class="truncate">{{ ngrokUrl }}</span>
            <Copy class="size-3.5 shrink-0" />
          </button>
        </div>

        <div class="border-t border-border/70 px-4 py-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium">Cloudflare tunnel</p>
              <p class="mt-1 text-[11px] leading-4 text-muted-foreground">
                Create a temporary public route without a local network flag.
              </p>
            </div>
            <label class="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                :checked="cloudflareEnabled"
                @change="toggleCloudflare"
                class="peer sr-only"
                aria-label="Toggle Cloudflare tunnel"
              />
              <span
                class="h-5 w-9 rounded-full border border-border bg-muted transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:border after:border-border after:bg-background after:shadow-sm after:transition-transform after:duration-200 after:content-[''] peer-checked:bg-foreground peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30"
              ></span>
            </label>
          </div>

          <button
            v-if="cloudflareUrl"
            type="button"
            @click="copyUrl(cloudflareUrl)"
            class="aui-field mt-3 flex h-9 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-200 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span class="truncate">{{ cloudflareUrl }}</span>
            <Copy class="size-3.5 shrink-0" />
          </button>
        </div>
      </section>

      <section
        class="aui-dialog-surface flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-card px-4 py-3"
      >
        <div>
          <h2 class="text-sm font-medium">Express server</h2>
          <p class="mt-0.5 text-[11px] text-muted-foreground">Backend API connection status</p>
        </div>
        <div class="flex items-center gap-1.5">
          <span
            class="aui-status-badge inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] font-medium"
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
</template>
