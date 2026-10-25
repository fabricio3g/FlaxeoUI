import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ImageGenerationParams, ImageParamsReuseMode } from '@/lib/imageParams'
import { useModels } from '@/composables/useModels'
import {
  DEFAULT_MACHINE,
  DEFAULT_RUN,
  DEFAULT_SETUP,
  mainModel,
  pickSetup,
  SETUP_KEYS,
  type InstalledModels,
  type MachineFields,
  type ModelSetup,
  type ModelSetupFields,
  type RunFields
} from '../../../shared/modelSetup'
import { MODEL_FAMILIES, applyFamily, familyById, inferFamily } from '../../../shared/modelFamilies'

/**
 * GenerationConfig - All parameters for one generation, matching sd-cli arguments.
 * Model setup (per workspace / workflow node), machine settings (per device) and run
 * inputs (per generation) are declared once in src/shared/modelSetup.ts.
 */
export interface GenerationConfig extends ModelSetupFields, MachineFields, RunFields {}

/** Image keeps the main config; Edit and Video each have their own model setup. */
export type WorkspaceSurface = 'image' | 'edit' | 'video'

export interface ConfigPreset {
  id: string
  name: string
  config: GenerationConfig
  createdAt: number
  updatedAt: number
  builtin?: boolean
  /** Built-in presets map to a model family */
  familyId?: string
}

const PRESETS_STORAGE_KEY = 'flaxeo-config-presets'
const CONFIG_STORAGE_KEY = 'flaxeo-current-config'
const SETUPS_STORAGE_KEY = 'flaxeo-workspace-setups'

const defaultConfig: GenerationConfig = { ...DEFAULT_SETUP, ...DEFAULT_MACHINE, ...DEFAULT_RUN }

/** Video workspace starting point (was local state in Video.vue). */
const VIDEO_DEFAULTS: Partial<ModelSetup> = {
  videoMode: true,
  width: 832,
  height: 480,
  videoFrames: 33,
  videoFps: 24,
  flowShift: 3
}

/** One built-in preset per runnable model family. */
const BUILTIN_PRESETS: ConfigPreset[] = MODEL_FAMILIES.filter(
  (family) => family.support !== 'docs'
).map((family) => ({
  id: `builtin-${family.id}`,
  name: family.name,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
  familyId: family.id,
  config: normalizeConfig({
    ...family.defaults,
    modelFamily: family.id,
    loadMode: family.loadMode,
    videoMode: family.kind === 'video'
  })
}))

/** Preset ids used before presets came from the family catalog (hub packs, saved state). */
const LEGACY_PRESET_FAMILY: Record<string, { family: string; overrides?: Partial<ModelSetup> }> = {
  'builtin-sd35': { family: 'sd3' },
  'builtin-flux-dev': { family: 'flux1-dev' },
  'builtin-flux-schnell': { family: 'flux1-schnell' },
  'builtin-qwen-image-edit': { family: 'qwen-image-edit' },
  'builtin-qwen-image-edit-2511': {
    family: 'qwen-image-edit',
    overrides: { qwenImageZeroCondT: true }
  },
  'builtin-z-image-turbo': { family: 'z-image' },
  'builtin-lens-turbo': { family: 'lens', overrides: { cfgScale: 1, steps: 4 } },
  'builtin-wan22-a14b': { family: 'wan22' },
  'builtin-animatediff-v3': { family: 'animatediff' }
}

/** Resolve a built-in or legacy preset id to its family (+ overrides). */
export function presetFamily(
  id: string
): { family: string; overrides?: Partial<ModelSetup> } | null {
  if (LEGACY_PRESET_FAMILY[id]) return LEGACY_PRESET_FAMILY[id]
  const familyId = id.startsWith('builtin-') ? id.slice('builtin-'.length) : ''
  return familyById(familyId) ? { family: familyId } : null
}

function cloneConfig(value: GenerationConfig): GenerationConfig {
  return JSON.parse(JSON.stringify(value))
}

function normalizeConfig(value: Partial<GenerationConfig>): GenerationConfig {
  return {
    ...cloneConfig(defaultConfig),
    ...value
  }
}

function createPresetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function loadConfig(): GenerationConfig {
  if (typeof localStorage === 'undefined') return cloneConfig(defaultConfig)

  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    const loaded = raw ? normalizeConfig(JSON.parse(raw)) : cloneConfig(defaultConfig)
    // Configs saved before families existed: infer the family from the chosen model
    if (!loaded.modelFamily) loaded.modelFamily = inferFamily(mainModel(loaded))?.id || ''
    return loaded
  } catch (e) {
    console.error('Failed to load current configuration:', e)
    return cloneConfig(defaultConfig)
  }
}

interface WorkspaceSetups {
  edit: ModelSetup
  video: ModelSetup
}

/** Edit starts from the Image setup; Video starts clean unless a video model was in use. */
function loadSetups(config: GenerationConfig): WorkspaceSetups {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(SETUPS_STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WorkspaceSetups>
      return {
        edit: pickSetup(parsed.edit || config),
        video: pickSetup(parsed.video || { ...DEFAULT_SETUP, ...VIDEO_DEFAULTS })
      }
    }
  } catch (e) {
    console.error('Failed to load workspace setups:', e)
  }
  return {
    edit: pickSetup({ ...config, videoMode: false }),
    video: pickSetup(config.videoMode ? config : { ...DEFAULT_SETUP, ...VIDEO_DEFAULTS })
  }
}

function persistConfig(value: GenerationConfig): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(value))
}

/** Debounce deep config watches — every keystroke used to JSON.stringify the full tree. */
const CONFIG_PERSIST_DEBOUNCE_MS = 400
let configPersistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersistConfig(value: GenerationConfig): void {
  if (typeof localStorage === 'undefined') return
  if (configPersistTimer) clearTimeout(configPersistTimer)
  configPersistTimer = setTimeout(() => {
    configPersistTimer = null
    persistConfig(value)
  }, CONFIG_PERSIST_DEBOUNCE_MS)
}

/**
 * useConfigStore - Pinia store for generation configuration
 * Centralizes all settings from the sidebar
 */
export const useConfigStore = defineStore('config', () => {
  // Default configuration matching original app
  const config = ref<GenerationConfig>(loadConfig())
  const setups = ref<WorkspaceSetups>(loadSetups(config.value))
  const presets = ref<ConfigPreset[]>([...BUILTIN_PRESETS])
  const selectedPresetId = ref('')
  const { models } = useModels()

  // Keep direct v-model changes available after restart (debounced for main-thread cost).
  watch(config, (value) => schedulePersistConfig(value), { deep: true })
  watch(
    setups,
    (value) => {
      try {
        localStorage.setItem(SETUPS_STORAGE_KEY, JSON.stringify(value))
      } catch {
        /* storage unavailable */
      }
    },
    { deep: true }
  )

  /** The live, writable model setup of a workspace (Image = the main config object). */
  function setupFor(surface: WorkspaceSurface): ModelSetup {
    if (surface === 'edit') return setups.value.edit
    if (surface === 'video') return setups.value.video
    return config.value
  }

  const SETUP_KEY_SET = new Set<string>(SETUP_KEYS)
  const workspaceProxies = new Map<WorkspaceSurface, GenerationConfig>()

  /**
   * Live, writable config for a workspace view: setup fields read/write that workspace's
   * own setup; machine and run fields read/write the shared config. Lets Edit and Video
   * keep their v-model bindings while owning a separate model setup.
   */
  function workspaceConfig(surface: WorkspaceSurface): GenerationConfig {
    if (surface === 'image') return config.value
    const cached = workspaceProxies.get(surface)
    if (cached) return cached
    const target = (key: string | symbol): Record<string, unknown> =>
      (typeof key === 'string' && SETUP_KEY_SET.has(key)
        ? setups.value[surface]
        : config.value) as unknown as Record<string, unknown>
    const keys = (): string[] => Object.keys(config.value)
    const proxy = new Proxy({} as GenerationConfig, {
      get: (_t, key) => target(key)[key as string],
      set: (_t, key, value) => {
        target(key)[key as string] = value
        return true
      },
      has: (_t, key) => typeof key === 'string' && keys().includes(key),
      ownKeys: () => keys(),
      getOwnPropertyDescriptor: (_t, key) =>
        typeof key === 'string' && keys().includes(key)
          ? { enumerable: true, configurable: true, writable: true, value: target(key)[key] }
          : undefined
    })
    workspaceProxies.set(surface, proxy)
    return proxy
  }

  function updateSetup(surface: WorkspaceSurface, partial: Partial<ModelSetup>): void {
    if (surface === 'image') updateConfig(partial)
    else Object.assign(setups.value[surface], partial)
  }

  /** Full generation config for a workspace: its setup + this machine + run inputs. */
  function configFor(surface: WorkspaceSurface): GenerationConfig {
    if (surface === 'image') return config.value
    return { ...config.value, ...pickSetup(setupFor(surface)) }
  }

  function writeSetup(surface: WorkspaceSurface, next: ModelSetup): void {
    if (surface === 'image') config.value = { ...config.value, ...next }
    else setups.value = { ...setups.value, [surface]: next }
  }

  function installedModels(): InstalledModels {
    return models.value as unknown as InstalledModels
  }

  /**
   * Switch a workspace to a model family: documented defaults + companion files
   * auto-matched from what is installed. LoRAs, hardware and run inputs are kept.
   */
  function applyFamilyTo(
    surface: WorkspaceSurface,
    familyId: string,
    options: { mainFile?: string; overrides?: Partial<ModelSetup> } = {}
  ): boolean {
    const family = familyById(familyId)
    if (!family) return false
    const next = applyFamily(pickSetup(setupFor(surface)), family, installedModels(), {
      mainFile: options.mainFile
    })
    writeSetup(surface, { ...next, ...(options.overrides || {}) })
    return true
  }

  /** Apply the performance settings a family's docs recommend (opt-in). */
  function applyMachineHints(familyId: string): void {
    const hints = familyById(familyId)?.machineHints
    if (hints) updateConfig(hints)
  }

  function persistPresets(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(
      PRESETS_STORAGE_KEY,
      JSON.stringify(presets.value.filter((preset) => !preset.builtin))
    )
  }

  function loadPresets(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (!raw) {
        presets.value = [...BUILTIN_PRESETS]
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      presets.value = [
        ...BUILTIN_PRESETS,
        ...parsed
          .filter((preset) => preset?.id && preset?.name && preset?.config)
          .map((preset) => ({
            id: String(preset.id),
            name: String(preset.name),
            config: normalizeConfig(preset.config),
            createdAt: Number(preset.createdAt) || Date.now(),
            updatedAt: Number(preset.updatedAt) || Date.now()
          }))
      ]
    } catch (e) {
      console.error('Failed to load config presets:', e)
      presets.value = [...BUILTIN_PRESETS]
    }
  }

  /** Save a preset from the Image config, or from another workspace's setup. */
  function savePreset(name: string, surface: WorkspaceSurface = 'image'): ConfigPreset | null {
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const now = Date.now()
    const preset: ConfigPreset = {
      id: createPresetId(),
      name: trimmedName,
      config: cloneConfig(configFor(surface)),
      createdAt: now,
      updatedAt: now
    }

    const builtins = presets.value.filter((item) => item.builtin)
    const userPresets = presets.value.filter((item) => !item.builtin)
    presets.value = [...builtins, preset, ...userPresets]
    selectedPresetId.value = preset.id
    persistPresets()
    return preset
  }

  function updatePreset(id: string): void {
    const now = Date.now()
    presets.value = presets.value.map((preset) =>
      preset.id === id && !preset.builtin
        ? { ...preset, config: cloneConfig(config.value), updatedAt: now }
        : preset
    )
    persistPresets()
  }

  /**
   * Apply a preset to a workspace. Built-ins switch the model family (files auto-matched);
   * saved presets restore their model setup. Hardware, uploads and seed are never touched.
   */
  function applyPreset(id: string, surface: WorkspaceSurface = 'image'): void {
    const builtin = presetFamily(id)
    if (builtin) {
      applyFamilyTo(surface, builtin.family, { overrides: builtin.overrides })
      selectedPresetId.value = id
      return
    }
    const preset = presets.value.find((item) => item.id === id)
    if (!preset) return
    writeSetup(surface, pickSetup(preset.config))
    selectedPresetId.value = preset.id
  }

  function deletePreset(id: string): void {
    presets.value = presets.value.filter((preset) => preset.builtin || preset.id !== id)
    if (selectedPresetId.value === id) {
      selectedPresetId.value = ''
    }
    persistPresets()
  }

  /**
   * updateConfig() - Partially update configuration
   */
  function updateConfig(partial: Partial<GenerationConfig>): void {
    config.value = { ...config.value, ...partial }
  }

  /**
   * applyConfigSnapshot() - Restore a compact history snapshot into live config
   */
  function applyConfigSnapshot(snapshot: Partial<GenerationConfig>): void {
    if (!snapshot || typeof snapshot !== 'object') return
    const next: Partial<GenerationConfig> = { ...snapshot }
    if (Array.isArray(snapshot.loras)) {
      next.loras = snapshot.loras.map((l) => ({ ...l }))
    }
    config.value = normalizeConfig({ ...config.value, ...next })
  }

  /**
   * applyImageParams() - Apply PNG / webui generation metadata into config
   */
  function applyImageParams(
    params: ImageGenerationParams,
    mode: ImageParamsReuseMode = 'all'
  ): void {
    if (mode === 'seed') {
      if (params.seed != null && Number.isFinite(params.seed)) {
        config.value.seed = params.seed
      }
      return
    }

    const next: Partial<GenerationConfig> = {}
    if (params.seed != null && Number.isFinite(params.seed)) next.seed = params.seed
    if (params.steps != null && Number.isFinite(params.steps)) next.steps = params.steps
    const cfg = params.cfgScale ?? params.cfg_scale
    if (cfg != null && Number.isFinite(cfg)) next.cfgScale = cfg
    // 'recipe' restores the generation recipe only — canvas size and model are
    // the caller's decision (metadata dims can be upscaled, models may be absent).
    if (mode === 'all') {
      if (params.width != null && Number.isFinite(params.width)) next.width = params.width
      if (params.height != null && Number.isFinite(params.height)) next.height = params.height
    }
    if (params.sampler) next.sampler = params.sampler
    if (params.scheduler) next.scheduler = params.scheduler
    if (params.guidance != null && Number.isFinite(params.guidance)) next.guidance = params.guidance
    const clipSkip = params.clipSkip ?? params.clip_skip
    if (clipSkip != null && Number.isFinite(clipSkip)) next.clipSkip = clipSkip

    if (mode === 'all') {
      const modelName = params.diffusionModel || params.model
      if (modelName) {
        // Metadata often stores basename only; assign to both load modes for convenience.
        const base = modelName.split(/[\\/]/).pop() || modelName
        if (config.value.loadMode === 'standard') next.standardModel = base
        else next.diffusionModel = base
      }
    }

    updateConfig(next)
  }

  /**
   * applyLowVramProfile() - Docs-aligned low VRAM hardware recipe
   * (offload + stream-layers + max-vram -1 + flash attention)
   */
  function applyLowVramProfile(): void {
    updateConfig({
      cpuOffload: true,
      streamLayers: true,
      maxVram: -1,
      flashAttention: true
    })
  }

  /**
   * addLora() - Add a LoRA to the list
   */
  function addLora(
    path: string,
    strength: number = 1.0,
    target: 'default' | 'high_noise' = 'default'
  ): void {
    config.value.loras.push({ path, strength, target })
  }

  /**
   * applyCachePreset() - Apply a named caching recipe
   */
  function applyCachePreset(partial: {
    cacheMode: string
    cacheOption: string
    scmPolicy?: string
    scmMask?: string
  }): void {
    updateConfig({
      cacheMode: partial.cacheMode || '',
      cacheOption: partial.cacheOption || '',
      scmPolicy: partial.scmPolicy || '',
      scmMask: partial.scmMask || ''
    })
  }

  /**
   * removeLora() - Remove a LoRA by index
   */
  function removeLora(index: number): void {
    config.value.loras.splice(index, 1)
  }

  /**
   * addEmbedding() - Add an embedding
   */
  function addEmbedding(path: string): void {
    if (!config.value.embeddings.includes(path)) {
      config.value.embeddings.push(path)
    }
  }

  /**
   * removeEmbedding() - Remove an embedding
   */
  function removeEmbedding(path: string): void {
    config.value.embeddings = config.value.embeddings.filter((e) => e !== path)
  }

  /**
   * setDimensions() - Set width/height with preset support
   */
  function setDimensions(width: number, height: number, surface: WorkspaceSurface = 'image'): void {
    const setup = setupFor(surface)
    setup.width = width
    setup.height = height
  }

  /**
   * getSelectedModel() - Get the appropriate model based on load mode
   */
  const selectedModel = computed(() => {
    if (config.value.loadMode === 'standard') {
      return config.value.standardModel
    }
    return config.value.diffusionModel
  })

  loadPresets()

  return {
    config,
    setups,
    setupFor,
    configFor,
    writeSetup,
    applyFamilyTo,
    applyMachineHints,
    presets,
    selectedPresetId,
    updateConfig,
    applyConfigSnapshot,
    applyImageParams,
    applyLowVramProfile,
    applyCachePreset,
    loadPresets,
    savePreset,
    updatePreset,
    applyPreset,
    deletePreset,
    addLora,
    removeLora,
    addEmbedding,
    removeEmbedding,
    setDimensions,
    workspaceConfig,
    updateSetup,
    selectedModel
  }
})
