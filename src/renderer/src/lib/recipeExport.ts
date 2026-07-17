/**
 * Human-readable recipe export: model filenames + generation combination.
 */

import type { FlaxeoRecipe } from '../../../shared/recipes'

function str(snap: Record<string, unknown>, key: string): string {
  const v = snap[key]
  if (v == null || v === '' || v === false) return ''
  return String(v).trim()
}

function num(snap: Record<string, unknown>, key: string): string {
  const v = snap[key]
  if (v == null || v === '') return ''
  return String(v)
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function diffusionName(snap: Record<string, unknown>, recipe?: FlaxeoRecipe): string {
  const fromSnap =
    str(snap, 'standardModel') ||
    str(snap, 'diffusionModel') ||
    str(snap, 'diffusion_model')
  if (fromSnap) return basename(fromSnap)
  if (recipe?.modelHints?.diffusion) return basename(recipe.modelHints.diffusion)
  return ''
}

/** One-line combo for list rows: `model · euler · 512×512` */
export function formatRecipeComboLine(recipe: FlaxeoRecipe): string {
  const snap = recipe.configSnapshot || {}
  const parts: string[] = []
  const model = diffusionName(snap, recipe)
  if (model) {
    const short = model.length > 28 ? `${model.slice(0, 26)}…` : model
    parts.push(short)
  }
  const sampler = str(snap, 'sampler')
  if (sampler) parts.push(sampler)
  const w = num(snap, 'width')
  const h = num(snap, 'height')
  if (w && h) parts.push(`${w}×${h}`)
  const steps = num(snap, 'steps')
  if (steps) parts.push(`${steps} steps`)
  return parts.join(' · ')
}

function loraLines(snap: Record<string, unknown>): string[] {
  const raw = snap.loras
  if (!Array.isArray(raw) || !raw.length) return []
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return '- (unknown LoRA)'
    const o = item as Record<string, unknown>
    const path = String(o.path || '')
    const name = basename(path) || 'lora'
    const strength = o.strength != null ? Number(o.strength) : 1
    const target = o.target === 'high_noise' ? ' (high_noise)' : ''
    return `- ${name} @ ${strength}${target}`
  })
}

function pushIf(lines: string[], label: string, value: string): void {
  if (value) lines.push(`- **${label}:** \`${value}\``)
}

/**
 * Markdown guide: models required + settings combination + prompts.
 */
export function formatRecipeInstructions(recipe: FlaxeoRecipe): string {
  const snap = recipe.configSnapshot || {}
  const loadMode = str(snap, 'loadMode') || 'standard'
  const lines: string[] = []

  lines.push(`# Recipe: ${recipe.name}`)
  lines.push('')
  if (recipe.description) {
    lines.push(recipe.description)
    lines.push('')
  }
  lines.push(`- **Surface:** ${recipe.surface}`)
  lines.push(`- **Load mode:** ${loadMode}`)
  lines.push(`- **Exported:** ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')

  lines.push('## How to use')
  lines.push('')
  lines.push('1. Place the model files listed below under your Flaxeo `models/` folders (or install via Model Hub).')
  lines.push('2. Open Flaxeo → **Image** (or matching surface).')
  lines.push('3. **Recipes** → **Import** the companion `.flaxeo-recipe.json` file, then **Apply**.')
  lines.push('4. Or set models and generation settings manually from the combination section.')
  lines.push('')

  lines.push('## Models (filenames)')
  lines.push('')
  const modelBlock: string[] = []
  const diffusion = diffusionName(snap, recipe)
  pushIf(modelBlock, 'Diffusion / checkpoint', diffusion)
  pushIf(modelBlock, 'High-noise diffusion', basename(str(snap, 'highNoiseDiffusionModel')))
  pushIf(modelBlock, 'Uncond diffusion', basename(str(snap, 'uncondDiffusionModel')))
  pushIf(
    modelBlock,
    'VAE',
    basename(str(snap, 'vaeModel') || recipe.modelHints?.vae || '')
  )
  pushIf(modelBlock, 'CLIP-L', basename(str(snap, 'clipModel')))
  pushIf(modelBlock, 'CLIP-G', basename(str(snap, 'clipGModel')))
  pushIf(modelBlock, 'CLIP Vision', basename(str(snap, 'clipVisionModel')))
  pushIf(modelBlock, 'T5 / UMT5', basename(str(snap, 't5xxlModel')))
  pushIf(modelBlock, 'LLM', basename(str(snap, 'llmModel')))
  pushIf(modelBlock, 'LLM Vision', basename(str(snap, 'llmVisionModel')))
  pushIf(modelBlock, 'Embeddings connectors', basename(str(snap, 'embeddingsConnectorsModel')))
  pushIf(modelBlock, 'Audio VAE', basename(str(snap, 'audioVaeModel')))
  pushIf(modelBlock, 'TAESD', basename(str(snap, 'taesdModel')))
  pushIf(modelBlock, 'ControlNet', basename(str(snap, 'controlNetModel')))
  pushIf(modelBlock, 'Upscale', basename(str(snap, 'upscaleModel')))
  pushIf(modelBlock, 'AnimateDiff motion module', basename(str(snap, 'motionModule')))
  if (snap.adetailerEnabled || str(snap, 'adetailerModel')) {
    pushIf(modelBlock, 'ADetailer detector', basename(str(snap, 'adetailerModel')))
  }

  const loras = loraLines(snap)
  if (loras.length) {
    modelBlock.push('- **LoRAs:**')
    for (const line of loras) modelBlock.push(`  ${line}`)
  }

  if (!modelBlock.length) {
    lines.push('_No model filenames stored in this recipe. Select models manually in Flaxeo._')
  } else {
    lines.push(...modelBlock)
  }
  lines.push('')

  lines.push('## Generation combination')
  lines.push('')
  const w = num(snap, 'width')
  const h = num(snap, 'height')
  const size = w && h ? `${w}×${h}` : ''
  const combo: string[] = []
  if (size) combo.push(`- **Size:** ${size}`)
  pushIf(combo, 'Steps', num(snap, 'steps'))
  pushIf(combo, 'CFG', num(snap, 'cfgScale'))
  pushIf(combo, 'Guidance', num(snap, 'guidance'))
  pushIf(combo, 'Sampler', str(snap, 'sampler'))
  pushIf(combo, 'Scheduler', str(snap, 'scheduler'))
  pushIf(combo, 'Seed', num(snap, 'seed'))
  pushIf(combo, 'Batch', num(snap, 'batchCount'))
  pushIf(combo, 'Clip skip', num(snap, 'clipSkip'))
  pushIf(combo, 'Img2img / strength', num(snap, 'img2imgStrength'))
  pushIf(combo, 'Flow shift', num(snap, 'flowShift'))
  pushIf(combo, 'Cache mode', str(snap, 'cacheMode'))
  pushIf(combo, 'Cache option', str(snap, 'cacheOption'))
  pushIf(combo, 'Ref image preset', str(snap, 'refImagePreset'))
  if (snap.flashAttention) combo.push('- **Flash attention:** on')
  if (snap.cpuOffload) combo.push('- **CPU offload:** on')
  if (snap.streamLayers) combo.push('- **Stream layers:** on')
  if (snap.vaeTiling) combo.push('- **VAE tiling:** on')
  if (snap.adetailerEnabled) {
    combo.push('- **ADetailer:** enabled')
    pushIf(combo, 'ADetailer denoise', num(snap, 'adetailerDenoisingStrength'))
  }
  if (!combo.length) {
    lines.push('_No generation parameters stored._')
  } else {
    lines.push(...combo)
  }
  lines.push('')

  lines.push('## Prompts')
  lines.push('')
  lines.push('### Positive')
  lines.push('')
  lines.push(recipe.prompt?.trim() || '_(empty)_')
  lines.push('')
  lines.push('### Negative')
  lines.push('')
  lines.push(recipe.negativePrompt?.trim() || '_(empty)_')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(
    '_Machine-readable twin: import the `.flaxeo-recipe.json` file in Flaxeo Recipes. This guide is for humans and other tools._'
  )
  lines.push('')

  return lines.join('\n')
}

export function recipeGuideFilename(recipe: FlaxeoRecipe): string {
  const base = recipe.name
    .trim()
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
  return `${base || 'recipe'}.recipe-guide.md`
}

export function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
