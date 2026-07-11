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
  if (
    version !== RECIPE_VERSION &&
    o.version != null &&
    Number.isFinite(version) &&
    version !== 1
  ) {
    // only v1 for now
    return null
  }

  const now = Date.now()
  const tags = Array.isArray(o.tags)
    ? o.tags
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 24)
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
      prompt:
        'Eye-catching centered subject, bold simple background, high clarity, social media thumbnail',
      negativePrompt: 'clutter, tiny subject, text, watermark, blurry',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 24,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),

    // --- Surfaces / map-style looks (prompted; not true PBR bakes) ---
    base({
      id: 'builtin-surface-albedo',
      name: 'Surface · base color',
      description: 'Flat-lit material color. Square power-of-two size for pipeline handoff.',
      author: 'Flaxeo',
      tags: ['surface', 'albedo', 'material', 'builtin', '1024'],
      surface: 'text2image',
      prompt:
        'Seamless tileable material base color, flat even lighting, no strong shadows, high detail surface texture, neutral presentation, tileable pattern',
      negativePrompt:
        'strong shadows, dramatic lighting, people, objects, logo, watermark, text, vignette, perspective, 3d render frame',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 28,
        cfgScale: 4.5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-surface-roughness',
      name: 'Surface · roughness look',
      description: 'Grayscale map-style look (prompted, not a material bake).',
      author: 'Flaxeo',
      tags: ['surface', 'roughness', 'grayscale', 'material', 'builtin'],
      surface: 'text2image',
      prompt:
        'Grayscale roughness map style, seamless tileable, pure black and white values, technical material map, no color, flat lighting, high frequency detail',
      negativePrompt: 'color, chromatic, people, text, watermark, 3d scene, perspective',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 24,
        cfgScale: 4,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-surface-normal-style',
      name: 'Surface · normal style',
      description: 'Normal-map aesthetic for concepts — not a real tangent-space bake.',
      author: 'Flaxeo',
      tags: ['surface', 'normal', 'technical', 'material', 'builtin'],
      surface: 'text2image',
      prompt:
        'Normal map style texture, purple blue technical look, seamless tileable, bump detail, material normal map aesthetic, flat orthographic',
      negativePrompt: 'photoreal photo, people, text, watermark, perspective scene',
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
      id: 'builtin-surface-tile',
      name: 'Surface · tileable',
      description: 'Tile-friendly square surface. Check edges in your DCC by repeating.',
      author: 'Flaxeo',
      tags: ['surface', 'seamless', 'tile', 'builtin', '1024'],
      surface: 'text2image',
      prompt:
        'Seamless repeating tile texture, edge-matched pattern, uniform density, high detail, material surface, no borders',
      negativePrompt: 'border, frame, logo, watermark, text, strong vignette, people',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 28,
        cfgScale: 4.5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-object-hero',
      name: 'Object · hero on ground',
      description: 'Single subject on a clean ground plane.',
      author: 'Flaxeo',
      tags: ['object', 'prop', 'product', 'studio', 'builtin'],
      surface: 'text2image',
      prompt:
        'Single hero object centered on a neutral seamless ground, soft studio lighting, sharp focus, commercial product photography, clean composition',
      negativePrompt: 'clutter, crowd, text, watermark, logo, blurry, extra objects',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 28,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-icon-solid-bg',
      name: 'Icon · solid background',
      description: 'Simple centered graphic on solid color for easy keying.',
      author: 'Flaxeo',
      tags: ['icon', 'sprite', 'solid-bg', 'builtin', '512'],
      surface: 'text2image',
      prompt:
        'Simple bold icon graphic centered, solid pure color background, clean shapes, high contrast, minimal detail, flat design friendly',
      negativePrompt: 'photo noise, complex background, text, watermark, photoreal clutter',
      configSnapshot: {
        width: 512,
        height: 512,
        steps: 20,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-wide-hero',
      name: 'Wide · hero banner',
      description: 'Wide cinematic frame (~16:9).',
      author: 'Flaxeo',
      tags: ['wide', 'hero', 'banner', '16:9', 'builtin'],
      surface: 'text2image',
      prompt:
        'Wide cinematic hero image, strong focal subject, atmospheric depth, premium art direction, space for optional text on one side',
      negativePrompt: 'busy clutter, unreadable text, watermark, logo, low quality',
      configSnapshot: {
        width: 1344,
        height: 768,
        steps: 28,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-story-tall',
      name: 'Tall · story frame',
      description: 'Vertical full-bleed (~9:16).',
      author: 'Flaxeo',
      tags: ['tall', 'story', '9:16', 'builtin'],
      surface: 'text2image',
      prompt:
        'Vertical full-bleed composition, strong subject in upper third, clean background, mobile-friendly framing, high clarity',
      negativePrompt: 'tiny subject, watermark, text, blurry edges',
      configSnapshot: {
        width: 768,
        height: 1344,
        steps: 26,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-empty-state',
      name: 'Illustration · empty state',
      description: 'Soft illustration with negative space.',
      author: 'Flaxeo',
      tags: ['illustration', 'empty-state', 'soft', 'builtin'],
      surface: 'text2image',
      prompt:
        'Friendly soft illustration, simple character or object, ample negative space, calm pastel palette, clean vector-like shapes, minimal composition',
      negativePrompt: 'dark horror, gore, photoreal, watermark, text, clutter',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 26,
        cfgScale: 5,
        seed: -1,
        loadMode: 'diffusion'
      }
    }),
    base({
      id: 'builtin-ui-mock-screen',
      name: 'Interface · mock screen',
      description: 'Abstract interface mock for comps (illustration, not real UI).',
      author: 'Flaxeo',
      tags: ['interface', 'mock', 'layout', 'builtin'],
      surface: 'text2image',
      prompt:
        'Clean modern app interface mockup on a device-free canvas, soft shadows, neat cards and sidebar, professional product design presentation, high clarity',
      negativePrompt: 'illegible text, watermark, messy wireframe, low contrast',
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
      id: 'builtin-mood-board',
      name: 'Mood · multi-seed set',
      description: 'Cohesive look with batch count for a small set. Lock seed after you like one.',
      author: 'Flaxeo',
      tags: ['mood', 'set', 'batch', 'consistent', 'builtin'],
      surface: 'text2image',
      prompt:
        'Cohesive visual style, unified color palette, same lighting language, clear subject, art direction suitable for a multi-image set',
      negativePrompt: 'style mismatch, random filters, watermark, text, low quality',
      configSnapshot: {
        width: 1024,
        height: 1024,
        steps: 24,
        cfgScale: 5,
        seed: -1,
        batchCount: 4,
        loadMode: 'diffusion'
      }
    })
  ]
}
