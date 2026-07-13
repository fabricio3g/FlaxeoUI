import path from 'node:path'
import {
  MODEL_DIRECTORY_KEYS,
  type ResolvedStoragePaths,
  type StorageOverrides
} from './storage.ts'

export function resolveModelStorage(
  defaultModelsRoot: string,
  overrides: StorageOverrides
): Pick<ResolvedStoragePaths, 'modelsRootDir' | 'modelDirs'> {
  const modelsRootDir = overrides.modelsRootDir || defaultModelsRoot
  const modelDirs = Object.fromEntries(
    MODEL_DIRECTORY_KEYS.map((key) => [
      key,
      overrides.modelDirs?.[key] || path.join(modelsRootDir, key)
    ])
  ) as ResolvedStoragePaths['modelDirs']

  return { modelsRootDir, modelDirs }
}
