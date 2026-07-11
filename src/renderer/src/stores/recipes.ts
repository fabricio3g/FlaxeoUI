import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createRecipeId,
  getBuiltinRecipes,
  normalizeRecipe,
  parseRecipeJson,
  recipeFilename,
  serializeRecipe,
  type FlaxeoRecipe,
  type RecipeSurface
} from '../../../shared/recipes'
import type { ConfigSnapshot } from '@/lib/configSnapshot'

const STORAGE_KEY = 'flaxeo-recipes-v1'

function loadUserRecipes(): FlaxeoRecipe[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeRecipe(item))
      .filter((r): r is FlaxeoRecipe => !!r && !r.builtin)
  } catch {
    return []
  }
}

export const useRecipeStore = defineStore('recipes', () => {
  const userRecipes = ref<FlaxeoRecipe[]>(loadUserRecipes())
  const selectedId = ref('')

  const builtins = getBuiltinRecipes()

  const allRecipes = computed(() => {
    // builtins first, then user (newest first)
    const users = [...userRecipes.value].sort((a, b) => b.updatedAt - a.updatedAt)
    return [...builtins, ...users]
  })

  function persist(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userRecipes.value))
  }

  function getById(id: string): FlaxeoRecipe | undefined {
    return allRecipes.value.find((r) => r.id === id)
  }

  function saveRecipe(input: {
    name: string
    surface: RecipeSurface
    prompt?: string
    negativePrompt?: string
    configSnapshot: ConfigSnapshot | Record<string, unknown>
    description?: string
    tags?: string[]
    modelHints?: FlaxeoRecipe['modelHints']
    /** If set, update existing user recipe */
    id?: string
  }): FlaxeoRecipe | null {
    const name = input.name.trim()
    if (!name) return null

    const now = Date.now()
    if (input.id) {
      const idx = userRecipes.value.findIndex((r) => r.id === input.id)
      if (idx >= 0) {
        const prev = userRecipes.value[idx]
        if (prev.builtin) return null
        const updated = normalizeRecipe({
          ...prev,
          name,
          surface: input.surface,
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          configSnapshot: input.configSnapshot,
          description: input.description ?? prev.description,
          tags: input.tags ?? prev.tags,
          modelHints: input.modelHints ?? prev.modelHints,
          updatedAt: now,
          builtin: false
        })
        if (!updated) return null
        const next = [...userRecipes.value]
        next[idx] = updated
        userRecipes.value = next
        selectedId.value = updated.id
        persist()
        return updated
      }
    }

    // Upsert by name (case-insensitive) among user recipes
    const existing = userRecipes.value.find((r) => r.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      return saveRecipe({ ...input, id: existing.id, name })
    }

    const recipe = normalizeRecipe({
      id: createRecipeId(),
      name,
      surface: input.surface,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      configSnapshot: input.configSnapshot,
      description: input.description,
      tags: input.tags || [],
      modelHints: input.modelHints,
      createdAt: now,
      updatedAt: now,
      builtin: false
    })
    if (!recipe) return null
    userRecipes.value = [recipe, ...userRecipes.value]
    selectedId.value = recipe.id
    persist()
    return recipe
  }

  function deleteRecipe(id: string): boolean {
    const r = userRecipes.value.find((x) => x.id === id)
    if (!r || r.builtin) return false
    userRecipes.value = userRecipes.value.filter((x) => x.id !== id)
    if (selectedId.value === id) selectedId.value = ''
    persist()
    return true
  }

  function importRecipe(json: string | unknown): FlaxeoRecipe | null {
    const parsed = typeof json === 'string' ? parseRecipeJson(json) : normalizeRecipe(json)
    if (!parsed) return null
    let name = parsed.name
    if (userRecipes.value.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      name = `${name} (imported)`
    }
    const withId = normalizeRecipe(
      {
        ...parsed,
        name,
        builtin: false,
        updatedAt: Date.now()
      },
      { forceId: createRecipeId() }
    )
    if (!withId) return null
    userRecipes.value = [withId, ...userRecipes.value]
    selectedId.value = withId.id
    persist()
    return withId
  }

  function exportRecipeJson(id: string): { filename: string; json: string } | null {
    const r = getById(id)
    if (!r) return null
    return {
      filename: recipeFilename(r),
      json: serializeRecipe(r, { stripBuiltin: true })
    }
  }

  return {
    userRecipes,
    selectedId,
    builtins,
    allRecipes,
    getById,
    saveRecipe,
    deleteRecipe,
    importRecipe,
    exportRecipeJson
  }
})
