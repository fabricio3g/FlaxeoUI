/**
 * Detect which Model Hub pack files are already on disk via /api/models lists.
 */

import type { ModelCategories } from '@/composables/useModels'
import type { HubFile, HubModel } from '@/lib/starterPacks'

/** Map hub file.category → ModelCategories key */
const CATEGORY_MAP: Record<string, keyof ModelCategories> = {
  diffusion: 'diffusion',
  uncond_diffusion: 'uncondDiffusion',
  loras: 'loras',
  vae: 'vae',
  audio_vae: 'audioVae',
  llm: 'llm',
  llm_vision: 'llmVision',
  t5xxl: 't5xxl',
  embeddings_connectors: 'embeddingsConnectors',
  clip: 'clip',
  clipG: 'clipG',
  clip_g: 'clipG',
  clip_vision: 'clipVision',
  controlnet: 'controlnet',
  photomaker: 'photomaker',
  upscale: 'upscale',
  hires_upscalers: 'hiresUpscalers',
  taesd: 'taesd',
  embeddings: 'embeddings'
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

export function isHubFileInstalled(file: HubFile, models: ModelCategories): boolean {
  const key = CATEGORY_MAP[file.category] || (file.category as keyof ModelCategories)
  const list = models[key]
  if (!Array.isArray(list)) return false
  const target = file.filename.toLowerCase()
  return list.some((entry) => {
    const name = basename(entry).toLowerCase()
    return (
      name === target ||
      entry
        .replace(/\\/g, '/')
        .toLowerCase()
        .endsWith('/' + target)
    )
  })
}

export interface PackInstallStatus {
  total: number
  installed: number
  required: number
  requiredInstalled: number
  /** True when every required file is present (or all files if none marked required) */
  ready: boolean
}

export function getPackInstallStatus(model: HubModel, models: ModelCategories): PackInstallStatus {
  const files = model.files || []
  const required = files.filter((f) => f.required === true)
  const installed = files.filter((f) => isHubFileInstalled(f, models)).length
  const requiredInstalled = required.filter((f) => isHubFileInstalled(f, models)).length
  const ready =
    required.length > 0
      ? requiredInstalled === required.length
      : files.length > 0 && installed === files.length

  return {
    total: files.length,
    installed,
    required: required.length,
    requiredInstalled,
    ready
  }
}
