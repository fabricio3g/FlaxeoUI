// Shared contract for the model library (Models screen, presets, LoRA metadata, imports).
// Server implementation: src/server (models routes). Renderer access: composables/useModels.ts.
import type { ModelDirectoryKey } from './storage'

/** One installed model file, from the default folder of its type or from an extra library root. */
export interface ModelFileInfo {
  category: ModelDirectoryKey
  /** Value stored in config / passed to the backend. Relative to the type folder, or `@<rootId>/<relative>` for extra roots. */
  name: string
  /** Absolute path on disk (empty for remote/LAN clients). */
  path: string
  size: number
  mtime: number
  /** 'default' for the app's own folders, otherwise the ExtraRoot id. */
  root: string
}

export interface LoraMeta {
  triggerWords: string[]
  /** URL the renderer can load (served by the backend), if a preview image exists next to the file. */
  preview?: string
  defaultStrength?: number
  /** Free-form family hint, e.g. "FLUX.1", "SDXL". Only a hint: never used to filter. */
  family?: string
  notes?: string
}

export type ImportAction = 'move' | 'copy' | 'keep'

export interface ImportRequestItem {
  sourcePath: string
  category: ModelDirectoryKey
  action: ImportAction
  /** Optional subfolder inside the type folder. */
  subfolder?: string
}

export interface ImportResultItem {
  sourcePath: string
  ok: boolean
  /** Config value of the imported file when ok. */
  name?: string
  error?: string
}

export type ExtraRootLayout = 'comfyui' | 'flaxeo' | 'flat'

export interface ExtraRoot {
  id: string
  path: string
  layout: ExtraRootLayout
  /** Folder (relative to path) scanned for each type. */
  mapping: Partial<Record<ModelDirectoryKey, string>>
}

export interface ProbeResult {
  sourcePath: string
  /** Best guess, user can always override. */
  category: ModelDirectoryKey | null
  family: string | null
  format: 'gguf' | 'safetensors' | 'ckpt' | 'other'
  quant?: string
  size: number
}

export const PRESET_FILE_FORMAT = 'flaxeo-preset@1'
