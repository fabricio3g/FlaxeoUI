/**
 * Flaxeo recipe model — full-settings templates (shareable JSON).
 * Data only; no executable fields.
 */

export const RECIPE_VERSION = 1 as const
export const RECIPE_FILE_EXT = '.flaxeo-recipe.json'

export type RecipeSurface = 'text2image' | 'edit' | 'video' | 'upscale'

export interface RecipeModelHints {
  packId?: string
  diffusion?: string
  vae?: string
}

export interface FlaxeoRecipe {
  version: typeof RECIPE_VERSION
  id: string
  name: string
  description?: string
  author?: string
  tags: string[]
  surface: RecipeSurface
  prompt?: string
  negativePrompt?: string
  /** Compact config fields (same idea as history configSnapshot) */
  configSnapshot: Record<string, unknown>
  modelHints?: RecipeModelHints
  createdAt: number
  updatedAt: number
  builtin?: boolean
}

export type RecipeDraft = Omit<
  FlaxeoRecipe,
  'id' | 'version' | 'createdAt' | 'updatedAt' | 'builtin'
> & {
  id?: string
  version?: number
  createdAt?: number
  updatedAt?: number
  builtin?: boolean
}

const SURFACES: RecipeSurface[] = ['text2image', 'edit', 'video', 'upscale']

export function createRecipeId(): string {
  return `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function isRecipeSurface(value: unknown): value is RecipeSurface {
  return typeof value === 'string' && (SURFACES as string[]).includes(value)
}

/**
 * Validate and normalize a recipe from JSON / storage.
 * Returns null if required fields are missing or invalid.
 */
export function normalizeRecipe(raw: unknown, opts?: { forceId?: string }): FlaxeoRecipe | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>

  const name = String(o.name || '').trim()
  if (!name) return null

  const surface = o.surface
  if (!isRecipeSurface(surface)) return null

  const configSnapshot =
    o.configSnapshot && typeof o.configSnapshot === 'object' && !Array.isArray(o.configSnapshot)
      ? { ...(o.configSnapshot as Record<string, unknown>) }
      : null
  if (!configSnapshot) return null

  const version = Number(o.version)
  if (version !== RECIPE_VERSION && o.version != null && Number.isFinite(version) && version !== 1) {
    // only v1 for now
    return null
  }

  const now = Date.now()
  const tags = Array.isArray(o.tags)
    ? o.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 24)
    : []

  let modelHints: RecipeModelHints | undefined
  if (o.modelHints && typeof o.modelHints === 'object' && !Array.isArray(o.modelHints)) {
    const h = o.modelHints as Record<string, unknown>
    modelHints = {}
    if (h.packId) modelHints.packId = String(h.packId)
    if (h.diffusion) modelHints.diffusion = String(h.diffusion)
    if (h.vae) modelHints.vae = String(h.vae)
    if (!modelHints.packId && !modelHints.diffusion && !modelHints.vae) modelHints = undefined
  }

  return {
    version: RECIPE_VERSION,
    id: opts?.forceId || (typeof o.id === 'string' && o.id ? o.id : createRecipeId()),
    name: name.slice(0, 120),
    description: o.description != null ? String(o.description).slice(0, 2000) : undefined,
    author: o.author != null ? String(o.author).slice(0, 120) : undefined,
    tags,
    surface,
    prompt: o.prompt != null ? String(o.prompt) : undefined,
    negativePrompt: o.negativePrompt != null ? String(o.negativePrompt) : undefined,
    configSnapshot,
    modelHints,
    createdAt: Number(o.createdAt) || now,
    updatedAt: Number(o.updatedAt) || now,
    builtin: Boolean(o.builtin)
  }
}

/** Parse a recipe file body (object or JSON string). */
export function parseRecipeJson(input: string | unknown): FlaxeoRecipe | null {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch {
      return null
    }
  }
  return normalizeRecipe(raw)
}

/** Serialize for export (omits internal-only flags if needed). */
export function serializeRecipe(recipe: FlaxeoRecipe, opts?: { stripBuiltin?: boolean }): string {
  const out: Record<string, unknown> = {
    version: RECIPE_VERSION,
    id: recipe.id,
    name: recipe.name,
    surface: recipe.surface,
    tags: recipe.tags,
    configSnapshot: recipe.configSnapshot,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt
  }
  if (recipe.description) out.description = recipe.description
  if (recipe.author) out.author = recipe.author
  if (recipe.prompt) out.prompt = recipe.prompt
  if (recipe.negativePrompt) out.negativePrompt = recipe.negativePrompt
  if (recipe.modelHints) out.modelHints = recipe.modelHints
  if (recipe.builtin && !opts?.stripBuiltin) out.builtin = true
  return `${JSON.stringify(out, null, 2)}\n`
}

export function recipeFilename(recipe: FlaxeoRecipe): string {
  const safe = recipe.name
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48)
  return `${safe || 'recipe'}${RECIPE_FILE_EXT}`
}

/** Built-in starter recipes (config is intentionally light — user models vary). */
export function getBuiltinRecipes(): FlaxeoRecipe[] {
  const now = Date.now()
  const base = (partial: RecipeDraft & { id: string }): FlaxeoRecipe => {
    const n = normalizeRecipe(
      {
        ...partial,
        version: RECIPE_VERSION,
        createdAt: now,
        updatedAt: now,
        builtin: true
      },
      { forceId: partial.id }
    )
    if (!n) throw new Error(`Invalid builtin recipe ${partial.id}`)
    return n
  }

  return [
    base({
      id: 'builtin-portrait-soft',
      name: 'Portrait · soft light',
      description: 'Soft window light portrait look. Pick a portrait-capable model after apply.',
      author: 'Flaxeo',
      tags: ['portrait', 'people', 'builtin'],
      surface: 'text2image',
      prompt:
        'Editorial portrait of a person in soft window light, shallow depth of field, natural skin texture, 85mm lens look, gentle bokeh, high detail',
      negativePrompt: 'blurry, low quality, deformed hands, extra fingers, watermark, text',
      configSnapshot: {
        width: 832,
        height: 1216,
        steps: 28,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-landscape-wide',
      name: 'Landscape · wide',
      description: 'Cinematic wide landscape starting point.',
      author: 'Flaxeo',
      tags: ['landscape', 'scenic', 'builtin'],
      surface: 'text2image',
      prompt:
        'Cinematic wide landscape at golden hour, layered mountains, atmospheric haze, volumetric light, detailed foreground, ultra wide composition',
      negativePrompt: 'people, text, watermark, blurry, oversaturated',
      configSnapshot: {
        width: 1216,
        height: 832,
        steps: 28,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-product-clean',
      name: 'Product · clean studio',
      description: 'Clean product shot on neutral background.',
      author: 'Flaxeo',
      tags: ['product', 'studio', 'builtin'],
      surface: 'text2image',
      prompt:
        'Studio product photo on seamless light gray background, softbox lighting, sharp focus, commercial catalog style, high detail',
      negativePrompt: 'hands, people, clutter, text, logo, watermark, blurry',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 24,
        cfgScale: 4.5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-turbo-draft',
      name: 'Draft · fast / low steps',
      description: 'Quick exploration — fewer steps. Great with turbo / distilled models.',
      author: 'Flaxeo',
      tags: ['draft', 'fast', 'builtin'],
      surface: 'text2image',
      prompt: 'A striking concept sketch of an idea, clear subject, simple composition',
      negativePrompt: 'blurry, text, watermark',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 8,
        cfgScale: 1,
        seed: -1,
        loadMode: 'diffusion'
      },
      modelHints: { packId: 'z-image-turbo' }
    }),
    base({
      id: 'builtin-anime-key',
      name: 'Anime · key visual',
      description: 'Bold anime key-art framing. Use an anime-capable checkpoint.',
      author: 'Flaxeo',
      tags: ['anime', 'illustration', 'builtin'],
      surface: 'text2image',
      prompt:
        'Anime key visual, dynamic pose, clean linework, vibrant cel shading, detailed eyes, cinematic lighting, official art style',
      negativePrompt: 'photorealistic, 3d render, blurry, extra limbs, watermark, text',
      configSnapshot: {
        width: 832,
        height: 1216,
        steps: 28,
        cfgScale: 6,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-square-social',
      name: 'Square · social',
      description: '1:1 composition for thumbnails and posts.',
      author: 'Flaxeo',
      tags: ['square', 'social', 'builtin'],
      surface: 'text2image',
      prompt: 'Eye-catching centered subject, bold simple background, high clarity, social media thumbnail',
      negativePrompt: 'clutter, tiny subject, text, watermark, blurry',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 24,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    })
  ]
}
