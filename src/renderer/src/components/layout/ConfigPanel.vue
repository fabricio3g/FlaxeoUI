<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useModels } from '@/composables/useModels'
import { storeToRefs } from 'pinia'
import { apiGet, apiPost } from '@/services/api'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Globe,
  Info,
  Play,
  Plus,
  Server,
  Square,
  Terminal,
  Trash2,
  Wifi,
  X,
  Zap
} from 'lucide-vue-next'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { models, fetchModels } = useModels()

const emit = defineEmits<{
  close: []
}>()

// Backend status
const sdServerRunning = ref(false)
const backendVersion = ref('Loading...')
const backendValid = ref(false)
const isBooting = ref(false)
const logs = ref<string[]>([])

// Network status
const localNetworkEnabled = ref(false)
const localNetworkUrl = ref('')
const ngrokEnabled = ref(false)
const ngrokUrl = ref('')
const cloudflareEnabled = ref(false)
const cloudflareUrl = ref('')

// Collapsible sections
const expandedSections = ref({
  backend: true,
  network: false,
  models: true,
  loras: false,
  embeddings: false,
  sampling: false,
  generation: true,
  hardware: false
})

let statusInterval: number | null = null

/**
 * toggleSection() - Toggle a collapsible section
 */
function toggleSection(section: keyof typeof expandedSections.value): void {
  expandedSections.value[section] = !expandedSections.value[section]
}

/**
 * fetchStatus() - Check sd-server and backend config status
 */
async function fetchStatus(): Promise<void> {
  try {
    // Check backend config
    const configData = await apiGet<any>('/api/backend/config')
    backendVersion.value = configData.activeVersion || 'Not set'
    backendValid.value = configData.activeBackendValid || false

    // Check sd-server status
    const statusData = await apiGet<any>('/api/status')
    sdServerRunning.value = statusData.running || false
    if (statusData.logs) {
      logs.value = statusData.logs.slice(-50) // Keep last 50 lines
    }
  } catch (e) {
    backendVersion.value = 'Error'
    backendValid.value = false
    sdServerRunning.value = false
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
    // Network status not available
  }
}

/**
 * startServer() - Start the sd-server with current configuration
 */
async function startServer(): Promise<void> {
  isBooting.value = true
  try {
    const payload = {
      loadMode: config.value.loadMode,
      diffusionModel:
        config.value.loadMode === 'standard'
          ? config.value.standardModel
          : config.value.diffusionModel,
      t5xxl: config.value.t5xxlModel,
      llm: config.value.llmModel,
      clipL: config.value.clipModel,
      clipG: config.value.clipGModel,
      vae: config.value.vaeModel,
      controlNet: config.value.controlNetModel,
      photoMaker: config.value.photoMakerModel,
      scheduler: config.value.scheduler,
      samplingMethod: config.value.sampler,
      flashAttention: config.value.flashAttention,
      vaeTiling: config.value.vaeTiling,
      clipOnCpu: config.value.clipOnCpu,
      offloadToCpu: config.value.cpuOffload,
      quantType: config.value.quantizationType,
      vaeTileSize: config.value.vaeTileSize,
      defaultSteps: config.value.steps,
      defaultCfg: config.value.cfgScale
    }

    await apiPost('/api/start', payload)
  } catch (e) {
    console.error('Failed to start server:', e)
  } finally {
    isBooting.value = false
  }
}

/**
 * stopServer() - Stop the sd-server
 */
async function stopServer(): Promise<void> {
  try {
    await apiPost('/api/stop', {})
  } catch (e) {
    console.error('Failed to stop server:', e)
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
    if (!ngrokEnabled.value) {
      await apiPost('/api/network/toggle', { service: 'ngrok', action: 'start' })
    } else {
      await apiPost('/api/network/toggle', { service: 'ngrok', action: 'stop' })
    }
    await fetchNetworkStatus()
  } catch (e) {
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
 * copyUrl() - Copy URL to clipboard
 */
async function copyUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

// Backend mode toggle
function setBackendMode(mode: 'server' | 'cli'): void {
  configStore.updateConfig({ backendMode: mode })
}

// Load mode toggle
function setLoadMode(mode: 'standard' | 'split'): void {
  configStore.updateConfig({ loadMode: mode })
}

// Video mode toggle
function toggleVideoMode(): void {
  configStore.updateConfig({ videoMode: !config.value.videoMode })
}

// Add/remove LoRA
function addNewLora(): void {
  if (models.value.loras.length > 0) {
    configStore.addLora(models.value.loras[0], 1.0)
  }
}

// Add/remove Embedding
function addNewEmbedding(): void {
  if (models.value.embeddings.length > 0) {
    configStore.addEmbedding(models.value.embeddings[0])
  }
}

onMounted(() => {
  fetchModels()
  fetchStatus()
  fetchNetworkStatus()
  // Poll status every 2 seconds
  statusInterval = window.setInterval(() => {
    fetchStatus()
  }, 2000)
})

// Auto-select first model if none selected
watch(
  () => models.value.diffusion,
  (newModels) => {
    if (newModels && newModels.length > 0) {
      if (!config.value.standardModel) {
        configStore.updateConfig({ standardModel: newModels[0] })
      }
      if (!config.value.diffusionModel) {
        configStore.updateConfig({ diffusionModel: newModels[0] })
      }
    }
  }
)

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>

<template>
  <aside class="w-full md:w-80 flex flex-col overflow-hidden h-full md:border-r md:border-border/70 md:bg-card/95 md:shadow-none md:backdrop-blur-xl md:rounded-bl-lg">
    <!-- Header with Status -->
    <div class="relative p-4 flex items-center justify-between bg-card/95">
      <div class="flex w-full items-center justify-between gap-8">
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="sdServerRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.65)]' : 'bg-red-500'"
        ></div>
        <span
          class="text-xs font-medium"
          :class="sdServerRunning ? 'text-green-700' : 'text-muted-foreground'"
        >
          {{ sdServerRunning ? 'SERVER ONLINE' : 'SERVER OFFLINE' }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <div
          class="w-2 h-2 rounded-full"
          :class="backendValid ? 'bg-green-500' : 'bg-red-500'"
        ></div>
        <span class="text-xs font-medium uppercase" :class="backendValid ? 'text-green-700' : 'text-red-500'">
          {{ backendVersion }}
        </span>
      </div>
      </div>

      <!-- Mobile Close Button -->
      <button
        @click="$emit('close')"
          class="absolute right-3 md:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- BACKEND MODE -->
      <section>
        <button
          @click="toggleSection('backend')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          <span class="flex items-center gap-1">
            Backend Mode
            <Tooltip
              position="bottom"
              :text="config.backendMode === 'server'
                ? 'Server: Load model once, generate multiple times. Start/Stop below.'
                : 'CLI: Load model each generation (recommended for large models)'"
            >
              <Info class="w-3 h-3 text-muted-foreground/50" />
            </Tooltip>
          </span>
          <ChevronDown v-if="!expandedSections.backend" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>

        <div v-show="expandedSections.backend" class="space-y-3">
          <!-- Server / CLI Toggle -->
          <div class="flex p-1 metal-surface rounded-lg">
            <button
              @click="setBackendMode('server')"
              class="flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-colors"
              :class="
                config.backendMode === 'server'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
            >
              <Server class="w-3.5 h-3.5" />
              Server
            </button>
            <button
              @click="setBackendMode('cli')"
              class="flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-colors"
              :class="
                config.backendMode === 'cli'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
            >
              <Terminal class="w-3.5 h-3.5" />
              CLI
            </button>
          </div>

          <!-- Server Controls (only in server mode) -->
          <div v-if="config.backendMode === 'server'" class="flex gap-2">
            <button
              @click="startServer"
              :disabled="sdServerRunning || isBooting || !backendValid"
              class="flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1 rounded-md transition-colors"
              :class="
                sdServerRunning || isBooting || !backendValid
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              "
            >
              <Play class="w-3.5 h-3.5" />
              {{ isBooting ? 'Booting...' : 'Start' }}
            </button>
            <button
              @click="stopServer"
              :disabled="!sdServerRunning"
              class="flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1 rounded-md transition-colors"
              :class="
                !sdServerRunning
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700'
              "
            >
              <Square class="w-3 h-3" />
              Stop
            </button>
          </div>

        </div>
      </section>

      <!-- NETWORK SHARING -->
      <section class="pt-3">
        <button
          @click="toggleSection('network')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          Network Sharing
          <ChevronDown v-if="!expandedSections.network" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>

        <div v-show="expandedSections.network" class="space-y-3">
          <!-- Local Network -->
          <div class="p-2 bg-muted/50 rounded">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-muted-foreground flex items-center gap-1">
                <Wifi class="w-3 h-3" />
                Local Network
              </span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  :checked="localNetworkEnabled"
                  @change="toggleLocalNetwork"
                  class="sr-only peer"
                />
                <div
                  class="w-7 h-3.5 bg-muted-foreground/30 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all"
                ></div>
              </label>
            </div>
            <div
              v-if="localNetworkUrl && localNetworkEnabled"
              @click="copyUrl(localNetworkUrl)"
              class="p-1.5 bg-background rounded text-[10px] font-mono text-green-400 cursor-pointer hover:text-green-300 break-all"
              title="Click to copy"
            >
              {{ localNetworkUrl }}
            </div>
            <p v-else class="text-[10px] text-muted-foreground/60">Allow LAN access</p>
          </div>

          <!-- Ngrok -->
          <div class="p-2 bg-muted/50 rounded">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-muted-foreground flex items-center gap-1">
                <Globe class="w-3 h-3" />
                Ngrok
              </span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  :checked="ngrokEnabled"
                  @change="toggleNgrok"
                  class="sr-only peer"
                />
                <div
                  class="w-7 h-3.5 bg-muted-foreground/30 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all"
                ></div>
              </label>
            </div>
            <div
              v-if="ngrokUrl"
              @click="copyUrl(ngrokUrl)"
              class="p-1.5 bg-background rounded text-[10px] font-mono text-green-400 cursor-pointer hover:text-green-300 break-all flex items-center justify-between"
            >
              <span>{{ ngrokUrl }}</span>
              <Copy class="w-3 h-3 shrink-0" />
            </div>
          </div>

          <!-- Cloudflare -->
          <div class="p-2 bg-muted/50 rounded">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-muted-foreground flex items-center gap-1">
                <Globe class="w-3 h-3" />
                Cloudflare
              </span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  :checked="cloudflareEnabled"
                  @change="toggleCloudflare"
                  class="sr-only peer"
                />
                <div
                  class="w-7 h-3.5 bg-muted-foreground/30 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all"
                ></div>
              </label>
            </div>
            <div
              v-if="cloudflareUrl"
              @click="copyUrl(cloudflareUrl)"
              class="p-1.5 bg-background rounded text-[10px] font-mono text-green-400 cursor-pointer hover:text-green-300 break-all flex items-center justify-between"
            >
              <span>{{ cloudflareUrl }}</span>
              <Copy class="w-3 h-3 shrink-0" />
            </div>
          </div>
        </div>
      </section>

      <!-- Video Mode toggle moved to topbar -->
      <!-- MODEL CONFIGURATION -->
      <section class="pt-3">
        <button
          @click="toggleSection('models')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          Model Configuration
          <ChevronDown v-if="!expandedSections.models" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>

        <div v-show="expandedSections.models" class="space-y-3">
          <!-- Standard / Split Toggle -->
          <div class="flex p-1 metal-surface rounded-lg">
            <button
              @click="setLoadMode('standard')"
              class="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors"
              :class="
                config.loadMode === 'standard'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              "
            >
              Standard
            </button>
            <button
              @click="setLoadMode('split')"
              class="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors"
              :class="
                config.loadMode === 'split'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              "
            >
              Split / Flux
            </button>
          </div>

          <!-- Standard Mode: Single Checkpoint -->
          <div v-if="config.loadMode === 'standard'" class="space-y-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Model Checkpoint</label>
              <Select
                v-model="config.standardModel"
                size="sm"
                placeholder="Select model..."
                :options="[
                  { label: 'Select model...', value: '' },
                  ...models.diffusion.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>
          </div>

          <!-- Split Mode: Multiple Models -->
          <div v-else class="space-y-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Diffusion Model</label>
              <Select
                v-model="config.diffusionModel"
                size="sm"
                placeholder="Select..."
                :options="[
                  { label: 'Select...', value: '' },
                  ...models.diffusion.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-xs text-muted-foreground block mb-1">T5XXL</label>
                <Select
                  v-model="config.t5xxlModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.t5xxl.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
              <div v-if="!config.videoMode">
                <label class="text-xs text-muted-foreground block mb-1">LLM</label>
                <Select
                  v-model="config.llmModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.llm.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2" v-if="!config.videoMode">
              <div>
                <label class="text-xs text-muted-foreground block mb-1">CLIP-L</label>
                <Select
                  v-model="config.clipModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.clip.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground block mb-1">CLIP-G</label>
                <Select
                  v-model="config.clipGModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.clipG.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
            </div>

            <div v-if="!config.videoMode">
              <label class="text-xs text-muted-foreground block mb-1">CLIP Vision</label>
              <Select
                v-model="config.clipVisionModel"
                size="sm"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.clipVision.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>
          </div>

          <!-- Common Model Options (both modes) -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">VAE</label>
              <Select
                v-model="config.vaeModel"
                size="sm"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.vae.map(m => ({ label: m, value: m }))
                ]"
              />
              <p
                v-if="
                  config.vaeModel === 'ae.sft' &&
                  !(config.diffusionModel || config.standardModel || '')
                    .toLowerCase()
                    .includes('flux')
                "
                class="text-[10px] text-yellow-500 mt-1 leading-tight"
              >
                ⚠️ ae.sft is for Flux. Might fail with SDXL/Pony.
              </p>
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">VAE Tile</label>
              <input
                v-model.number="config.vaeTileSize"
                type="number"
                placeholder="0"
                class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2" v-if="!config.videoMode">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">ControlNet</label>
              <Select
                v-model="config.controlNetModel"
                size="sm"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.controlnet.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">PhotoMaker</label>
              <Select
                v-model="config.photoMakerModel"
                size="sm"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.photomaker.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>
          </div>

          <div v-if="!config.videoMode" class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Upscale</label>
              <Select
                v-model="config.upscaleModel"
                size="sm"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.upscale.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">TAESD</label>
              <Select
                v-model="config.taesdModel"
                size="sm"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.taesd.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- LORA MODULES -->
      <section class="pt-3">
        <button
          @click="toggleSection('loras')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          LoRA Modules
          <div class="flex items-center gap-2">
            <span class="text-xs bg-muted px-1.5 py-0.5 rounded">{{ config.loras.length }}</span>
            <ChevronDown v-if="!expandedSections.loras" class="w-4 h-4" />
            <ChevronUp v-else class="w-4 h-4" />
          </div>
        </button>

        <div v-show="expandedSections.loras" class="space-y-2">
          <div
            v-for="(lora, index) in config.loras"
            :key="index"
            class="flex items-center gap-2 p-2 rounded-lg bg-muted/30"
          >
            <Select
              v-model="lora.path"
              size="sm"
              :options="models.loras.map(m => ({ label: m, value: m }))"
            />
            <input
              v-model.number="lora.strength"
              type="number"
              step="0.1"
              min="0"
              max="2"
              class="w-12 px-1 py-1.5 text-xs rounded-md bg-muted/50 text-center focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              title="Strength"
            />
            <button
              @click="configStore.removeLora(index)"
              class="p-1.5 metal-icon-button text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            @click="addNewLora"
            class="w-full py-2 text-xs flex items-center justify-center gap-1 rounded-md bg-muted/30 hover:bg-muted/50 hover:text-primary transition-all"
          >
            <Plus class="w-3.5 h-3.5" />
            Add LoRA
          </button>
        </div>
      </section>

      <!-- EMBEDDINGS -->
      <section class="pt-3">
        <button
          @click="toggleSection('embeddings')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          Embeddings
          <div class="flex items-center gap-2">
            <span class="text-xs bg-muted px-1.5 py-0.5 rounded">{{
              config.embeddings.length
            }}</span>
            <ChevronDown v-if="!expandedSections.embeddings" class="w-4 h-4" />
            <ChevronUp v-else class="w-4 h-4" />
          </div>
        </button>

        <div v-show="expandedSections.embeddings" class="space-y-2">
          <div
            v-for="(emb, index) in config.embeddings"
            :key="index"
            class="flex items-center gap-2 p-2 rounded-lg bg-muted/30"
          >
            <div class="flex-1 flex items-center gap-2 overflow-hidden">
              <span
                class="text-[10px] uppercase font-bold text-muted-foreground px-1 py-0.5 bg-muted rounded"
                >TI</span
              >
              <Select
                :model-value="emb"
                @update:model-value="(val) => { config.embeddings[index] = val }"
                size="sm"
                :options="models.embeddings.map(m => ({ label: m, value: m }))"
              />
            </div>
            <button
              @click="configStore.removeEmbedding(emb)"
              class="p-1.5 metal-icon-button text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            @click="addNewEmbedding"
            class="w-full py-2 text-xs flex items-center justify-center gap-1 rounded-md bg-muted/30 hover:bg-muted/50 hover:text-primary transition-all"
          >
            <Plus class="w-3.5 h-3.5" />
            Add Embedding
          </button>
        </div>
      </section>

      <!-- SAMPLING -->
      <section class="pt-3">
        <button
          @click="toggleSection('sampling')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          Sampling
          <ChevronDown v-if="!expandedSections.sampling" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>

        <div v-show="expandedSections.sampling" class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Scheduler</label>
              <Select
                v-model="config.scheduler"
                size="sm"
                placeholder="Select..."
                :options="[
                  { label: 'Discrete', value: 'discrete' },
                  { label: 'Karras', value: 'karras' },
                  { label: 'Exponential', value: 'exponential' },
                  { label: 'AYS', value: 'ays' },
                  { label: 'GITS', value: 'gits' }
                ]"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Sampler</label>
              <Select
                v-model="config.sampler"
                size="sm"
                placeholder="Select..."
                :options="[
                  { label: 'Euler', value: 'euler' },
                  { label: 'Euler A', value: 'euler_a' },
                  { label: 'Heun', value: 'heun' },
                  { label: 'DPM2', value: 'dpm2' },
                  { label: 'DPM++ 2S a', value: 'dpm++2s_a' },
                  { label: 'DPM++ 2M', value: 'dpm++2m' },
                  { label: 'DPM++ 2M v2', value: 'dpm++2mv2' },
                  { label: 'LCM', value: 'lcm' }
                ]"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- GENERATION SETTINGS -->
      <section class="pt-3">
        <button
          @click="toggleSection('generation')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          Generation Settings
          <ChevronDown v-if="!expandedSections.generation" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>

        <div v-show="expandedSections.generation" class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Steps</label>
              <input
                v-model.number="config.steps"
                type="number"
                min="1"
                max="150"
                class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">CFG Scale</label>
              <input
                v-model.number="config.cfgScale"
                type="number"
                step="0.5"
                min="1"
                max="30"
                class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Guidance</label>
              <input
                v-model.number="config.guidance"
                type="number"
                step="0.1"
                class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Clip Skip</label>
              <input
                v-model.number="config.clipSkip"
                type="number"
                class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          </div>
          <div>
            <label class="text-xs text-muted-foreground block mb-1">Seed (-1 random)</label>
            <input
              v-model.number="config.seed"
              type="number"
              class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>
        </div>
      </section>

      <!-- HARDWARE -->
      <section class="pt-3">
        <button
          @click="toggleSection('hardware')"
          class="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          Hardware
          <ChevronDown v-if="!expandedSections.hardware" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>

        <div v-show="expandedSections.hardware" class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.flashAttention" type="checkbox" class="rounded" />
              <Zap class="w-3.5 h-3.5" />
              Flash Attn
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.vaeTiling" type="checkbox" class="rounded" />
              VAE Tiling
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.clipOnCpu" type="checkbox" class="rounded" />
              CLIP CPU
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.cpuOffload" type="checkbox" class="rounded" />
              <Cpu class="w-3.5 h-3.5" />
              Offload
            </label>
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Quantization</label>
            <Select
              v-model="config.quantizationType"
              size="sm"
              placeholder="Default"
              :options="[
                { label: 'Default', value: '' },
                { label: 'f32 - 32-bit', value: 'f32' },
                { label: 'f16 - 16-bit', value: 'f16' },
                { label: 'q8_0 - 8-bit', value: 'q8_0' },
                { label: 'q5_0 - 5-bit', value: 'q5_0' },
                { label: 'q4_0 - 4-bit', value: 'q4_0' }
              ]"
            />
          </div>
        </div>
      </section>

      <!-- LOGS (for server mode) -->
      <section v-if="config.backendMode === 'server'" class="pt-3">
        <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          :: Logs ::
        </h3>
        <div
          class="h-32 bg-muted/20 rounded-md p-2 overflow-y-auto text-[10px] font-mono text-foreground leading-tight"
        >
          <div v-for="(log, i) in logs" :key="i">{{ log }}</div>
          <div v-if="logs.length === 0" class="text-muted-foreground">No logs yet...</div>
        </div>
      </section>
    </div>
  </aside>
</template>
