<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { apiGet, apiPost } from '@/services/api'
import { 
  Settings as SettingsIcon, Download, Check, Loader2, 
  FolderOpen, RefreshCw, AlertTriangle, Copy
} from 'lucide-vue-next'
import LogPanel from '@/components/LogPanel.vue'
import { useToast } from '@/composables/useToast'

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
  const release = releases.value.find(r => r.tag === selectedRelease.value)
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
  const arch = systemInfo.value.arch
  
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
  
  const asset = selectedReleaseAssets.value.find(a => a.name === selectedVariant.value)
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
 * useCustomBinary() - Set custom binary as active
 */
async function useCustomBinary(): Promise<void> {
  try {
    await apiPost('/api/backend/use-custom', {})
    await fetchConfig()
  } catch (e) {
    console.error('Failed to use custom binary:', e)
  }
}

/**
 * toggleLocalNetwork() - Toggle local network access
 */
async function toggleLocalNetwork(): Promise<void> {
  try {
    const newState = !localNetworkEnabled.value
    await apiPost('/api/network/local', { enabled: newState })
    await fetchNetworkStatus()
  } catch (e) {
    console.error('Failed to toggle local network:', e)
  }
}

/**
 * toggleNgrok() - Toggle ngrok tunnel
 */
async function toggleNgrok(): Promise<void> {
  try {
    ngrokError.value = ''
    if (!ngrokEnabled.value) {
      // Starting - need token
      const response = await apiPost<any>('/api/network/toggle', { 
        service: 'ngrok', 
        action: 'start',
        token: ngrokToken.value || undefined
      })
      if (response.error) {
        ngrokError.value = response.error
      }
    } else {
      // Stopping
      await apiPost('/api/network/toggle', { service: 'ngrok', action: 'stop' })
    }
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
    if (!cloudflareEnabled.value) {
      await apiPost('/api/network/toggle', { service: 'cloudflare', action: 'start' })
    } else {
      await apiPost('/api/network/toggle', { service: 'cloudflare', action: 'stop' })
    }
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
  <div class="flex-1 overflow-y-auto p-6">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Header -->
      <header class="flex items-center gap-3">
        <SettingsIcon class="w-8 h-8 text-primary" />
        <div>
          <h1 class="text-2xl font-bold">Settings</h1>
          <p class="text-sm text-muted-foreground">Backend binary and network settings</p>
        </div>
      </header>

      <!-- Active Backend Status -->
      <section class="p-6 rounded-lg border border-border bg-card space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Active Backend</h2>
          <button
            @click="openCustomFolder"
            class="px-3 py-1.5 text-xs rounded bg-muted hover:bg-muted/80 flex items-center gap-1"
          >
            <FolderOpen class="w-4 h-4" />
            Custom Folder
          </button>
        </div>

        <div class="flex items-center gap-3">
          <div 
            class="w-3 h-3 rounded-full"
            :class="config.activeBackendValid ? 'bg-green-500' : 'bg-red-500'"
          ></div>
          <span 
            class="font-medium"
            :class="config.activeBackendValid ? 'text-green-400' : 'text-red-400'"
          >
            {{ config.activeVersion || 'Not configured' }}
          </span>
          <span v-if="config.activeBackendValid" class="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
            Valid
          </span>
          <span v-else class="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
            Binary Not Found
          </span>
        </div>

        <!-- Version Selector for Installed Versions -->
        <div v-if="config.installedVersions.length > 0 || config.customBinaryExists" class="space-y-2">
          <label class="text-sm text-muted-foreground">Switch Version:</label>
          <div class="flex gap-2">
            <select 
              :value="config.activeVersion"
              @change="(e) => setActiveVersion((e.target as HTMLSelectElement).value)"
              class="flex-1 px-3 py-2 text-sm rounded bg-muted border border-input"
            >
              <option value="custom">
                Custom {{ config.customBinaryExists ? '(Found)' : '(Not Found)' }}
              </option>
              <option v-for="v in config.installedVersions" :key="v" :value="v">
                {{ v }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="!config.activeBackendValid" class="p-3 bg-amber-900/20 border border-amber-800/30 rounded text-sm text-amber-300">
          <AlertTriangle class="w-4 h-4 inline mr-1" />
          Place sd-cli and sd-server binaries in the custom folder, or download a release below.
        </div>
      </section>

      <!-- System Detection -->
      <section v-if="systemInfo.platform" class="p-4 rounded-lg border border-blue-800/30 bg-blue-900/20">
        <div class="text-xs text-blue-400 font-medium mb-1">System Detected</div>
        <div class="text-sm text-blue-300">
          {{ systemInfo.platform === 'win32' ? 'Windows' : systemInfo.platform === 'darwin' ? 'macOS' : 'Linux' }}
          ({{ systemInfo.arch }})
        </div>
        <div v-if="systemInfo.note" class="text-xs text-blue-400/80 mt-1">{{ systemInfo.note }}</div>
      </section>

      <!-- Download New Release -->
      <section class="p-6 rounded-lg border border-border bg-card space-y-4">
        <h2 class="text-lg font-semibold">Install New Version</h2>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-muted-foreground mb-1 block">Release Version</label>
            <select v-model="selectedRelease" class="w-full px-3 py-2 text-sm rounded bg-muted border border-input">
              <option value="" disabled>Select version...</option>
              <option v-for="r in releases" :key="r.tag" :value="r.tag">
                {{ r.tag }} - {{ r.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-sm text-muted-foreground mb-1 block">Binary Variant</label>
            <select v-model="selectedVariant" class="w-full px-3 py-2 text-sm rounded bg-muted border border-input">
              <option value="" disabled>Select variant...</option>
              <option v-for="a in selectedReleaseAssets" :key="a.name" :value="a.name">
                {{ a.name }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="downloadStatus" class="text-sm" :class="downloadStatus.includes('failed') ? 'text-red-400' : 'text-green-400'">
          {{ downloadStatus }}
        </div>

        <button
          @click="downloadAndInstall"
          :disabled="!selectedRelease || !selectedVariant || isDownloading"
          class="w-full py-2.5 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          :class="!selectedRelease || !selectedVariant || isDownloading
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'"
        >
          <Loader2 v-if="isDownloading" class="w-4 h-4 animate-spin" />
          <Download v-else class="w-4 h-4" />
          {{ isDownloading ? 'Downloading...' : 'Download & Install' }}
        </button>

        <div v-if="releases.length === 0" class="text-center py-4">
          <Loader2 class="w-5 h-5 animate-spin mx-auto mb-2 text-muted-foreground" />
          <span class="text-sm text-muted-foreground">Loading releases...</span>
        </div>
      </section>

      <!-- Network Sharing -->
      <section class="p-6 rounded-lg border border-border bg-card space-y-4">
        <h2 class="text-lg font-semibold">Network Sharing</h2>
        
        <!-- Local Network -->
        <div class="p-3 bg-muted/50 rounded">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Local Network</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" :checked="localNetworkEnabled" @change="toggleLocalNetwork" class="sr-only peer" />
              <div class="w-9 h-5 bg-muted-foreground/30 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            </label>
          </div>
          <p class="text-xs text-muted-foreground mb-2">Allow access from other devices on your network</p>
          <div
            v-if="localNetworkUrl && localNetworkEnabled"
            @click="copyUrl(localNetworkUrl)"
            class="p-2 bg-background rounded text-xs font-mono text-green-400 cursor-pointer hover:bg-muted flex items-center justify-between"
          >
            <span>{{ localNetworkUrl }}</span>
            <Copy class="w-3 h-3" />
          </div>
        </div>
        
        <!-- Ngrok -->
        <div class="p-3 bg-muted/50 rounded">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Ngrok Tunnel</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" :checked="ngrokEnabled" @change="toggleNgrok" class="sr-only peer" />
              <div class="w-9 h-5 bg-muted-foreground/30 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            </label>
          </div>
          <p class="text-xs text-muted-foreground mb-2">
            Expose your server to the internet. 
            <a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" class="text-blue-400 hover:underline">Get Auth Token</a>
          </p>
          <div v-if="!ngrokEnabled" class="mb-2">
            <input
              v-model="ngrokToken"
              type="password"
              placeholder="Ngrok Auth Token (optional if set in env)"
              class="w-full px-3 py-2 text-xs rounded bg-background border border-input focus:ring-1 focus:ring-ring"
            />
          </div>
          <div v-if="ngrokError" class="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 mb-2">
            {{ ngrokError }}
          </div>
          <div
            v-if="ngrokUrl"
            @click="copyUrl(ngrokUrl)"
            class="p-2 bg-background rounded text-xs font-mono text-green-400 cursor-pointer hover:bg-muted flex items-center justify-between"
          >
            <span>{{ ngrokUrl }}</span>
            <Copy class="w-3 h-3" />
          </div>
        </div>
        
        <!-- Cloudflare -->
        <div class="p-3 bg-muted/50 rounded">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Cloudflare Tunnel</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" :checked="cloudflareEnabled" @change="toggleCloudflare" class="sr-only peer" />
              <div class="w-9 h-5 bg-muted-foreground/30 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            </label>
          </div>
          <div
            v-if="cloudflareUrl"
            @click="copyUrl(cloudflareUrl)"
            class="p-2 bg-background rounded text-xs font-mono text-green-400 cursor-pointer hover:bg-muted flex items-center justify-between"
          >
            <span>{{ cloudflareUrl }}</span>
            <Copy class="w-3 h-3" />
          </div>
        </div>
      </section>

      <!-- Server Status -->
      <section class="p-6 rounded-lg border border-border bg-card">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Express Server Status</h2>
          <div class="flex items-center gap-2">
            <div 
              class="w-3 h-3 rounded-full" 
              :class="serverOnline ? 'bg-green-500' : 'bg-destructive'"
            ></div>
            <span class="text-sm">{{ serverOnline ? 'Online' : 'Offline' }}</span>
            <button
              @click="checkServerStatus"
              class="ml-2 p-1.5 rounded bg-muted hover:bg-muted/80"
            >
              <RefreshCw class="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <!-- Server Logs -->
      <section class="p-6 rounded-lg border border-border bg-card">
        <h2 class="text-lg font-semibold mb-4">Server Logs</h2>
        <div class="h-64">
          <LogPanel />
        </div>
      </section>
    </div>
  </div>
</template>
