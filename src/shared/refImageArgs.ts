/**
 * Resolve sd-cli --ref-image-args for Edit Ref mode (see leejet docs/edit.md).
 *
 * User control:
 * - `off`  → never send the flag (old binaries / legacy CLI behaviour)
 * - `auto` → suggest from diffusion model name when known
 * - named preset → force that preset
 */

export type RefImagePreset =
  | 'flux_kontext'
  | 'longcat'
  | 'flux2'
  | 'qwen'
  | 'qwen_layered'
  | 'z_image_omni'
  | 'krea2_ostris_edit'
  | 'krea2_edit'
  | 'cosmos_reference'
  | 'default'

/** User-facing selection stored in config (includes meta choices). */
export type RefImagePresetChoice = 'auto' | 'off' | RefImagePreset | string

const PRESET_TO_ARGS: Record<RefImagePreset, string> = {
  flux_kontext: 'preset=flux_kontext',
  longcat: 'preset=longcat',
  flux2: 'preset=flux2',
  qwen: 'preset=qwen',
  qwen_layered: 'preset=qwen_layered',
  z_image_omni: 'preset=z_image_omni',
  krea2_ostris_edit: 'preset=krea2_ostris_edit',
  krea2_edit: 'preset=krea2_edit',
  cosmos_reference: 'preset=cosmos_reference',
  default: 'preset=default'
}

/** Compact options for Edit Ref Select (value → label). */
export const REF_IMAGE_PRESET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto (from model)' },
  // Off = omit --ref-image-args so the CLI uses architecture auto-detect (PR #1780 default)
  { value: 'off', label: 'Off (CLI default)' },
  { value: 'cosmos_reference', label: 'Anima / cosmos_reference' },
  { value: 'flux_kontext', label: 'Flux Kontext' },
  { value: 'qwen', label: 'Qwen Image Edit' },
  { value: 'qwen_layered', label: 'Qwen layered' },
  { value: 'flux2', label: 'Flux.2' },
  { value: 'longcat', label: 'LongCat' },
  { value: 'z_image_omni', label: 'Boogu / Z-Image Omni' },
  { value: 'krea2_ostris_edit', label: 'Krea2 edit (Ostris)' },
  { value: 'krea2_edit', label: 'Krea2 edit' },
  { value: 'default', label: 'preset=default' }
]

export function refImageArgsFromPreset(preset: RefImagePreset | string | null | undefined): string {
  if (!preset) return ''
  const key = String(preset).trim()
  if (key === 'auto' || key === 'off' || key === '') return ''
  if (key in PRESET_TO_ARGS) return PRESET_TO_ARGS[key as RefImagePreset]
  // Allow full custom strings (comma-separated key=value)
  if (key.includes('=') || key.includes('preset=')) return key
  return `preset=${key}`
}

/**
 * Infer ref-image preset from diffusion model path/name and optional pack/preset id.
 * Does not apply user choice — use resolveRefImageArgsForConfig for that.
 */
export function resolveRefImagePreset(hints: {
  diffusionModel?: string | null
  uncondDiffusionModel?: string | null
  presetId?: string | null
  packId?: string | null
  explicitPreset?: string | null
}): RefImagePreset | null {
  if (hints.explicitPreset && String(hints.explicitPreset).trim()) {
    const e = String(hints.explicitPreset).trim()
    if (e === 'auto' || e === 'off') return null
    if (e in PRESET_TO_ARGS) return e as RefImagePreset
    return e as RefImagePreset
  }

  const hay = [
    hints.packId,
    hints.presetId,
    hints.diffusionModel,
    hints.uncondDiffusionModel
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\\/g, '/')

  if (!hay) return null

  // Anima community edit LoRAs → cosmos_reference (edit.md)
  if (/\banima\b|anima2|anima-preview|anima_preview|animeedit/.test(hay)) return 'cosmos_reference'

  if (/kontext/.test(hay)) return 'flux_kontext'
  if (/qwen.?image.?edit.?layered|layered/.test(hay) && /qwen/.test(hay)) return 'qwen_layered'
  if (/qwen.?image.?edit|qwen-image-edit|qwen_image_edit/.test(hay)) return 'qwen'
  if (/longcat/.test(hay)) return 'longcat'
  if (/boogu|z.?image.?omni|z_image_omni/.test(hay)) return 'z_image_omni'
  if (/krea2.?edit|krea-2-edit|krea2edit/.test(hay)) return 'krea2_edit'
  if (/krea2|krea-2|krea_2/.test(hay)) return 'krea2_ostris_edit'
  if (/flux\.?2|flux2/.test(hay)) return 'flux2'

  return null
}

/**
 * Full --ref-image-args value for a user choice + model hints.
 * - choice `off` → '' (do not pass flag; safe for old binaries)
 * - choice `auto` → model-inferred preset, or '' if unknown
 * - named preset → that preset
 * - empty choice treated as auto
 */
export function resolveRefImageArgsForConfig(
  choice: RefImagePresetChoice | null | undefined,
  hints: {
    diffusionModel?: string | null
    uncondDiffusionModel?: string | null
    presetId?: string | null
    packId?: string | null
  }
): string {
  const c = String(choice ?? 'auto').trim() || 'auto'
  if (c === 'off') return ''
  if (c === 'auto') {
    const inferred = resolveRefImagePreset(hints)
    if (!inferred || inferred === 'default') return ''
    return refImageArgsFromPreset(inferred)
  }
  return refImageArgsFromPreset(c)
}

/** @deprecated Prefer resolveRefImageArgsForConfig — kept for callers that only auto-infer. */
export function resolveRefImageArgs(hints: {
  diffusionModel?: string | null
  uncondDiffusionModel?: string | null
  presetId?: string | null
  packId?: string | null
  explicitPreset?: string | null
}): string {
  if (hints.explicitPreset != null && String(hints.explicitPreset).trim() !== '') {
    return resolveRefImageArgsForConfig(String(hints.explicitPreset).trim(), hints)
  }
  return resolveRefImageArgsForConfig('auto', hints)
}
