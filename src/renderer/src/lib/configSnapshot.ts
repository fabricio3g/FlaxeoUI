/**
 * Compact config snapshots for generation history re-run.
 * Avoids storing the entire GenerationConfig (localStorage size).
 */

import type { GenerationConfig } from '@/stores/config'

const SNAPSHOT_KEYS = [
  'backendMode',
  'loadMode',
  'standardModel',
  'diffusionModel',
  'highNoiseDiffusionModel',
  'uncondDiffusionModel',
  't5xxlModel',
  'llmModel',
  'llmVisionModel',
  'clipModel',
  'clipGModel',
  'clipVisionModel',
  'embeddingsConnectorsModel',
  'vaeModel',
  'vaeFormat',
  'audioVaeModel',
  'taesdModel',
  'upscaleModel',
  'controlNetModel',
  'steps',
  'cfgScale',
  'width',
  'height',
  'seed',
  'seedLocked',
  'sampler',
  'scheduler',
  'clipSkip',
  'batchCount',
  'guidance',
  'img2imgStrength',
  'flashAttention',
  'vaeTiling',
  'clipOnCpu',
  'vaeOnCpu',
  'controlNetOnCpu',
  'cpuOffload',
  'streamLayers',
  'maxVram',
  'threads',
  'autoFit',
  'splitMode',
  'mmap',
  'cacheMode',
  'cacheOption',
  'scmMask',
  'scmPolicy',
  'flowShift',
  'eta',
  'loraApplyMode',
  'rngType',
  'samplerRngType',
  'predictionType',
  'quantizationType',
  'livePreviewMethod',
  'regionalPromptingEnabled',
  'regionalPromptRegions',
  'videoMode',
  'qwenImageZeroCondT'
] as const satisfies readonly (keyof GenerationConfig)[]

export type ConfigSnapshot = Partial<GenerationConfig> & {
  loras?: GenerationConfig['loras']
}

export function pickConfigSnapshot(config: GenerationConfig): ConfigSnapshot {
  const snap: ConfigSnapshot = {}
  for (const key of SNAPSHOT_KEYS) {
    const value = config[key]
    if (value === undefined || value === null || value === '') continue
    if (value === false || value === 0) {
      // keep meaningful zeros / false where defaults differ
      if (
        key === 'seed' ||
        key === 'maxVram' ||
        key === 'clipSkip' ||
        key === 'threads' ||
        key === 'regionalPromptingEnabled'
      ) {
        ;(snap as Record<string, unknown>)[key] = value
      }
      continue
    }
    ;(snap as Record<string, unknown>)[key] = value
  }
  if (config.loras?.length) {
    snap.loras = config.loras.map((l) => ({ ...l }))
  }
  snap.regionalPromptingEnabled = config.regionalPromptingEnabled
  snap.regionalPromptRegions = config.regionalPromptingEnabled
    ? config.regionalPromptRegions.map((region) => ({ ...region }))
    : []
  // Always keep seed even when -1 / 0
  snap.seed = config.seed
  snap.steps = config.steps
  snap.cfgScale = config.cfgScale
  snap.width = config.width
  snap.height = config.height
  snap.loadMode = config.loadMode
  return snap
}

export function isConfigSnapshot(value: unknown): value is ConfigSnapshot {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
