<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useModels } from '@/composables/useModels'
import { useRuntimeStatus } from '@/composables/useRuntimeStatus'
import { storeToRefs } from 'pinia'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Film,
  ImageIcon,
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
} from '@/lib/icons'
import type { Component } from 'vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import ModelHubModal from '@/components/ModelHubModal.vue'
import { useServerControls } from '@/composables/useServerControls'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import { useToast } from '@/composables/useToast'
import { useRemoteSession } from '@/composables/useRemoteSession'
import { cachePresets, findCachePresetId } from '@/lib/cachePresets'

const configStore = useConfigStore()
const { config, presets, selectedPresetId } = storeToRefs(configStore)
const { models, fetchModels } = useModels()

type ConfigPanelFocus = 'all' | 'model' | 'generation' | 'assets' | 'lora' | 'embedding'

const props = withDefaults(
  defineProps<{
    collapsed?: boolean
    focus?: ConfigPanelFocus
  }>(),
  {
    collapsed: false,
    focus: 'all'
  }
)

const emit = defineEmits<{
  close: []
  expand: []
}>()

// Backend status
const {
  sdServerRunning,
  backendVersion,
  backendValid,
  logs,
  fetchRuntimeStatus,
  startRuntimeStatusPolling,
  stopRuntimeStatusPolling
} = useRuntimeStatus()
const { isBooting, startServer, stopServer } = useServerControls(config, fetchRuntimeStatus)
const {
  supportsStreamLayers,
  supportsMaxVram,
  supportsCacheMode,
  supportsLivePreview,
  supportsOffloadToCpu,
  supportsDiffusionFa,
  fetchCapabilities
} = useBackendCapabilities()
const toast = useToast()
const { isRemote, canControl } = useRemoteSession()
const showModelHub = ref(false)

function applyLowVram(): void {
  configStore.applyLowVramProfile()
  toast.success('Low VRAM profile applied (offload + stream + max VRAM auto)')
}

const selectedCachePresetId = computed({
  get: () => findCachePresetId(config.value),
  set: (id: string) => {
    if (id === 'custom') return
    const preset = cachePresets.find((item) => item.id === id)
    if (!preset) return
    configStore.applyCachePreset(preset)
    toast.success(`Cache: ${preset.label}`)
  }
})

const cachePresetOptions = computed(() => [
  ...cachePresets.map((preset) => ({
    label: preset.label,
    value: preset.id
  })),
  ...(findCachePresetId(config.value) === 'custom'
    ? [{ label: 'Custom (manual fields)', value: 'custom' }]
    : [])
])

const activeCachePreset = computed(() =>
  cachePresets.find((preset) => preset.id === selectedCachePresetId.value)
)

type CollapsedSection = 'backend' | 'presets' | 'models' | 'generation' | 'hardware' | 'warnings'

let hideTimeout: ReturnType<typeof setTimeout> | null = null
const activeCollapsedSection = ref<CollapsedSection | null>(null)
const pinnedCollapsedSection = ref<CollapsedSection | null>(null)
const collapsedSelectOpen = ref(false)

// Presets
const presetName = ref('')
const presetSearch = ref('')

// Collapsible sections — start collapsed for progressive disclosure
const expandedSections = ref({
  backend: false,
  presets: false,
  models: false,
  loras: false,
  embeddings: false,
  sampling: false,
  generation: false,
  hardware: false
})

/** Extra model slots (CLIP, high-noise, TAESD, …) — off by default in Model setup */
const showAdvancedModels = ref(false)

// Model setup: presets + core models open; hardware stays collapsed until needed.
watch(
  () => props.focus,
  (focus) => {
    if (focus === 'model') {
      expandedSections.value.presets = true
      expandedSections.value.models = true
      expandedSections.value.hardware = false
      showAdvancedModels.value = false
    }
  },
  { immediate: true }
)

/** Simple hides advanced sampling/cache/chroma fields; advanced shows everything */
const CONFIG_DENSITY_KEY = 'flaxeo-config-density'
const configDensity = ref<'simple' | 'advanced'>(
  typeof localStorage !== 'undefined' && localStorage.getItem(CONFIG_DENSITY_KEY) === 'advanced'
    ? 'advanced'
    : 'simple'
)
const showAdvancedConfig = computed(() => configDensity.value === 'advanced')

function setConfigDensity(value: string): void {
  if (value !== 'simple' && value !== 'advanced') return
  configDensity.value = value
  if (typeof localStorage !== 'undefined') localStorage.setItem(CONFIG_DENSITY_KEY, value)
}

const densityOptions = [
  { value: 'simple', label: 'Simple' },
  { value: 'advanced', label: 'Advanced' }
]

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
  if (config.value.backendMode === 'server' && !sdServerRunning.value)
    warnings.push('Server mode is selected but sd-server is offline')
  if (config.value.loadMode === 'standard' && !config.value.standardModel)
    warnings.push('No checkpoint selected')
  if (config.value.loadMode === 'split' && !config.value.diffusionModel)
    warnings.push('No diffusion model selected')
  if (config.value.videoMode && config.value.loadMode !== 'split')
    warnings.push('Video presets need split model loading')
  if (config.value.videoMode && !config.value.t5xxlModel)
    warnings.push('Video mode usually requires T5XXL/UMT5')
  return warnings
})

const collapsedSections: Array<{ id: CollapsedSection; label: string; icon: Component }> = [
  { id: 'backend', label: 'Backend', icon: Server },
  { id: 'presets', label: 'Presets', icon: Save },
  { id: 'models', label: 'Models', icon: Database },
  { id: 'generation', label: 'Generation', icon: SlidersHorizontal },
  { id: 'hardware', label: 'Hardware', icon: Cpu },
  { id: 'warnings', label: 'Warnings', icon: AlertTriangle }
]

const backendModeOptions = [
  { value: 'server', label: 'Server', icon: Server },
  { value: 'cli', label: 'CLI', icon: Terminal }
]

const mediaModeOptions = [
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'video', label: 'Video', icon: Film }
]

const loadModeOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'split', label: 'Flow' }
]

const collapsedSectionTargets: Partial<
  Record<CollapsedSection, keyof typeof expandedSections.value>
> = {
  presets: 'presets',
  generation: 'generation',
  hardware: 'hardware'
}

const activeModelSummary = computed(() => {
  const parts = [
    config.value.loadMode === 'standard' ? config.value.standardModel : config.value.diffusionModel
  ]
  if (config.value.vaeModel) parts.push(config.value.vaeModel)
  if (config.value.t5xxlModel) parts.push(config.value.t5xxlModel)
  if (config.value.llmModel) parts.push(config.value.llmModel)
  if (config.value.clipModel) parts.push(config.value.clipModel)
  if (config.value.clipGModel) parts.push(config.value.clipGModel)
  if (config.value.clipVisionModel) parts.push(config.value.clipVisionModel)
  if (config.value.highNoiseDiffusionModel) parts.push(config.value.highNoiseDiffusionModel)
  if (config.value.uncondDiffusionModel) parts.push(config.value.uncondDiffusionModel)
  if (config.value.llmVisionModel) parts.push(config.value.llmVisionModel)
  if (config.value.embeddingsConnectorsModel) parts.push(config.value.embeddingsConnectorsModel)
  return parts.filter(Boolean).slice(0, 4)
})

const panelTitle = computed(() => {
  if (props.focus === 'model') return 'Model setup'
  if (props.focus === 'generation') return 'Generation settings'
  if (props.focus === 'lora') return 'LoRA setup'
  if (props.focus === 'embedding') return 'Embedding setup'
  if (props.focus === 'assets') return 'Prompt assets'
  return 'Generation setup'
})

/** Modal shell always passes a focus other than "all" */
const isSetupModal = computed(() => props.focus !== 'all')

function finishSetup(): void {
  emit('close')
}

const activeCollapsedMeta = computed(() =>
  collapsedSections.find((section) => section.id === activeCollapsedSection.value)
)

function collapsedSectionSummary(section: CollapsedSection): string {
  if (section === 'backend') return sdServerRunning.value ? 'Server online' : 'CLI or offline'
  if (section === 'presets') return selectedPreset.value?.name || `${presets.value.length} saved`
  if (section === 'models')
    return config.value.loadMode === 'standard' ? 'Checkpoint mode' : 'Split model mode'
  if (section === 'generation')
    return `${config.value.steps} steps · ${config.value.width}x${config.value.height}`
  if (section === 'hardware') return config.value.backendAssignment || 'Auto backend'
  if (section === 'warnings')
    return configWarnings.value.length
      ? `${configWarnings.value.length} warning${configWarnings.value.length === 1 ? '' : 's'}`
      : 'All clear'
  return ''
}

const presetOptions = computed(() => [
  { label: 'Select preset...', value: '' },
  ...(selectedPreset.value &&
  !filteredPresets.value.some((preset) => preset.id === selectedPreset.value?.id)
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

function expandFromCollapsed(section: CollapsedSection): void {
  const target = collapsedSectionTargets[section]
  if (target) expandedSections.value[target] = true
  emit('expand')
}

function showCollapsedFlyout(section: CollapsedSection): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  activeCollapsedSection.value = section
}

function pinCollapsedFlyout(section: CollapsedSection): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  pinnedCollapsedSection.value = pinnedCollapsedSection.value === section ? null : section
  activeCollapsedSection.value = pinnedCollapsedSection.value || section
}

function hideCollapsedFlyout(section: CollapsedSection): void {
  if (pinnedCollapsedSection.value !== section && !collapsedSelectOpen.value) {
    hideTimeout = setTimeout(() => {
      if (pinnedCollapsedSection.value !== section) activeCollapsedSection.value = null
    }, 200)
  }
}

function closeCollapsedFlyout(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  pinnedCollapsedSection.value = null
  activeCollapsedSection.value = null
  collapsedSelectOpen.value = false
}

function handleCollapsedSelectOpen(open: boolean): void {
  collapsedSelectOpen.value = open
  if (open && hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

// Backend mode toggle
function setBackendMode(mode: 'server' | 'cli'): void {
  configStore.updateConfig({ backendMode: mode })
}

function handleBackendMode(value: string): void {
  if (value === 'server' || value === 'cli') setBackendMode(value)
}

function handleLoadMode(value: string): void {
  if (value === 'standard' || value === 'split') setLoadMode(value)
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
  const selectedModel = config.value.standardModel || config.value.diffusionModel
  configStore.updateConfig({
    loadMode: mode,
    ...(mode === 'standard'
      ? { standardModel: config.value.standardModel || selectedModel }
      : { diffusionModel: config.value.diffusionModel || selectedModel })
  })
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
  startRuntimeStatusPolling()
  fetchCapabilities().catch(() => undefined)
  try {
    if (!isRemote && sessionStorage.getItem('flaxeo-open-model-hub') === '1') {
      sessionStorage.removeItem('flaxeo-open-model-hub')
      showModelHub.value = true
    }
  } catch {
    /* ignore */
  }
})

onUnmounted(() => {
  stopRuntimeStatusPolling()
})
</script>

<template>
  <aside
    class="config-panel flex h-full min-h-0 w-full flex-col bg-background"
    :class="props.collapsed ? 'z-50 overflow-visible border-r border-border/70' : 'overflow-hidden'"
  >
    <div
      v-if="props.collapsed"
      class="relative h-full flex-col items-center gap-1 bg-sidebar px-1.5 py-2 titlebar-no-drag md:flex"
    >
      <div class="flex flex-col items-center gap-1">
        <Tooltip
          v-for="section in collapsedSections"
          :key="section.id"
          :text="section.label"
          position="right"
        >
          <button
            class="aui-icon-button collapsed-sidebar-btn group relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-150 titlebar-no-drag"
            :class="[
              section.id === 'warnings' && configWarnings.length > 0
                ? 'text-yellow-500 hover:text-yellow-500'
                : 'text-muted-foreground hover:text-foreground',
              activeCollapsedSection === section.id || pinnedCollapsedSection === section.id
                ? 'bg-sidebar-accent border-sidebar-border text-sidebar-accent-foreground shadow-sm'
                : 'border-transparent'
            ]"
            type="button"
            @mouseenter="showCollapsedFlyout(section.id)"
            @mouseleave="hideCollapsedFlyout(section.id)"
            @click="pinCollapsedFlyout(section.id)"
          >
            <component :is="section.icon" class="w-4 h-4" />
            <span
              v-if="section.id === 'warnings' && configWarnings.length > 0"
              class="aui-status-badge absolute -right-0.5 -top-0.5 min-w-3.5 rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black shadow-sm"
              >{{ configWarnings.length }}</span
            >
          </button>
        </Tooltip>
      </div>

      <div class="mt-auto h-px w-5 bg-sidebar-border/80"></div>

      <div class="flex flex-col items-center gap-1 text-[9px] text-muted-foreground">
        <span class="font-semibold">{{ config.steps }}</span>
        <span>{{ config.width }}</span>
      </div>

      <div
        v-if="activeCollapsedSection"
        class="config-panel__flyout absolute left-full top-0 z-50 ml-2 max-h-[calc(100vh-1rem)] w-[280px] overflow-y-auto rounded-xl border border-border/80 bg-popover p-3.5 shadow-xl shadow-black/10 dark:shadow-black/30"
        @mouseenter="showCollapsedFlyout(activeCollapsedSection)"
        @mouseleave="hideCollapsedFlyout(activeCollapsedSection)"
      >
        <div class="mb-3 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
          <div class="flex min-w-0 items-center gap-2">
            <component
              v-if="activeCollapsedMeta"
              :is="activeCollapsedMeta.icon"
              class="h-4 w-4 text-muted-foreground"
            />
            <div class="min-w-0">
              <h3 class="truncate text-sm font-medium">{{ activeCollapsedMeta?.label }}</h3>
              <p class="truncate text-[11px] text-muted-foreground">
                {{ collapsedSectionSummary(activeCollapsedSection) }}
              </p>
            </div>
          </div>
          <button
            class="aui-icon-button collapsed-sidebar-btn inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            @click="closeCollapsedFlyout"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="activeCollapsedSection === 'backend'" class="space-y-3">
          <div class="rounded-lg bg-muted/40 p-3 text-xs space-y-2">
            <div class="flex items-center justify-between">
              <span>Backend</span>
              <span :class="backendValid ? 'text-green-500' : 'text-red-500'">{{
                backendVersion
              }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Server</span>
              <span :class="sdServerRunning ? 'text-green-500' : 'text-muted-foreground'">{{
                sdServerRunning ? 'Online' : 'Offline'
              }}</span>
            </div>
          </div>
          <SegmentedControl
            :model-value="config.backendMode"
            :options="backendModeOptions"
            class="w-full"
            size="sm"
            @update:model-value="handleBackendMode"
          />
          <div v-if="config.backendMode === 'server' && canControl" class="flex gap-2">
            <button
              @click="startServer"
              :disabled="sdServerRunning || isBooting || !backendValid"
              class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs font-medium transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              :class="
                sdServerRunning || isBooting || !backendValid
                  ? 'text-muted-foreground'
                  : 'text-green-600'
              "
            >
              <Play class="w-3.5 h-3.5" />
              {{ isBooting ? 'Booting...' : 'Start' }}
            </button>
            <button
              @click="stopServer"
              :disabled="!sdServerRunning"
              class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs font-medium transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              :class="!sdServerRunning ? 'text-muted-foreground' : 'text-red-600'"
            >
              <Square class="w-3.5 h-3.5" />
              Stop
            </button>
          </div>
        </div>

        <div v-else-if="activeCollapsedSection === 'presets'" class="space-y-3">
          <Select
            :model-value="selectedPresetId"
            size="md"
            :options="presetOptions"
            @update:model-value="selectPreset"
            @update:open="handleCollapsedSelectOpen"
          />
          <div class="flex gap-2">
            <input
              v-model="presetName"
              type="text"
              placeholder="Preset name..."
              class="aui-field h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button
              @click="saveCurrentPreset"
              :disabled="!presetName.trim()"
              class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              @click="overwriteSelectedPreset"
              :disabled="!selectedPreset || selectedPreset.builtin"
              class="rounded-lg bg-muted px-3 py-2 text-xs font-medium transition-colors duration-150 hover:bg-accent disabled:opacity-40"
            >
              Overwrite
            </button>
            <button
              @click="deleteSelectedPreset"
              :disabled="!selectedPreset || selectedPreset.builtin"
              class="rounded-lg bg-muted px-3 py-2 text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/10 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>

        <div v-else-if="activeCollapsedSection === 'models'" class="space-y-3">
          <SegmentedControl
            :model-value="config.loadMode"
            :options="loadModeOptions"
            class="w-full"
            size="sm"
            @update:model-value="handleLoadMode"
          />
          <template v-if="config.loadMode === 'standard'">
            <Select
              v-model="config.standardModel"
              size="md"
              placeholder="Checkpoint"
              :options="[
                { label: 'Select model...', value: '' },
                ...models.diffusion.map((m) => ({ label: m, value: m }))
              ]"
              @update:open="handleCollapsedSelectOpen"
            />
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.vaeModel"
                size="md"
                placeholder="VAE"
                :options="[
                  { label: 'VAE...', value: '' },
                  ...models.vae.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.t5xxlModel"
                size="md"
                placeholder="T5XXL"
                :options="[
                  { label: 'T5XXL...', value: '' },
                  ...models.t5xxl.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.llmModel"
                size="md"
                placeholder="LLM"
                :options="[
                  { label: 'LLM...', value: '' },
                  ...models.llm.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.clipModel"
                size="md"
                placeholder="CLIP-L"
                :options="[
                  { label: 'CLIP-L...', value: '' },
                  ...models.clip.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.clipGModel"
                size="md"
                placeholder="CLIP-G"
                :options="[
                  { label: 'CLIP-G...', value: '' },
                  ...models.clipG.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.clipVisionModel"
                size="md"
                placeholder="CLIP Vision"
                :options="[
                  { label: 'CLIP Vision...', value: '' },
                  ...models.clipVision.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
          </template>
          <template v-else>
            <Select
              v-model="config.diffusionModel"
              size="md"
              placeholder="Diffusion"
              :options="[
                { label: 'Diffusion...', value: '' },
                ...models.diffusion.map((m) => ({ label: m, value: m }))
              ]"
              @update:open="handleCollapsedSelectOpen"
            />
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.highNoiseDiffusionModel"
                size="md"
                placeholder="High Noise"
                :options="[
                  { label: 'High Noise...', value: '' },
                  ...models.diffusion.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.uncondDiffusionModel"
                size="md"
                placeholder="Uncond"
                :options="[
                  { label: 'Uncond...', value: '' },
                  ...models.uncondDiffusion.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.vaeModel"
                size="md"
                placeholder="VAE"
                :options="[
                  { label: 'VAE...', value: '' },
                  ...models.vae.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.t5xxlModel"
                size="md"
                placeholder="T5XXL"
                :options="[
                  { label: 'T5XXL...', value: '' },
                  ...models.t5xxl.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.llmModel"
                size="md"
                placeholder="LLM"
                :options="[
                  { label: 'LLM...', value: '' },
                  ...models.llm.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.clipModel"
                size="md"
                placeholder="CLIP-L"
                :options="[
                  { label: 'CLIP-L...', value: '' },
                  ...models.clip.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.clipGModel"
                size="md"
                placeholder="CLIP-G"
                :options="[
                  { label: 'CLIP-G...', value: '' },
                  ...models.clipG.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.clipVisionModel"
                size="md"
                placeholder="CLIP Vision"
                :options="[
                  { label: 'CLIP Vision...', value: '' },
                  ...models.clipVision.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                v-model="config.llmVisionModel"
                size="md"
                placeholder="LLM Vision"
                :options="[
                  { label: 'LLM Vision...', value: '' },
                  ...models.llmVision.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
              <Select
                v-model="config.embeddingsConnectorsModel"
                size="md"
                placeholder="Emb. Conn."
                :options="[
                  { label: 'Emb. Conn...', value: '' },
                  ...models.embeddingsConnectors.map((m) => ({ label: m, value: m }))
                ]"
                @update:open="handleCollapsedSelectOpen"
              />
            </div>
          </template>
          <div
            v-if="activeModelSummary.length"
            class="space-y-1 pt-1 text-[11px] text-muted-foreground"
          >
            <div v-for="item in activeModelSummary" :key="item" class="truncate">{{ item }}</div>
          </div>
        </div>

        <div
          v-else-if="activeCollapsedSection === 'generation'"
          class="grid grid-cols-1 md:grid-cols-2 gap-2"
        >
          <label class="text-sm text-muted-foreground"
            >Steps<input
              v-model.number="config.steps"
              type="number"
              class="mt-1 w-full rounded-md bg-muted/50 px-3 py-2 text-foreground"
          /></label>
          <label class="text-sm text-muted-foreground"
            >CFG<input
              v-model.number="config.cfgScale"
              type="number"
              step="0.5"
              class="mt-1 w-full rounded-md bg-muted/50 px-3 py-2 text-foreground"
          /></label>
          <label class="text-sm text-muted-foreground"
            >Width<input
              v-model.number="config.width"
              type="number"
              step="64"
              class="mt-1 w-full rounded-md bg-muted/50 px-3 py-2 text-foreground"
          /></label>
          <label class="text-sm text-muted-foreground"
            >Height<input
              v-model.number="config.height"
              type="number"
              step="64"
              class="mt-1 w-full rounded-md bg-muted/50 px-3 py-2 text-foreground"
          /></label>
          <label class="col-span-2 text-sm text-muted-foreground"
            >Seed<input
              v-model.number="config.seed"
              type="number"
              class="mt-1 w-full rounded-md bg-muted/50 px-3 py-2 text-foreground"
          /></label>
        </div>

        <div v-else-if="activeCollapsedSection === 'hardware'" class="space-y-3">
          <button
            type="button"
            class="w-full rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
            @click="applyLowVram"
          >
            Apply Low VRAM profile
          </button>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <label
              class="flex items-center gap-2"
              :class="!supportsDiffusionFa && 'opacity-50'"
              :title="supportsDiffusionFa ? undefined : 'Not advertised by active sd-cli'"
              ><input
                v-model="config.flashAttention"
                type="checkbox"
                :disabled="!supportsDiffusionFa"
              />
              Flash</label
            >
            <label class="flex items-center gap-2"
              ><input v-model="config.vaeTiling" type="checkbox" /> VAE Tile</label
            >
            <label class="flex items-center gap-2"
              ><input v-model="config.clipOnCpu" type="checkbox" /> CLIP CPU</label
            >
            <label
              class="flex items-center gap-2"
              :class="!supportsOffloadToCpu && 'opacity-50'"
              :title="supportsOffloadToCpu ? undefined : 'Not advertised by active sd-cli'"
              ><input
                v-model="config.cpuOffload"
                type="checkbox"
                :disabled="!supportsOffloadToCpu"
              />
              Offload</label
            >
          </div>
          <input
            v-model="config.backendAssignment"
            type="text"
            placeholder="Backend: cuda0, vulkan0, cpu"
            class="w-full rounded-md bg-muted/50 px-3 py-2 text-sm"
          />
          <input
            v-model="config.paramsBackendAssignment"
            type="text"
            placeholder="Params backend"
            class="w-full rounded-md bg-muted/50 px-3 py-2 text-sm"
          />
          <label class="text-sm text-muted-foreground"
            >Max VRAM GiB<input
              v-model.number="config.maxVram"
              type="number"
              step="0.1"
              class="mt-1 w-full rounded-md bg-muted/50 px-3 py-2 text-foreground"
          /></label>
        </div>

        <div v-else-if="activeCollapsedSection === 'warnings'" class="space-y-2">
          <div
            v-if="configWarnings.length === 0"
            class="rounded-lg bg-green-500/10 p-3 text-sm text-green-600"
          >
            Configuration looks ready.
          </div>
          <div
            v-for="warning in configWarnings"
            :key="warning"
            class="rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-600"
          >
            {{ warning }}
          </div>
        </div>
      </div>
    </div>
    <ModelHubModal :open="showModelHub" @close="showModelHub = false" />

    <template v-if="!props.collapsed">
      <div
        class="aui-scroll-header config-panel__header hidden h-12 items-center justify-between gap-3 bg-background px-4 md:flex md:px-5"
      >
        <div class="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight">
          <SlidersHorizontal class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ panelTitle }}</span>
        </div>
        <!-- Exit is via Finish in the footer for setup modals -->
        <button
          v-if="!isSetupModal"
          type="button"
          class="aui-icon-button inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          title="Close"
          aria-label="Close"
          @click="emit('close')"
        >
          <X class="h-3.5 w-3.5" />
        </button>
        <div class="aui-scroll-header__fade" aria-hidden="true" />
      </div>

      <!-- Mobile Header -->
      <div
        class="aui-scroll-header config-panel__header mobile-sheet-header flex h-12 items-center bg-background px-4 md:hidden"
      >
        <h2 class="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
          {{ panelTitle }}
        </h2>
        <div class="aui-scroll-header__fade" aria-hidden="true" />
      </div>

      <!-- Scrollable Content -->
      <div
        class="config-panel__content flex-1 overflow-y-auto p-4 md:px-5 md:py-4"
        :class="[
          isSetupModal ? 'space-y-5 pb-4' : 'space-y-4 pb-8',
          isSetupModal ? 'config-panel__content--flat' : ''
        ]"
      >
        <!-- Server / CLI Toggle (always visible) -->
        <section v-if="props.focus === 'all'">
          <div class="space-y-2">
            <SegmentedControl
              :model-value="config.backendMode"
              :options="backendModeOptions"
              class="w-full"
              @update:model-value="handleBackendMode"
            />

            <!-- Server Controls (only in server mode) -->
            <div v-if="config.backendMode === 'server' && canControl" class="flex gap-2">
              <button
                @click="startServer"
                :disabled="sdServerRunning || isBooting || !backendValid"
                class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-medium transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                :class="
                  sdServerRunning || isBooting || !backendValid
                    ? 'text-muted-foreground'
                    : 'text-green-600'
                "
              >
                <Play class="w-3.5 h-3.5" />
                {{ isBooting ? 'Booting...' : 'Start' }}
              </button>
              <button
                @click="stopServer"
                :disabled="!sdServerRunning"
                class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-medium transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                :class="!sdServerRunning ? 'text-muted-foreground' : 'text-red-600'"
              >
                <Square class="w-3.5 h-3.5" />
                Stop
              </button>
            </div>

            <!-- Image / Video Mode -->
            <SegmentedControl
              :model-value="config.videoMode ? 'video' : 'image'"
              :options="mediaModeOptions"
              class="w-full"
              @update:model-value="configStore.updateConfig({ videoMode: $event === 'video' })"
            />

            <div class="flex items-center justify-between gap-2 pt-1">
              <span class="text-[11px] text-muted-foreground">Config density</span>
              <SegmentedControl
                :model-value="configDensity"
                :options="densityOptions"
                size="sm"
                aria-label="Config density"
                @update:model-value="setConfigDensity"
              />
            </div>
          </div>
        </section>

        <!-- PRESETS (flat — no nested card) -->
        <section v-if="props.focus === 'all' || props.focus === 'model'" class="space-y-2.5">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-sm font-medium text-foreground">Presets</h3>
            <span class="text-[11px] tabular-nums text-muted-foreground">{{ presets.length }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <Select
              :model-value="selectedPresetId"
              size="md"
              placeholder="Load preset…"
              :options="presetOptions"
              class="h-9 flex-1"
              @update:model-value="selectPreset"
            />
            <button
              type="button"
              :disabled="!selectedPreset || selectedPreset.builtin"
              class="aui-icon-button inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-30"
              title="Delete preset"
              @click="deleteSelectedPreset"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
          <div class="flex items-center gap-1.5">
            <input
              v-model="presetName"
              type="text"
              placeholder="Save current as…"
              class="aui-field h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
              @keyup.enter="saveCurrentPreset"
            />
            <button
              type="button"
              :disabled="!presetName.trim()"
              class="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              @click="saveCurrentPreset"
            >
              Save
            </button>
          </div>
        </section>

        <!-- MODELS (flat field stack) -->
        <section v-if="props.focus === 'all' || props.focus === 'model'" class="space-y-3">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-sm font-medium text-foreground">Models</h3>
            <button
              v-if="!isRemote"
              type="button"
              class="text-xs font-medium text-primary transition-colors hover:underline"
              @click="showModelHub = true"
            >
              Model Hub
            </button>
          </div>

          <SegmentedControl
            :model-value="config.loadMode"
            :options="loadModeOptions"
            class="w-full"
            @update:model-value="handleLoadMode"
          />

          <div class="space-y-3">
            <!-- Core: main model -->
            <div v-if="config.loadMode === 'standard'">
              <label class="mb-1.5 block text-xs text-muted-foreground">Checkpoint</label>
              <Select
                v-model="config.standardModel"
                size="md"
                placeholder="Select model…"
                :options="[
                  { label: 'Select model…', value: '' },
                  ...models.diffusion.map((m) => ({ label: m, value: m }))
                ]"
              />
            </div>
            <div v-else class="space-y-3">
              <div>
                <label class="mb-1.5 block text-xs text-muted-foreground">Diffusion</label>
                <Select
                  v-model="config.diffusionModel"
                  size="md"
                  placeholder="Select…"
                  :options="[
                    { label: 'Select…', value: '' },
                    ...models.diffusion.map((m) => ({ label: m, value: m }))
                  ]"
                />
              </div>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-xs text-muted-foreground">T5 / UMT5</label>
                  <Select
                    v-model="config.t5xxlModel"
                    size="md"
                    placeholder="None"
                    :options="[
                      { label: 'None', value: '' },
                      ...models.t5xxl.map((m) => ({ label: m, value: m }))
                    ]"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-xs text-muted-foreground">LLM</label>
                  <Select
                    v-model="config.llmModel"
                    size="md"
                    placeholder="None"
                    :options="[
                      { label: 'None', value: '' },
                      ...models.llm.map((m) => ({ label: m, value: m }))
                    ]"
                  />
                </div>
              </div>
            </div>

            <!-- Core: VAE -->
            <div>
              <label class="mb-1.5 block text-xs text-muted-foreground">VAE</label>
              <Select
                v-model="config.vaeModel"
                size="md"
                placeholder="None"
                :options="[
                  { label: 'None', value: '' },
                  ...models.vae.map((m) => ({ label: m, value: m }))
                ]"
              />
              <p
                v-if="
                  config.vaeModel === 'ae.sft' &&
                  !(config.diffusionModel || config.standardModel || '')
                    .toLowerCase()
                    .includes('flux')
                "
                class="mt-1.5 text-xs leading-relaxed text-yellow-600"
              >
                ae.sft is for Flux — may fail with SDXL / Pony.
              </p>
            </div>

            <!-- Advanced slots — text toggle, no bordered card -->
            <button
              type="button"
              class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              @click="showAdvancedModels = !showAdvancedModels"
            >
              <component :is="showAdvancedModels ? ChevronUp : ChevronDown" class="h-3.5 w-3.5" />
              {{ showAdvancedModels ? 'Fewer components' : 'More components' }}
            </button>

            <div v-show="showAdvancedModels" class="space-y-3">
              <template v-if="config.loadMode === 'split'">
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                      >High noise</label
                    >
                    <Select
                      v-model="config.highNoiseDiffusionModel"
                      size="md"
                      placeholder="None"
                      :options="[
                        { label: 'None', value: '' },
                        ...models.diffusion.map((m) => ({ label: m, value: m }))
                      ]"
                    />
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                      >Uncond diffusion</label
                    >
                    <Select
                      v-model="config.uncondDiffusionModel"
                      size="md"
                      placeholder="None"
                      :options="[
                        { label: 'None', value: '' },
                        ...models.uncondDiffusion.map((m) => ({ label: m, value: m }))
                      ]"
                    />
                  </div>
                </div>
                <div v-if="!config.videoMode" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                      >CLIP-L</label
                    >
                    <Select
                      v-model="config.clipModel"
                      size="md"
                      placeholder="None"
                      :options="[
                        { label: 'None', value: '' },
                        ...models.clip.map((m) => ({ label: m, value: m }))
                      ]"
                    />
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                      >CLIP-G</label
                    >
                    <Select
                      v-model="config.clipGModel"
                      size="md"
                      placeholder="None"
                      :options="[
                        { label: 'None', value: '' },
                        ...models.clipG.map((m) => ({ label: m, value: m }))
                      ]"
                    />
                  </div>
                </div>
                <div v-if="!config.videoMode">
                  <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >CLIP Vision</label
                  >
                  <Select
                    v-model="config.clipVisionModel"
                    size="md"
                    placeholder="None"
                    :options="[
                      { label: 'None', value: '' },
                      ...models.clipVision.map((m) => ({ label: m, value: m }))
                    ]"
                  />
                </div>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                      >LLM Vision</label
                    >
                    <Select
                      v-model="config.llmVisionModel"
                      size="md"
                      placeholder="None"
                      :options="[
                        { label: 'None', value: '' },
                        ...models.llmVision.map((m) => ({ label: m, value: m }))
                      ]"
                    />
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                      >Emb. connectors</label
                    >
                    <Select
                      v-model="config.embeddingsConnectorsModel"
                      size="md"
                      placeholder="None"
                      :options="[
                        { label: 'None', value: '' },
                        ...models.embeddingsConnectors.map((m) => ({ label: m, value: m }))
                      ]"
                    />
                  </div>
                </div>
              </template>

              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >VAE tile</label
                  >
                  <input
                    v-model.number="config.vaeTileSize"
                    type="number"
                    placeholder="0"
                    class="aui-field w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >VAE format</label
                  >
                  <Select
                    v-model="config.vaeFormat"
                    size="md"
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
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >Audio VAE</label
                  >
                  <Select
                    v-model="config.audioVaeModel"
                    size="md"
                    placeholder="None"
                    :options="[
                      { label: 'None', value: '' },
                      ...models.audioVae.map((m) => ({ label: m, value: m }))
                    ]"
                  />
                </div>
                <div v-if="!config.videoMode">
                  <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >ControlNet</label
                  >
                  <Select
                    v-model="config.controlNetModel"
                    size="md"
                    placeholder="None"
                    :options="[
                      { label: 'None', value: '' },
                      ...models.controlnet.map((m) => ({ label: m, value: m }))
                    ]"
                  />
                </div>
              </div>
              <div v-if="!config.videoMode" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >PhotoMaker</label
                  >
                  <Select
                    v-model="config.photoMakerModel"
                    size="md"
                    placeholder="None"
                    :options="[
                      { label: 'None', value: '' },
                      ...models.photomaker.map((m) => ({ label: m, value: m }))
                    ]"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >Upscale</label
                  >
                  <Select
                    v-model="config.upscaleModel"
                    size="md"
                    placeholder="None"
                    :options="[
                      { label: 'None', value: '' },
                      ...models.upscale.map((m) => ({ label: m, value: m }))
                    ]"
                  />
                </div>
              </div>
              <div v-if="!config.videoMode">
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">TAESD</label>
                <Select
                  v-model="config.taesdModel"
                  size="md"
                  placeholder="None"
                  :options="[
                    { label: 'None', value: '' },
                    ...models.taesd.map((m) => ({ label: m, value: m }))
                  ]"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- GENERATION SETTINGS -->
        <section v-if="props.focus === 'all' || props.focus === 'generation'" class="pt-3">
          <div class="py-1">
            <span class="text-sm font-medium text-foreground">Generation settings</span>
          </div>

          <div
            v-show="expandedSections.generation || props.focus === 'generation'"
            class="space-y-5"
          >
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Batch</label
                >
                <input
                  v-model.number="config.batchCount"
                  type="number"
                  min="1"
                  max="16"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Width</label
                >
                <input
                  v-model.number="config.width"
                  type="number"
                  min="64"
                  step="64"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Height</label
                >
                <input
                  v-model.number="config.height"
                  type="number"
                  min="64"
                  step="64"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </div>
            <div>
              <label class="text-sm text-muted-foreground block mb-1">
                Live preview
                <span v-if="!supportsLivePreview" class="text-[10px] text-muted-foreground">
                  (unsupported)
                </span>
              </label>
              <Select
                v-model="config.livePreviewMethod"
                size="md"
                placeholder="None"
                :disabled="!supportsLivePreview"
                :options="[
                  { label: 'None', value: '' },
                  { label: 'Projection', value: 'proj' },
                  { label: 'TAE', value: 'tae' },
                  { label: 'VAE', value: 'vae' }
                ]"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Steps</label
                >
                <input
                  v-model.number="config.steps"
                  type="number"
                  min="1"
                  max="150"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >CFG Scale</label
                >
                <input
                  v-model.number="config.cfgScale"
                  type="number"
                  step="0.5"
                  min="1"
                  max="30"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Guidance</label
                >
                <input
                  v-model.number="config.guidance"
                  type="number"
                  step="0.1"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Clip Skip</label
                >
                <input
                  v-model.number="config.clipSkip"
                  type="number"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </div>
            <div>
              <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                >Seed (-1 random)</label
              >
              <input
                v-model.number="config.seed"
                type="number"
                class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Flow Shift</label
                >
                <input
                  v-model.number="config.flowShift"
                  type="number"
                  step="0.1"
                  placeholder="Auto"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >ETA</label
                >
                <input
                  v-model.number="config.eta"
                  type="number"
                  step="0.1"
                  placeholder="Auto"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >SLG Scale</label
                >
                <input
                  v-model.number="config.slgScale"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Img CFG</label
                >
                <input
                  v-model.number="config.imgCfgScale"
                  type="number"
                  step="0.1"
                  placeholder="CFG"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </div>

            <template v-if="showAdvancedConfig">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                    >SLG Start</label
                  >
                  <input
                    v-model.number="config.skipLayerStart"
                    type="number"
                    step="0.01"
                    class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                    >SLG End</label
                  >
                  <input
                    v-model.number="config.skipLayerEnd"
                    type="number"
                    step="0.01"
                    class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
              </div>

              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Skip Layers</label
                >
                <input
                  v-model="config.skipLayers"
                  type="text"
                  placeholder="7,8,9"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Sigmas</label
                >
                <input
                  v-model="config.sigmas"
                  type="text"
                  placeholder="14.61,7.8,3.5,0.0"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              <div>
                <label class="text-sm text-muted-foreground block mb-1">Extra Sample Args</label>
                <input
                  v-model="config.extraSampleArgs"
                  type="text"
                  placeholder="apg_eta=0.5,slg_uncond=1"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Extra Tiling Args</label
                >
                <input
                  v-model="config.extraTilingArgs"
                  type="text"
                  placeholder="temporal_tile_frames=4"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </template>
          </div>
        </section>

        <!-- LORA MODULES -->
        <section
          v-if="props.focus === 'all' || props.focus === 'assets' || props.focus === 'lora'"
          class="pt-3"
        >
          <div class="flex w-full items-center justify-between py-1">
            <span class="text-sm font-medium text-foreground">LoRA modules</span>
            <div class="flex items-center gap-2">
              <span
                class="aui-status-badge rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                >{{ config.loras.length }}</span
              >
            </div>
          </div>

          <div
            v-show="expandedSections.loras || props.focus === 'assets' || props.focus === 'lora'"
            class="space-y-2"
          >
            <div
              v-for="(lora, index) in config.loras"
              :key="index"
              class="config-panel__item space-y-2 rounded-xl border border-border/70 bg-card p-3"
            >
              <div class="flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <label
                    class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >LoRA {{ index + 1 }}</label
                  >
                  <Select
                    v-model="lora.path"
                    size="md"
                    :options="models.loras.map((m) => ({ label: m, value: m }))"
                  />
                </div>
                <div class="shrink-0">
                  <label
                    class="mb-1.5 block text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >Strength</label
                  >
                  <input
                    v-model.number="lora.strength"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    class="w-20 rounded-lg bg-background px-3 py-2 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring/30"
                    title="Strength"
                  />
                </div>
                <button
                  @click="configStore.removeLora(index)"
                  class="aui-icon-button inline-flex h-9 w-9 items-center justify-center self-end rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="Remove LoRA"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
              <div>
                <label class="mb-1 block text-[10px] font-medium text-muted-foreground"
                  >Branch target (Wan MoE)</label
                >
                <Select
                  :model-value="lora.target || 'default'"
                  size="sm"
                  :options="[
                    { label: 'Default / low noise', value: 'default' },
                    { label: 'High noise (|high_noise|)', value: 'high_noise' }
                  ]"
                  @update:model-value="
                    (value) => {
                      lora.target = value === 'high_noise' ? 'high_noise' : 'default'
                    }
                  "
                />
                <p class="mt-1 text-[10px] leading-4 text-muted-foreground">
                  High noise emits
                  <code class="text-foreground/80">&lt;lora:|high_noise|name:s&gt;</code>
                  for Wan2.2 dual-branch LoRAs.
                </p>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-sm text-muted-foreground">Apply mode</label>
              <Select
                v-model="config.loraApplyMode"
                size="md"
                :options="[
                  { label: 'Auto', value: 'auto' },
                  { label: 'Immediately', value: 'immediately' },
                  { label: 'At Runtime', value: 'at_runtime' }
                ]"
              />
            </div>

            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                @click="addNewLora"
                class="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background text-xs font-medium transition-colors duration-150 hover:bg-accent hover:text-foreground"
              >
                <Plus class="h-3.5 w-3.5" />
                Add LoRA
              </button>
              <button
                type="button"
                @click="
                  () => {
                    if (models.loras.length > 0)
                      configStore.addLora(models.loras[0], 1.0, 'high_noise')
                    else toast.error('No LoRA files in models/loras')
                  }
                "
                class="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background text-xs font-medium transition-colors duration-150 hover:bg-accent hover:text-foreground"
                title="Add a LoRA tagged for the high-noise branch"
              >
                <Plus class="h-3.5 w-3.5" />
                Add high-noise LoRA
              </button>
            </div>
          </div>
        </section>

        <!-- EMBEDDINGS -->
        <section
          v-if="props.focus === 'all' || props.focus === 'assets' || props.focus === 'embedding'"
          class="pt-3"
        >
          <div class="flex w-full items-center justify-between py-1">
            <span class="text-sm font-medium text-foreground">Embeddings</span>
            <span class="aui-status-badge rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{{
              config.embeddings.length
            }}</span>
          </div>

          <div
            v-show="
              expandedSections.embeddings || props.focus === 'assets' || props.focus === 'embedding'
            "
            class="space-y-2"
          >
            <div
              v-for="(emb, index) in config.embeddings"
              :key="index"
              class="config-panel__item flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3"
            >
              <div class="flex-1 flex items-center gap-3 overflow-hidden">
                <span
                  class="aui-status-badge shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >TI</span
                >
                <Select
                  :model-value="emb"
                  @update:model-value="
                    (val) => {
                      config.embeddings[index] = val
                    }
                  "
                  size="md"
                  :options="models.embeddings.map((m) => ({ label: m, value: m }))"
                />
              </div>
              <button
                @click="configStore.removeEmbedding(emb)"
                class="aui-icon-button inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="Remove Embedding"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>

            <button
              @click="addNewEmbedding"
              class="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background text-xs font-medium transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <Plus class="w-3.5 h-3.5" />
              Add Embedding
            </button>
          </div>
        </section>

        <!-- SAMPLING -->
        <section v-if="props.focus === 'all' || props.focus === 'generation'" class="pt-3">
          <div class="py-1">
            <span class="text-sm font-medium text-foreground">Sampling</span>
          </div>

          <div v-show="expandedSections.sampling || props.focus === 'generation'" class="space-y-5">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Scheduler</label
                >
                <Select
                  v-model="config.scheduler"
                  size="md"
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
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Sampler</label
                >
                <Select
                  v-model="config.sampler"
                  size="md"
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

            <div v-if="showAdvancedConfig" class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >RNG</label
                >
                <Select
                  v-model="config.rngType"
                  size="md"
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
                <label class="text-base text-muted-foreground block mb-1.5 font-semibold"
                  >Sampler RNG</label
                >
                <Select
                  v-model="config.samplerRngType"
                  size="md"
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

            <div>
              <label class="mb-1.5 block text-base font-semibold text-muted-foreground">
                Cache preset
                <span
                  v-if="!supportsCacheMode"
                  class="text-[10px] font-normal text-muted-foreground"
                >
                  (unsupported by backend)
                </span>
              </label>
              <Select
                v-model="selectedCachePresetId"
                size="md"
                :disabled="!supportsCacheMode"
                :options="cachePresetOptions"
              />
              <p
                v-if="activeCachePreset"
                class="mt-1.5 text-[11px] leading-4 text-muted-foreground"
              >
                {{ activeCachePreset.description }}
              </p>
              <p v-else class="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                Manual fields below do not match a built-in recipe.
              </p>
            </div>

            <template v-if="showAdvancedConfig">
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-base font-semibold text-muted-foreground"
                    >Cache Mode</label
                  >
                  <Select
                    v-model="config.cacheMode"
                    size="md"
                    placeholder="Off"
                    :disabled="!supportsCacheMode"
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
                  <label class="mb-1.5 block text-base font-semibold text-muted-foreground"
                    >SCM Policy</label
                  >
                  <Select
                    v-model="config.scmPolicy"
                    size="md"
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
                <label class="mb-1.5 block text-base font-semibold text-muted-foreground"
                  >Cache Options</label
                >
                <input
                  v-model="config.cacheOption"
                  type="text"
                  placeholder="threshold=0.25,warmup=4"
                  class="w-full rounded-md bg-muted/50 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label class="mb-1.5 block text-base font-semibold text-muted-foreground"
                  >SCM Mask</label
                >
                <input
                  v-model="config.scmMask"
                  type="text"
                  placeholder="1,1,1,0,0,1"
                  class="w-full rounded-md bg-muted/50 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </template>
          </div>
        </section>

        <!-- HARDWARE (flat, collapsed by default in Model setup) -->
        <section v-if="props.focus === 'all' || props.focus === 'model'" class="space-y-2.5">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 text-left"
            @click="expandedSections.hardware = !expandedSections.hardware"
          >
            <h3 class="text-sm font-medium text-foreground">Hardware</h3>
            <span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {{ expandedSections.hardware ? 'Hide' : 'Show' }}
              <component
                :is="expandedSections.hardware ? ChevronUp : ChevronDown"
                class="h-3.5 w-3.5"
              />
            </span>
          </button>

          <div v-show="expandedSections.hardware" class="space-y-4">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
              @click="applyLowVram"
            >
              <Cpu class="h-3.5 w-3.5" />
              Apply Low VRAM profile
            </button>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label
                class="flex cursor-pointer items-center gap-2 text-sm"
                :class="!supportsDiffusionFa && 'opacity-50'"
                :title="
                  supportsDiffusionFa
                    ? 'Flash attention for diffusion'
                    : 'Not advertised by active sd-cli'
                "
              >
                <input
                  v-model="config.flashAttention"
                  type="checkbox"
                  class="rounded"
                  :disabled="!supportsDiffusionFa"
                />
                <Zap class="h-3.5 w-3.5" />
                Flash Attn
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.vaeTiling" type="checkbox" class="rounded" />
                VAE Tiling
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.clipOnCpu" type="checkbox" class="rounded" />
                CLIP CPU
              </label>
              <label
                class="flex cursor-pointer items-center gap-2 text-sm"
                :class="!supportsOffloadToCpu && 'opacity-50'"
                :title="
                  supportsOffloadToCpu
                    ? 'Offload layers to CPU when VRAM is tight'
                    : 'Not advertised by active sd-cli'
                "
              >
                <input
                  v-model="config.cpuOffload"
                  type="checkbox"
                  class="rounded"
                  :disabled="!supportsOffloadToCpu"
                />
                <Cpu class="h-3.5 w-3.5" />
                Offload
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.vaeOnCpu" type="checkbox" class="rounded" />
                VAE CPU
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.controlNetOnCpu" type="checkbox" class="rounded" />
                Control CPU
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.diffusionConvDirect" type="checkbox" class="rounded" />
                Diff Conv
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.vaeConvDirect" type="checkbox" class="rounded" />
                VAE Conv
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.forceSDXLVaeConvScale" type="checkbox" class="rounded" />
                SDXL VAE Scale
              </label>
              <label
                class="flex items-center gap-2 text-sm cursor-pointer"
                :class="!supportsStreamLayers && 'opacity-50'"
                :title="
                  supportsStreamLayers
                    ? 'Stream transformer blocks to fit larger models'
                    : 'Not advertised by active sd-cli'
                "
              >
                <input
                  v-model="config.streamLayers"
                  type="checkbox"
                  class="rounded"
                  :disabled="!supportsStreamLayers"
                />
                Stream Layers
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.autoFit" type="checkbox" class="rounded" />
                Auto Fit
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.mmap" type="checkbox" class="rounded" />
                mmap
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input v-model="config.disableImageMetadata" type="checkbox" class="rounded" />
                No Metadata
              </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-sm text-muted-foreground block mb-1">Runtime Backend</label>
                <input
                  v-model="config.backendAssignment"
                  type="text"
                  :disabled="config.autoFit"
                  placeholder="auto, cpu, cuda0, vulkan0"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-sm text-muted-foreground block mb-1">Params Backend</label>
                <input
                  v-model="config.paramsBackendAssignment"
                  type="text"
                  :disabled="config.autoFit"
                  placeholder="cpu or diffusion=gpu,te=cpu"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </div>

            <p class="text-[10px] text-muted-foreground leading-tight">
              Backend names depend on the active stable-diffusion.cpp release: CPU, CUDA, Vulkan,
              ROCm, Metal, OpenCL, or SYCL builds expose different devices.
            </p>
            <p v-if="config.autoFit" class="text-[10px] text-muted-foreground leading-tight">
              Auto Fit ignores explicit runtime and parameter backend assignments.
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-sm text-muted-foreground block mb-1">Threads</label>
                <input
                  v-model.number="config.threads"
                  type="number"
                  placeholder="-1"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
              <div>
                <label class="text-sm text-muted-foreground block mb-1">
                  Max VRAM GiB
                  <span v-if="!supportsMaxVram" class="text-[10px] text-muted-foreground">
                    (unsupported)
                  </span>
                </label>
                <input
                  v-model.number="config.maxVram"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  :disabled="!supportsMaxVram"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-50"
                />
              </div>
              <div>
                <label class="text-sm text-muted-foreground block mb-1">Split Mode</label>
                <Select
                  v-model="config.splitMode"
                  size="md"
                  :options="[
                    { label: 'Layer (default)', value: 'layer' },
                    { label: 'Row (CUDA)', value: 'row' }
                  ]"
                />
              </div>
            </div>

            <template v-if="showAdvancedConfig">
              <div>
                <label class="text-sm text-muted-foreground block mb-1">Quantization</label>
                <Select
                  v-model="config.quantizationType"
                  size="md"
                  placeholder="Default"
                  :options="[
                    { label: 'Default', value: '' },
                    { label: 'f32 - 32-bit', value: 'f32' },
                    { label: 'f16 - 16-bit', value: 'f16' },
                    { label: 'q8_0 - 8-bit', value: 'q8_0' },
                    { label: 'q5_0 - 5-bit', value: 'q5_0' },
                    { label: 'q4_0 - 4-bit', value: 'q4_0' },
                    { label: 'q4_K', value: 'q4_K' },
                    { label: 'q3_K', value: 'q3_K' },
                    { label: 'q2_K', value: 'q2_K' }
                  ]"
                />
              </div>

              <div>
                <label class="text-sm text-muted-foreground block mb-1">Tensor Type Rules</label>
                <input
                  v-model="config.tensorTypeRules"
                  type="text"
                  placeholder="^vae\\.=f16,model\\.=q8_0"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              <div>
                <label class="text-sm text-muted-foreground block mb-1">Prediction</label>
                <Select
                  v-model="config.predictionType"
                  size="md"
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

              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input v-model="config.circular" type="checkbox" class="rounded" />
                  Circular
                </label>
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input v-model="config.circularX" type="checkbox" class="rounded" />
                  Circular X
                </label>
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input v-model="config.circularY" type="checkbox" class="rounded" />
                  Circular Y
                </label>
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input v-model="config.qwenImageZeroCondT" type="checkbox" class="rounded" />
                  Qwen Zero T
                </label>
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input v-model="config.chromaEnableT5Mask" type="checkbox" class="rounded" />
                  Chroma T5 Mask
                </label>
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input v-model="config.chromaDisableDitMask" type="checkbox" class="rounded" />
                  Disable DiT Mask
                </label>
              </div>

              <div>
                <label class="text-sm text-muted-foreground block mb-1">Chroma T5 Mask Pad</label>
                <input
                  v-model.number="config.chromaT5MaskPad"
                  type="number"
                  placeholder="0"
                  class="w-full px-3 py-2 text-sm rounded-md bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </template>
            <p v-else class="text-[11px] leading-4 text-muted-foreground">
              Switch density to <strong>Advanced</strong> for quantization overrides, prediction
              type, circular padding, and Chroma/Qwen flags.
            </p>
          </div>
        </section>

        <!-- LOGS (for server mode) -->
        <section
          v-if="props.focus === 'all' && config.backendMode === 'server' && canControl"
          class="pt-3"
        >
          <h3 class="mb-2 text-sm font-medium text-foreground">Logs</h3>
          <div
            class="h-32 overflow-y-auto rounded-xl border border-border/70 bg-muted/30 p-3 font-mono text-[10px] leading-relaxed text-foreground"
          >
            <div v-for="(log, i) in logs" :key="i">{{ log }}</div>
            <div v-if="logs.length === 0" class="text-muted-foreground">No logs yet...</div>
          </div>
        </section>
      </div>

      <!-- Primary close action for setup modals (Finish, not X) -->
      <footer
        v-if="isSetupModal"
        class="flex shrink-0 items-center justify-end gap-3 px-4 py-3 md:px-5"
      >
        <p
          v-if="props.focus === 'model' && activeModelSummary.length"
          class="mr-auto truncate text-xs text-muted-foreground"
        >
          {{ activeModelSummary[0]?.split(/[\\/]/).pop() }}
        </p>
        <button
          type="button"
          class="inline-flex h-9 min-w-[7rem] items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          @click="finishSetup"
        >
          Finish
        </button>
      </footer>
    </template>
  </aside>
</template>

<style scoped>
.config-panel {
  --config-field-height: 2.25rem;
  font-size: 0.875rem;
}

.config-panel__content {
  scrollbar-gutter: stable;
}

.config-panel__content > section {
  border-top: 1px solid color-mix(in oklch, var(--border) 75%, transparent);
  padding-top: 1rem;
}

.config-panel__content > section:first-child {
  border-top: 0;
  padding-top: 0;
}

/* Flat setup modal: light section rhythm, no nested panels */
.config-panel__content--flat > section {
  border-top-color: color-mix(in oklch, var(--border) 45%, transparent);
  padding-top: 1.125rem;
}

.config-panel__content--flat > section:first-child {
  border-top: 0;
  padding-top: 0;
}

.config-panel__content .grid {
  gap: 0.75rem;
}

.config-panel label {
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem;
}

.config-panel input:not([type='checkbox']):not([type='radio']) {
  min-height: var(--config-field-height);
  border: 1px solid var(--input);
  border-radius: 0.5rem;
  background: var(--background);
  color: var(--foreground);
  outline: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    background-color 150ms ease;
}

.config-panel input:not([type='checkbox']):not([type='radio'])::placeholder {
  color: color-mix(in oklch, var(--muted-foreground) 68%, transparent);
}

.config-panel input:not([type='checkbox']):not([type='radio']):focus-visible {
  border-color: color-mix(in oklch, var(--ring) 70%, var(--input));
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 18%, transparent);
}

.config-panel input:not([type='checkbox']):not([type='radio']):disabled {
  background: color-mix(in oklch, var(--muted) 60%, transparent);
  color: var(--muted-foreground);
  opacity: 0.65;
}

.config-panel input[type='checkbox'],
.config-panel input[type='radio'] {
  width: 0.875rem;
  height: 0.875rem;
  flex: none;
  accent-color: var(--foreground);
}

.config-panel__content label:has(> input[type='checkbox']) {
  min-height: 2.25rem;
  border-radius: 0.5rem;
  padding: 0.5rem 0.625rem;
  color: var(--foreground);
  transition:
    color 150ms ease,
    background-color 150ms ease;
}

.config-panel__content label:has(> input[type='checkbox']):hover {
  background: color-mix(in oklch, var(--accent) 70%, transparent);
}

.config-panel button {
  transition-duration: 150ms;
}

.config-panel button:not(:disabled):active {
  transform: translateY(0.5px);
}

.config-panel__item {
  transition:
    border-color 150ms ease,
    background-color 150ms ease;
}

.config-panel__item:hover {
  border-color: var(--input);
}

.config-panel__flyout {
  animation: config-panel-flyout-in 150ms ease-out both;
}

@keyframes config-panel-flyout-in {
  from {
    opacity: 0;
    transform: translateX(-4px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@media (max-width: 767px) {
  .config-panel__content {
    scrollbar-gutter: auto;
  }
}
</style>
