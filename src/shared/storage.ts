export const MODEL_DIRECTORY_KEYS = [
  'diffusion',
  'uncond_diffusion',
  'vae',
  'audio_vae',
  'llm',
  'llm_vision',
  't5xxl',
  'embeddings_connectors',
  'clip',
  'clip_vision',
  'loras',
  'controlnet',
  'photomaker',
  'upscale',
  'hires_upscalers',
  'taesd',
  'embeddings',
  'adetailer',
  'animatediff'
] as const

export type ModelDirectoryKey = (typeof MODEL_DIRECTORY_KEYS)[number]
export type StorageDirectoryId = 'modelsRoot' | 'output' | 'temp' | ModelDirectoryKey

export interface StorageOverrides {
  modelsRootDir?: string
  outputDir?: string
  tempDir?: string
  modelDirs?: Partial<Record<ModelDirectoryKey, string>>
}

export interface ResolvedStoragePaths {
  modelsRootDir: string
  outputDir: string
  tempDir: string
  modelDirs: Record<ModelDirectoryKey, string>
}

export interface StorageSettings extends ResolvedStoragePaths {
  overrides: StorageOverrides
  restartRequired: boolean
}

export function isModelDirectoryKey(value: string): value is ModelDirectoryKey {
  return MODEL_DIRECTORY_KEYS.includes(value as ModelDirectoryKey)
}

export function isStorageDirectoryId(value: string): value is StorageDirectoryId {
  return (
    value === 'modelsRoot' || value === 'output' || value === 'temp' || isModelDirectoryKey(value)
  )
}
