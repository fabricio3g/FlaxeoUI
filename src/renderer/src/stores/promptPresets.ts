import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PromptPreset {
  id: string
  name: string
  prompt: string
  negativePrompt: string
  createdAt: number
  updatedAt: number
}

const PROMPT_PRESETS_STORAGE_KEY = 'flaxeo-prompt-presets'

function createPresetId(): string {
  return `prompt-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const usePromptPresetStore = defineStore('promptPresets', () => {
  const presets = ref<PromptPreset[]>([])
  const selectedPresetId = ref('')

  function persistPresets(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PROMPT_PRESETS_STORAGE_KEY, JSON.stringify(presets.value))
  }

  function loadPresets(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const raw = localStorage.getItem(PROMPT_PRESETS_STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      presets.value = parsed
        .filter((preset) => preset?.id && preset?.name)
        .map((preset) => ({
          id: String(preset.id),
          name: String(preset.name),
          prompt: String(preset.prompt || ''),
          negativePrompt: String(preset.negativePrompt || ''),
          createdAt: Number(preset.createdAt) || Date.now(),
          updatedAt: Number(preset.updatedAt) || Date.now()
        }))
    } catch (e) {
      console.error('Failed to load prompt presets:', e)
      presets.value = []
    }
  }

  function savePreset(name: string, prompt: string, negativePrompt: string): PromptPreset | null {
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const now = Date.now()
    const preset: PromptPreset = {
      id: createPresetId(),
      name: trimmedName,
      prompt,
      negativePrompt,
      createdAt: now,
      updatedAt: now
    }

    presets.value = [preset, ...presets.value]
    selectedPresetId.value = preset.id
    persistPresets()
    return preset
  }

  /**
   * Save under a name, or update the existing preset with the same name (case-insensitive).
   */
  function saveOrUpdateByName(
    name: string,
    prompt: string,
    negativePrompt: string
  ): { preset: PromptPreset; updated: boolean } | null {
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const existing = presets.value.find(
      (preset) => preset.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (existing) {
      updatePreset(existing.id, prompt, negativePrompt, trimmedName)
      selectedPresetId.value = existing.id
      return { preset: existing, updated: true }
    }

    const created = savePreset(trimmedName, prompt, negativePrompt)
    return created ? { preset: created, updated: false } : null
  }

  function updatePreset(
    id: string,
    prompt: string,
    negativePrompt: string,
    name?: string
  ): void {
    const now = Date.now()
    presets.value = presets.value.map((preset) =>
      preset.id === id
        ? {
            ...preset,
            prompt,
            negativePrompt,
            name: name?.trim() || preset.name,
            updatedAt: now
          }
        : preset
    )
    persistPresets()
  }

  function renamePreset(id: string, name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false
    const now = Date.now()
    let found = false
    presets.value = presets.value.map((preset) => {
      if (preset.id !== id) return preset
      found = true
      return { ...preset, name: trimmed, updatedAt: now }
    })
    if (found) persistPresets()
    return found
  }

  function deletePreset(id: string): void {
    presets.value = presets.value.filter((preset) => preset.id !== id)
    if (selectedPresetId.value === id) {
      selectedPresetId.value = ''
    }
    persistPresets()
  }

  loadPresets()

  return {
    presets,
    selectedPresetId,
    loadPresets,
    savePreset,
    saveOrUpdateByName,
    updatePreset,
    renamePreset,
    deletePreset
  }
})
