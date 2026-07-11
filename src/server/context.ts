import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import type { AppContext, BackendConfig, Paths } from './types'
import { MODEL_DIRECTORY_KEYS, type ResolvedStoragePaths } from '../shared/storage'

function getArg(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}

function loadBackendConfig(configFile: string): BackendConfig {
  try {
    if (fs.existsSync(configFile)) {
      return JSON.parse(fs.readFileSync(configFile, 'utf8'))
    }
  } catch (error) {
    console.error('Error loading config:', error)
  }

  return {
    activeVersion: 'custom',
    installedVersions: [],
    customBinaryExists: false
  }
}

function ensureDirectories(paths: Paths): void {
  for (const directory of Object.values(paths.modelDirs))
    fs.mkdirSync(directory, { recursive: true })

  fs.mkdirSync(paths.outputDir, { recursive: true })
  fs.mkdirSync(paths.backendDir, { recursive: true })
  fs.mkdirSync(paths.customDir, { recursive: true })
  fs.mkdirSync(paths.releasesDir, { recursive: true })
  fs.mkdirSync(paths.tempDir, { recursive: true })
}

function loadStoragePaths(resourcesPath: string): ResolvedStoragePaths {
  const modelsRootDir = path.join(resourcesPath, 'models')
  const defaults: ResolvedStoragePaths = {
    modelsRootDir,
    outputDir: path.join(resourcesPath, 'output'),
    tempDir: path.join(resourcesPath, 'temp'),
    modelDirs: Object.fromEntries(
      MODEL_DIRECTORY_KEYS.map((key) => [key, path.join(modelsRootDir, key)])
    ) as ResolvedStoragePaths['modelDirs']
  }

  try {
    const parsed = JSON.parse(process.env.FLAXEO_STORAGE_PATHS || '{}') as Partial<ResolvedStoragePaths>
    const configuredRoot =
      typeof parsed.modelsRootDir === 'string' && path.isAbsolute(parsed.modelsRootDir)
        ? parsed.modelsRootDir
        : defaults.modelsRootDir
    const modelDirs = Object.fromEntries(
      MODEL_DIRECTORY_KEYS.map((key) => {
        const configured = parsed.modelDirs?.[key]
        return [
          key,
          typeof configured === 'string' && path.isAbsolute(configured)
            ? configured
            : path.join(configuredRoot, key)
        ]
      })
    ) as ResolvedStoragePaths['modelDirs']

    return {
      modelsRootDir: configuredRoot,
      outputDir:
        typeof parsed.outputDir === 'string' && path.isAbsolute(parsed.outputDir)
          ? parsed.outputDir
          : defaults.outputDir,
      tempDir:
        typeof parsed.tempDir === 'string' && path.isAbsolute(parsed.tempDir)
          ? parsed.tempDir
          : defaults.tempDir,
      modelDirs
    }
  } catch (error) {
    console.error('[Server] Invalid storage configuration:', error)
    return defaults
  }
}

export function createContext(): AppContext {
  const args = process.argv.slice(2)
  const port = parseInt(getArg(args, '--port', '3000'), 10)
  const host = getArg(args, '--host', '0.0.0.0')
  const resourcesPath = process.env.FLAXEO_RESOURCES_PATH || process.cwd()
  const storage = loadStoragePaths(resourcesPath)
  const paths: Paths = {
    root: resourcesPath,
    backendDir: path.join(resourcesPath, 'backend'),
    customDir: path.join(resourcesPath, 'backend', 'custom'),
    releasesDir: path.join(resourcesPath, 'backend', 'releases'),
    modelsDir: storage.modelsRootDir,
    modelDirs: storage.modelDirs,
    outputDir: storage.outputDir,
    tempDir: storage.tempDir,
    configFile: path.join(resourcesPath, 'backend-config.json')
  }

  console.log('[Server] Mode:', process.env.FLAXEO_PACKAGED === '1' ? 'PACKAGED' : 'DEVELOPMENT')
  console.log('[Server] Resources path:', resourcesPath)

  ensureDirectories(paths)

  const state = {
    backendConfig: loadBackendConfig(paths.configFile),
    serverLogs: [] as string[],
    logBus: new EventEmitter(),
    sdProcess: null,
    cliProcess: null,
    server: null,
    networkStatus: {
      local: { enabled: args.includes('--local'), url: null },
      ngrok: { enabled: false, url: null, error: null },
      cloudflare: { enabled: false, url: null, error: null }
    },
    downloads: {},
    ngrokListener: null,
    cloudflareTunnel: null,
    progress: null,
    progressBus: new EventEmitter(),
    previewImageBuffer: null,
    previewTempFile: null,
    convertOutputPath: null
  }

  return {
    args,
    host,
    port,
    paths,
    state,
    hasFlag: (name) => args.includes(name),
    getActiveBackendPath: () =>
      state.backendConfig.activeVersion === 'custom'
        ? paths.customDir
        : path.join(paths.releasesDir, state.backendConfig.activeVersion),
    saveBackendConfig: () => {
      fs.writeFileSync(paths.configFile, JSON.stringify(state.backendConfig, null, 2))
    }
  }
}
