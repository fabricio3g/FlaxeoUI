<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useModels } from '@/composables/useModels'
import { storeToRefs } from 'pinia'
import { apiGet, apiPost } from '@/services/api'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Info,
  Play,
  Plus,
  Save,
  Search,
  Server,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  X,
  Zap
} from 'lucide-vue-next'
import type { Component } from 'vue'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import ModelHubModal from '@/components/ModelHubModal.vue'

const configStore = useConfigStore()
const { config, presets, selectedPresetId } = storeToRefs(configStore)
const { models, fetchModels } = useModels()

withDefaults(
  defineProps<{
    collapsed?: boolean
  }>(),
  {
    collapsed: false
  }
)

const emit = defineEmits<{
  close: []
}>()

// Backend status
const sdServerRunning = ref(false)
const backendVersion = ref('Loading...')
const backendValid = ref(false)
const isBooting = ref(false)
const logs = ref<string[]>([])
const showModelHub = ref(false)
let hideTimeout: ReturnType<typeof setTimeout> | null = null

type CollapsedSection = 'backend' | 'presets' | 'models' | 'generation' | 'hardware' | 'warnings'

const activeCollapsedSection = ref<CollapsedSection | null>(null)
const pinnedCollapsedSection = ref<CollapsedSection | null>(null)

// Presets
const presetName = ref('')
const presetSearch = ref('')

// Collapsible sections
const expandedSections = ref({
  backend: true,
  models: true,
  loras: false,
  embeddings: false,
  sampling: false,
  generation: true,
  hardware: false
})

let statusInterval: number | null = null

const filteredPresets = computed(() => {
  const query = presetSearch.value.trim().toLowerCase()
  if (!query) return presets.value

  return presets.value.filter((preset) => {
    const mode = preset.config.backendMode
    return preset.name.toLowerCase().includes(query) || mode.includes(query)
  })
})

const selectedPreset = computed(() =>
  presets.value.find((preset) => preset.id === selectedPresetId.value)
)

const configWarnings = computed(() => {
  const warnings: string[] = []
  if (!backendValid.value) warnings.push('Backend binary is not valid')
  if (config.value.backendMode === 'server' && !sdServerRunning.value) warnings.push('Server mode is selected but sd-server is offline')
  if (config.value.loadMode === 'standard' && !config.value.standardModel) warnings.push('No checkpoint selected')
  if (config.value.loadMode === 'split' && !config.value.diffusionModel) warnings.push('No diffusion model selected')
  if (config.value.videoMode && config.value.loadMode !== 'split') warnings.push('Video presets need split model loading')
  if (config.value.videoMode && !config.value.t5xxlModel) warnings.push('Video mode usually requires T5XXL/UMT5')
  return warnings
})

const activeModelSummary = computed(() => {
  const parts = [config.value.loadMode === 'standard' ? config.value.standardModel : config.value.diffusionModel]
  if (config.value.vaeModel) parts.push(config.value.vaeModel)
  if (config.value.t5xxlModel) parts.push(config.value.t5xxlModel)
  if (config.value.llmModel) parts.push(config.value.llmModel)
  return parts.filter(Boolean).slice(0, 4)
})

const collapsedSections: Array<{ id: CollapsedSection; label: string; icon: Component }> = [
  { id: 'backend', label: 'Backend', icon: Server },
  { id: 'presets', label: 'Presets', icon: Save },
  { id: 'models', label: 'Models', icon: Database },
  { id: 'generation', label: 'Generation', icon: SlidersHorizontal },
  { id: 'hardware', label: 'Hardware', icon: Cpu },
  { id: 'warnings', label: 'Warnings', icon: AlertTriangle }
]

const presetOptions = computed(() => [
  { label: 'Select preset...', value: '' },
  ...(
    selectedPreset.value && !filteredPresets.value.some((preset) => preset.id === selectedPreset.value?.id)
      ? [selectedPreset.value, ...filteredPresets.value]
      : filteredPresets.value
  ).map((preset) => ({
    label: `${preset.builtin ? 'Template: ' : ''}${preset.name} (${preset.config.backendMode.toUpperCase()})`,
    value: preset.id
  }))
])

/**
 * toggleSection() - Toggle a collapsible section
 */
function toggleSection(section: keyof typeof expandedSections.value): void {
  expandedSections.value[section] = !expandedSections.value[section]
}

function showCollapsedFlyout(section: CollapsedSection): void {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
  activeCollapsedSection.value = section
}

function pinCollapsedFlyout(section: CollapsedSection): void {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
  pinnedCollapsedSection.value = pinnedCollapsedSection.value === section ? null : section
  activeCollapsedSection.value = pinnedCollapsedSection.value || section
}

function hideCollapsedFlyout(section: CollapsedSection): void {
  if (pinnedCollapsedSection.value !== section) {
    hideTimeout = setTimeout(() => {
      activeCollapsedSection.value = null
    }, 200)
  }
}

function closeCollapsedFlyout(): void {
  pinnedCollapsedSection.value = null
  activeCollapsedSection.value = null
}

function keepCollapsedFlyout(): void {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
}

function leaveCollapsedFlyout(): void {
  if (activeCollapsedSection.value) hideCollapsedFlyout(activeCollapsedSection.value)
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
      highNoiseDiffusionModel: config.value.highNoiseDiffusionModel,
      uncondDiffusionModel: config.value.uncondDiffusionModel,
      t5xxl: config.value.t5xxlModel,
      llm: config.value.llmModel,
      llmVision: config.value.llmVisionModel,
      clipL: config.value.clipModel,
      clipG: config.value.clipGModel,
      vae: config.value.vaeModel,
      vaeFormat: config.value.vaeFormat,
      audioVae: config.value.audioVaeModel,
      embeddingsConnectors: config.value.embeddingsConnectorsModel,
      controlNet: config.value.controlNetModel,
      photoMaker: config.value.photoMakerModel,
      scheduler: config.value.scheduler,
      samplingMethod: config.value.sampler,
      rngType: config.value.rngType,
      samplerRngType: config.value.samplerRngType,
      flashAttention: config.value.flashAttention,
      vaeTiling: config.value.vaeTiling,
      clipOnCpu: config.value.clipOnCpu,
      vaeOnCpu: config.value.vaeOnCpu,
      controlNetOnCpu: config.value.controlNetOnCpu,
      offloadToCpu: config.value.cpuOffload,
      diffusionConvDirect: config.value.diffusionConvDirect,
      vaeConvDirect: config.value.vaeConvDirect,
      forceSDXLVaeConvScale: config.value.forceSDXLVaeConvScale,
      backendAssignment: config.value.backendAssignment,
      paramsBackendAssignment: config.value.paramsBackendAssignment,
      threads: config.value.threads,
      maxVram: config.value.maxVram,
      streamLayers: config.value.streamLayers,
      mmap: config.value.mmap,
      circular: config.value.circular,
      circularX: config.value.circularX,
      circularY: config.value.circularY,
      qwenImageZeroCondT: config.value.qwenImageZeroCondT,
      chromaEnableT5Mask: config.value.chromaEnableT5Mask,
      chromaDisableDitMask: config.value.chromaDisableDitMask,
      chromaT5MaskPad: config.value.chromaT5MaskPad,
      quantType: config.value.quantizationType,
      quantizationType: config.value.quantizationType,
      tensorTypeRules: config.value.tensorTypeRules,
      predictionType: config.value.predictionType,
      cacheMode: config.value.cacheMode,
      cacheOption: config.value.cacheOption,
      scmMask: config.value.scmMask,
      scmPolicy: config.value.scmPolicy,
      flowShift: config.value.flowShift,
      eta: config.value.eta,
      slgScale: config.value.slgScale,
      skipLayerStart: config.value.skipLayerStart,
      skipLayerEnd: config.value.skipLayerEnd,
      skipLayers: config.value.skipLayers,
      sigmas: config.value.sigmas,
      imgCfgScale: config.value.imgCfgScale,
      extraSampleArgs: config.value.extraSampleArgs,
      extraTilingArgs: config.value.extraTilingArgs,
      disableImageMetadata: config.value.disableImageMetadata,
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

// Backend mode toggle
function setBackendMode(mode: 'server' | 'cli'): void {
  configStore.updateConfig({ backendMode: mode })
}

function saveCurrentPreset(): void {
  const savedPreset = configStore.savePreset(presetName.value)
  if (savedPreset) {
    presetName.value = ''
    presetSearch.value = ''
  }
}

function selectPreset(id: string): void {
  if (!id) {
    selectedPresetId.value = ''
    return
  }

  configStore.applyPreset(id)
}

function overwriteSelectedPreset(): void {
  if (!selectedPresetId.value) return
  configStore.updatePreset(selectedPresetId.value)
}

function deleteSelectedPreset(): void {
  if (!selectedPresetId.value) return
  configStore.deletePreset(selectedPresetId.value)
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
  <aside
    class="config-panel-shell w-full flex flex-col h-full md:bg-card/95 md:shadow-none md:backdrop-blur-xl md:rounded-sm"
    :class="collapsed ? 'overflow-visible z-50' : 'overflow-hidden'"
  >
    <div v-if="collapsed" class="relative md:flex h-full flex-col items-center gap-2 py-3">
      <Tooltip v-for="section in collapsedSections" :key="section.id" :text="section.label" position="right">
        <button
          class="relative h-9 w-9 metal-icon-button flex items-center justify-center titlebar-no-drag"
          :class="[
            activeCollapsedSection === section.id || pinnedCollapsedSection === section.id
              ? 'primary-metal-button'
              : 'text-muted-foreground hover:text-foreground',
            section.id === 'warnings' && configWarnings.length > 0 ? 'text-yellow-500' : ''
          ]"
          type="button"
          @mouseenter="showCollapsedFlyout(section.id)"
          @mouseleave="hideCollapsedFlyout(section.id)"
          @click="pinCollapsedFlyout(section.id)"
        >
          <component :is="section.icon" class="w-4 h-4" />
          <span
            v-if="section.id === 'backend'"
            class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
            :class="backendValid ? 'bg-green-500' : 'bg-red-500'"
          ></span>
          <span
            v-if="section.id === 'warnings' && configWarnings.length > 0"
            class="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-yellow-500 px-1 text-[9px] font-bold text-black"
          >{{ configWarnings.length }}</span>
        </button>
      </Tooltip>

      <div
        v-if="activeCollapsedSection"
        class="absolute left-full top-0 z-50 ml-3 w-80 max-h-full overflow-y-auto rounded-xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-xl"
        @mouseenter="keepCollapsedFlyout"
        @mouseleave="leaveCollapsedFlyout"
      >
        <div class="mb-3 flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold capitalize">{{ activeCollapsedSection }}</h3>
          <button class="metal-icon-button p-1 text-muted-foreground hover:text-foreground" @click="closeCollapsedFlyout">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="activeCollapsedSection === 'backend'" class="space-y-3">
          <div class="rounded-lg bg-muted/30 p-3 text-xs space-y-2">
            <div class="flex items-center justify-between"><span>Backend</span><span :class="backendValid ? 'text-green-500' : 'text-red-500'">{{ backendVersion }}</span></div>
            <div class="flex items-center justify-between"><span>Server</span><span :class="sdServerRunning ? 'text-green-500' : 'text-muted-foreground'">{{ sdServerRunning ? 'Online' : 'Offline' }}</span></div>
          </div>
          <div class="flex p-1 metal-surface rounded-lg">
            <button @click="setBackendMode('server')" class="flex-1 py-1.5 text-xs rounded-lg" :class="config.backendMode === 'server' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'">Server</button>
            <button @click="setBackendMode('cli')" class="flex-1 py-1.5 text-xs rounded-lg" :class="config.backendMode === 'cli' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'">CLI</button>
          </div>
          <div v-if="config.backendMode === 'server'" class="grid grid-cols-2 gap-2">
            <button @click="startServer" :disabled="sdServerRunning || isBooting || !backendValid" class="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">{{ isBooting ? 'Booting' : 'Start' }}</button>
            <button @click="stopServer" :disabled="!sdServerRunning" class="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">Stop</button>
          </div>
        </div>

        <div v-else-if="activeCollapsedSection === 'presets'" class="space-y-3">
          <Select :model-value="selectedPresetId" size="sm" :options="presetOptions" @update:model-value="selectPreset" />
          <div class="flex gap-2">
            <input v-model="presetName" type="text" placeholder="Preset name..." class="h-8 min-w-0 flex-1 rounded-md bg-muted/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            <button @click="saveCurrentPreset" :disabled="!presetName.trim()" class="primary-metal-button rounded-md px-3 text-xs disabled:opacity-40">Save</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button @click="overwriteSelectedPreset" :disabled="!selectedPreset || selectedPreset.builtin" class="rounded-md bg-muted px-3 py-2 text-xs disabled:opacity-40">Overwrite</button>
            <button @click="deleteSelectedPreset" :disabled="!selectedPreset || selectedPreset.builtin" class="rounded-md bg-muted px-3 py-2 text-xs text-destructive disabled:opacity-40">Delete</button>
          </div>
        </div>

        <div v-else-if="activeCollapsedSection === 'models'" class="space-y-3">
          <div class="flex p-1 metal-surface rounded-lg">
            <button @click="setLoadMode('standard')" class="flex-1 py-1.5 text-xs rounded-lg" :class="config.loadMode === 'standard' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'">Standard</button>
            <button @click="setLoadMode('split')" class="flex-1 py-1.5 text-xs rounded-lg" :class="config.loadMode === 'split' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'">Split</button>
          </div>
          <Select v-if="config.loadMode === 'standard'" v-model="config.standardModel" size="sm" placeholder="Checkpoint" :options="[{ label: 'Select model...', value: '' }, ...models.diffusion.map(m => ({ label: m, value: m }))]" />
          <template v-else>
            <Select v-model="config.diffusionModel" size="sm" placeholder="Diffusion" :options="[{ label: 'Diffusion...', value: '' }, ...models.diffusion.map(m => ({ label: m, value: m }))]" />
            <Select v-model="config.vaeModel" size="sm" placeholder="VAE" :options="[{ label: 'VAE...', value: '' }, ...models.vae.map(m => ({ label: m, value: m }))]" />
            <Select v-model="config.t5xxlModel" size="sm" placeholder="T5XXL" :options="[{ label: 'T5XXL...', value: '' }, ...models.t5xxl.map(m => ({ label: m, value: m }))]" />
            <Select v-model="config.llmModel" size="sm" placeholder="LLM" :options="[{ label: 'LLM...', value: '' }, ...models.llm.map(m => ({ label: m, value: m }))]" />
          </template>
          <div v-if="activeModelSummary.length" class="space-y-1 pt-1 text-[11px] text-muted-foreground">
            <div v-for="item in activeModelSummary" :key="item" class="truncate">{{ item }}</div>
          </div>
        </div>

        <div v-else-if="activeCollapsedSection === 'generation'" class="grid grid-cols-2 gap-2">
          <label class="text-xs text-muted-foreground">Steps<input v-model.number="config.steps" type="number" class="mt-1 w-full rounded-md bg-muted/50 px-2 py-1.5 text-foreground" /></label>
          <label class="text-xs text-muted-foreground">CFG<input v-model.number="config.cfgScale" type="number" step="0.5" class="mt-1 w-full rounded-md bg-muted/50 px-2 py-1.5 text-foreground" /></label>
          <label class="text-xs text-muted-foreground">Width<input v-model.number="config.width" type="number" step="64" class="mt-1 w-full rounded-md bg-muted/50 px-2 py-1.5 text-foreground" /></label>
          <label class="text-xs text-muted-foreground">Height<input v-model.number="config.height" type="number" step="64" class="mt-1 w-full rounded-md bg-muted/50 px-2 py-1.5 text-foreground" /></label>
          <label class="col-span-2 text-xs text-muted-foreground">Seed<input v-model.number="config.seed" type="number" class="mt-1 w-full rounded-md bg-muted/50 px-2 py-1.5 text-foreground" /></label>
        </div>

        <div v-else-if="activeCollapsedSection === 'hardware'" class="space-y-3">
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="flex items-center gap-2"><input v-model="config.flashAttention" type="checkbox" /> Flash</label>
            <label class="flex items-center gap-2"><input v-model="config.vaeTiling" type="checkbox" /> VAE Tile</label>
            <label class="flex items-center gap-2"><input v-model="config.clipOnCpu" type="checkbox" /> CLIP CPU</label>
            <label class="flex items-center gap-2"><input v-model="config.cpuOffload" type="checkbox" /> Offload</label>
          </div>
          <input v-model="config.backendAssignment" type="text" placeholder="Backend: cuda0, vulkan0, cpu" class="w-full rounded-md bg-muted/50 px-2 py-1.5 text-xs" />
          <input v-model="config.paramsBackendAssignment" type="text" placeholder="Params backend" class="w-full rounded-md bg-muted/50 px-2 py-1.5 text-xs" />
          <label class="text-xs text-muted-foreground">Max VRAM GiB<input v-model.number="config.maxVram" type="number" step="0.1" class="mt-1 w-full rounded-md bg-muted/50 px-2 py-1.5 text-foreground" /></label>
        </div>

        <div v-else-if="activeCollapsedSection === 'warnings'" class="space-y-2">
          <div v-if="configWarnings.length === 0" class="rounded-lg bg-green-500/10 p-3 text-xs text-green-600">Configuration looks ready.</div>
          <div v-for="warning in configWarnings" :key="warning" class="rounded-lg bg-yellow-500/10 p-3 text-xs text-yellow-600">{{ warning }}</div>
        </div>
      </div>
    </div>
    <ModelHubModal :open="showModelHub" @close="showModelHub = false" />

    <template v-if="!collapsed">
    <!-- Header with Status -->
    <div class="relative p-5 flex items-center justify-between bg-card/95">
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
    <div class="config-panel-scroll flex-1 overflow-y-auto p-5 space-y-5">
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
          <!-- Configuration Presets -->
          <div class="p-2 rounded-lg bg-muted/30 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Save class="w-3.5 h-3.5" />
                Presets
              </span>
              <span class="text-[10px] text-muted-foreground">{{ presets.length }} saved</span>
            </div>

            <div class="flex gap-2">
              <input
                v-model="presetName"
                type="text"
                placeholder="Preset name..."
                class="h-8 flex-1 min-w-0 px-2 text-xs rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                @keyup.enter="saveCurrentPreset"
              />
              <button
                @click="saveCurrentPreset"
                :disabled="!presetName.trim()"
                class="h-8 w-24 text-xs font-medium rounded-md transition-colors"
                :class="
                  presetName.trim()
                    ? 'primary-metal-button text-white'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                "
              >
                Save
              </button>
            </div>

            <div class="relative">
              <Search class="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                v-model="presetSearch"
                type="text"
                placeholder="Search presets..."
                class="h-8 w-full pl-7 pr-2 text-xs rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>

            <Select
              :model-value="selectedPresetId"
              size="sm"
              placeholder="Select preset..."
              :options="presetOptions"
              class="h-8"
              @update:model-value="selectPreset"
            />

            <div class="flex items-center gap-2">
              <button
                @click="overwriteSelectedPreset"
                :disabled="!selectedPreset || selectedPreset.builtin"
                class="h-8 flex-1 text-xs font-medium rounded-md transition-colors"
                :class="
                  selectedPreset && !selectedPreset.builtin
                    ? 'bg-muted/60 hover:bg-muted text-foreground'
                    : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
                "
              >
                Overwrite
              </button>
              <button
                @click="deleteSelectedPreset"
                :disabled="!selectedPreset || selectedPreset.builtin"
                class="h-8 flex-1 rounded-md transition-colors flex items-center justify-center"
                :class="
                  selectedPreset && !selectedPreset.builtin
                    ? 'bg-muted/60 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground'
                    : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
                "
                title="Delete preset"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

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
                <label class="text-xs text-muted-foreground block mb-1">High Noise</label>
                <Select
                  v-model="config.highNoiseDiffusionModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.diffusion.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground block mb-1">Uncond Diffusion</label>
                <Select
                  v-model="config.uncondDiffusionModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.uncondDiffusion.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
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
              <div v-else>
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

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-xs text-muted-foreground block mb-1">LLM Vision</label>
                <Select
                  v-model="config.llmVisionModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.llmVision.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground block mb-1">Emb. Connectors</label>
                <Select
                  v-model="config.embeddingsConnectorsModel"
                  size="sm"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.embeddingsConnectors.map(m => ({ label: m, value: m }))
                  ]"
                />
              </div>
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

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Audio VAE</label>
              <Select
                v-model="config.audioVaeModel"
                size="sm"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.audioVae.map(m => ({ label: m, value: m }))
                ]"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">VAE Format</label>
              <Select
                v-model="config.vaeFormat"
                size="sm"
                placeholder="Auto"
                :options="[
                  { label: 'Auto', value: '' },
                  { label: 'Flux', value: 'flux' },
                  { label: 'SD3', value: 'sd3' },
                  { label: 'Flux2', value: 'flux2' }
                ]"
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
                  { label: 'GITS', value: 'gits' },
                  { label: 'Smoothstep', value: 'smoothstep' },
                  { label: 'SGM Uniform', value: 'sgm_uniform' },
                  { label: 'Simple', value: 'simple' },
                  { label: 'KL Optimal', value: 'kl_optimal' },
                  { label: 'LCM', value: 'lcm' },
                  { label: 'Bong Tangent', value: 'bong_tangent' },
                  { label: 'LTX2', value: 'ltx2' }
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
                  { label: 'IPNDM', value: 'ipndm' },
                  { label: 'IPNDM V', value: 'ipndm_v' },
                  { label: 'LCM', value: 'lcm' },
                  { label: 'DDIM Trailing', value: 'ddim_trailing' },
                  { label: 'TCD', value: 'tcd' },
                  { label: 'Res Multistep', value: 'res_multistep' },
                  { label: 'Res 2S', value: 'res_2s' },
                  { label: 'ER-SDE', value: 'er_sde' },
                  { label: 'Euler CFG++', value: 'euler_cfg_pp' },
                  { label: 'Euler A CFG++', value: 'euler_a_cfg_pp' }
                ]"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">RNG</label>
              <Select
                v-model="config.rngType"
                size="sm"
                placeholder="Default"
                :options="[
                  { label: 'Default', value: '' },
                  { label: 'CUDA / WebUI', value: 'cuda' },
                  { label: 'CPU / ComfyUI', value: 'cpu' },
                  { label: 'std_default', value: 'std_default' }
                ]"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Sampler RNG</label>
              <Select
                v-model="config.samplerRngType"
                size="sm"
                placeholder="Same"
                :options="[
                  { label: 'Same as RNG', value: '' },
                  { label: 'CUDA / WebUI', value: 'cuda' },
                  { label: 'CPU / ComfyUI', value: 'cpu' },
                  { label: 'std_default', value: 'std_default' }
                ]"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Cache Mode</label>
              <Select
                v-model="config.cacheMode"
                size="sm"
                placeholder="Off"
                :options="[
                  { label: 'Off', value: '' },
                  { label: 'UCache', value: 'ucache' },
                  { label: 'EasyCache', value: 'easycache' },
                  { label: 'DBCache', value: 'dbcache' },
                  { label: 'TaylorSeer', value: 'taylorseer' },
                  { label: 'Cache-DIT', value: 'cache-dit' },
                  { label: 'Spectrum', value: 'spectrum' }
                ]"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">SCM Policy</label>
              <Select
                v-model="config.scmPolicy"
                size="sm"
                placeholder="Dynamic"
                :options="[
                  { label: 'Default', value: '' },
                  { label: 'Dynamic', value: 'dynamic' },
                  { label: 'Static', value: 'static' }
                ]"
              />
            </div>
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Cache Options</label>
            <input
              v-model="config.cacheOption"
              type="text"
              placeholder="threshold=0.25,warmup=4"
              class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">SCM Mask</label>
            <input
              v-model="config.scmMask"
              type="text"
              placeholder="1,1,1,0,0,1"
              class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
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

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Flow Shift</label>
              <input v-model.number="config.flowShift" type="number" step="0.1" placeholder="Auto" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">ETA</label>
              <input v-model.number="config.eta" type="number" step="0.1" placeholder="Auto" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">SLG Scale</label>
              <input v-model.number="config.slgScale" type="number" step="0.1" placeholder="0" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Img CFG</label>
              <input v-model.number="config.imgCfgScale" type="number" step="0.1" placeholder="CFG" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">SLG Start</label>
              <input v-model.number="config.skipLayerStart" type="number" step="0.01" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">SLG End</label>
              <input v-model.number="config.skipLayerEnd" type="number" step="0.01" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Skip Layers</label>
            <input v-model="config.skipLayers" type="text" placeholder="7,8,9" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Sigmas</label>
            <input v-model="config.sigmas" type="text" placeholder="14.61,7.8,3.5,0.0" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Extra Sample Args</label>
            <input v-model="config.extraSampleArgs" type="text" placeholder="apg_eta=0.5,slg_uncond=1" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Extra Tiling Args</label>
            <input v-model="config.extraTilingArgs" type="text" placeholder="temporal_tile_frames=4" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
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
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.vaeOnCpu" type="checkbox" class="rounded" />
              VAE CPU
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.controlNetOnCpu" type="checkbox" class="rounded" />
              Control CPU
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.diffusionConvDirect" type="checkbox" class="rounded" />
              Diff Conv
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.vaeConvDirect" type="checkbox" class="rounded" />
              VAE Conv
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.forceSDXLVaeConvScale" type="checkbox" class="rounded" />
              SDXL VAE Scale
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.streamLayers" type="checkbox" class="rounded" />
              Stream Layers
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.mmap" type="checkbox" class="rounded" />
              mmap
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.disableImageMetadata" type="checkbox" class="rounded" />
              No Metadata
            </label>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Runtime Backend</label>
              <input
                v-model="config.backendAssignment"
                type="text"
                placeholder="auto, cpu, cuda0, vulkan0"
                class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Params Backend</label>
              <input
                v-model="config.paramsBackendAssignment"
                type="text"
                placeholder="cpu or diffusion=gpu,te=cpu"
                class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          </div>

          <p class="text-[10px] text-muted-foreground leading-tight">
            Backend names depend on the active stable-diffusion.cpp release: CPU, CUDA, Vulkan, ROCm, Metal, OpenCL, or SYCL builds expose different devices.
          </p>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Threads</label>
              <input v-model.number="config.threads" type="number" placeholder="-1" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground block mb-1">Max VRAM GiB</label>
              <input v-model.number="config.maxVram" type="number" step="0.1" placeholder="0" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
            </div>
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

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Tensor Type Rules</label>
            <input v-model="config.tensorTypeRules" type="text" placeholder="^vae\\.=f16,model\\.=q8_0" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Prediction</label>
            <Select
              v-model="config.predictionType"
              size="sm"
              placeholder="Auto"
              :options="[
                { label: 'Auto', value: '' },
                { label: 'EPS', value: 'eps' },
                { label: 'V', value: 'v' },
                { label: 'EDM V', value: 'edm_v' },
                { label: 'SD3 Flow', value: 'sd3_flow' },
                { label: 'Flux Flow', value: 'flux_flow' },
                { label: 'Flux2 Flow', value: 'flux2_flow' }
              ]"
            />
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">LoRA Apply Mode</label>
            <Select
              v-model="config.loraApplyMode"
              size="sm"
              :options="[
                { label: 'Auto', value: 'auto' },
                { label: 'Immediately', value: 'immediately' },
                { label: 'At Runtime', value: 'at_runtime' }
              ]"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.circular" type="checkbox" class="rounded" />
              Circular
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.circularX" type="checkbox" class="rounded" />
              Circular X
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.circularY" type="checkbox" class="rounded" />
              Circular Y
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.qwenImageZeroCondT" type="checkbox" class="rounded" />
              Qwen Zero T
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.chromaEnableT5Mask" type="checkbox" class="rounded" />
              Chroma T5 Mask
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input v-model="config.chromaDisableDitMask" type="checkbox" class="rounded" />
              Disable DiT Mask
            </label>
          </div>

          <div>
            <label class="text-xs text-muted-foreground block mb-1">Chroma T5 Mask Pad</label>
            <input v-model.number="config.chromaT5MaskPad" type="number" placeholder="0" class="w-full px-2 py-1.5 text-xs rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
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
    </template>
  </aside>
</template>
