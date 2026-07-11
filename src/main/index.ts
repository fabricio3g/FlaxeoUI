import { app, shell, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { dirname, isAbsolute, join } from 'path'
import { fork, ChildProcess } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'
import {
  MODEL_DIRECTORY_KEYS,
  isModelDirectoryKey,
  isStorageDirectoryId,
  type ResolvedStoragePaths,
  type StorageDirectoryId,
  type StorageOverrides,
  type StorageSettings
} from '../shared/storage'

// Fix Linux SUID sandbox helper issue (chrome-sandbox permissions)
// This is a no-op on Windows/macOS, so it stays cross-platform safe
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('--no-sandbox')
}

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let serverPort = 3000
let activeStoragePaths: ResolvedStoragePaths | null = null

interface AppState {
  firstRun: boolean
  setupComplete: boolean
  skipped: boolean
  storage: StorageOverrides
}

const defaultAppState: AppState = {
  firstRun: true,
  setupComplete: false,
  skipped: false,
  storage: {}
}

function sanitizeStorageOverrides(value: unknown): StorageOverrides {
  if (!value || typeof value !== 'object') return {}

  const candidate = value as StorageOverrides
  const outputDir =
    typeof candidate.outputDir === 'string' && isAbsolute(candidate.outputDir)
      ? candidate.outputDir
      : undefined
  const tempDir =
    typeof candidate.tempDir === 'string' && isAbsolute(candidate.tempDir)
      ? candidate.tempDir
      : undefined
  const modelDirs: StorageOverrides['modelDirs'] = {}

  if (candidate.modelDirs && typeof candidate.modelDirs === 'object') {
    for (const key of MODEL_DIRECTORY_KEYS) {
      const directory = candidate.modelDirs[key]
      if (typeof directory === 'string' && isAbsolute(directory)) modelDirs[key] = directory
    }
  }

  return {
    ...(outputDir ? { outputDir } : {}),
    ...(tempDir ? { tempDir } : {}),
    ...(Object.keys(modelDirs).length ? { modelDirs } : {})
  }
}

/**
 * getStateFilePath() - Returns the path to the persisted app state JSON file
 */
function getStateFilePath(): string {
  return join(app.getPath('userData'), 'flaxeo-state.json')
}

/**
 * readAppState() - Reads persisted app state, creating defaults if missing
 */
function readAppState(): AppState {
  const statePath = getStateFilePath()
  try {
    if (!fs.existsSync(statePath)) return { ...defaultAppState }
    const raw = fs.readFileSync(statePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      firstRun: typeof parsed.firstRun === 'boolean' ? parsed.firstRun : defaultAppState.firstRun,
      setupComplete:
        typeof parsed.setupComplete === 'boolean'
          ? parsed.setupComplete
          : defaultAppState.setupComplete,
      skipped: typeof parsed.skipped === 'boolean' ? parsed.skipped : defaultAppState.skipped,
      storage: sanitizeStorageOverrides(parsed.storage)
    }
  } catch (e) {
    console.error('[Main] Failed to read app state:', e)
    return { ...defaultAppState }
  }
}

/**
 * writeAppState() - Persists app state to disk
 */
function writeAppState(state: AppState): void {
  try {
    const statePath = getStateFilePath()
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
  } catch (e) {
    console.error('[Main] Failed to write app state:', e)
  }
}

/**
 * getResourcePath() - Gets the correct path for resources in dev/production
 */
function getResourcePath(relativePath: string): string {
  if (is.dev) {
    return join(__dirname, '../..', relativePath)
  }
  return join(process.resourcesPath, relativePath)
}

function resolveStoragePaths(overrides: StorageOverrides): ResolvedStoragePaths {
  const modelsRootDir = getResourcePath('models')
  const modelDirs = Object.fromEntries(
    MODEL_DIRECTORY_KEYS.map((key) => [key, overrides.modelDirs?.[key] || join(modelsRootDir, key)])
  ) as ResolvedStoragePaths['modelDirs']

  return {
    modelsRootDir,
    outputDir: overrides.outputDir || getResourcePath('output'),
    tempDir: overrides.tempDir || getResourcePath('temp'),
    modelDirs
  }
}

function storagePathsEqual(a: ResolvedStoragePaths | null, b: ResolvedStoragePaths): boolean {
  if (!a || a.outputDir !== b.outputDir || a.tempDir !== b.tempDir) return false
  return MODEL_DIRECTORY_KEYS.every((key) => a.modelDirs[key] === b.modelDirs[key])
}

function getStorageSettings(): StorageSettings {
  const storage = readAppState().storage
  const paths = resolveStoragePaths(storage)
  return {
    ...paths,
    overrides: storage,
    restartRequired: activeStoragePaths !== null && !storagePathsEqual(activeStoragePaths, paths)
  }
}

function storageDirectory(settings: ResolvedStoragePaths, id: StorageDirectoryId): string {
  if (id === 'output') return settings.outputDir
  if (id === 'temp') return settings.tempDir
  return settings.modelDirs[id]
}

function updateStorageOverride(id: StorageDirectoryId, directory?: string): StorageSettings {
  const state = readAppState()
  const storage = sanitizeStorageOverrides(state.storage)

  if (id === 'output') {
    if (directory) storage.outputDir = directory
    else delete storage.outputDir
  } else if (id === 'temp') {
    if (directory) storage.tempDir = directory
    else delete storage.tempDir
  } else if (isModelDirectoryKey(id)) {
    const modelDirs = { ...storage.modelDirs }
    if (directory) modelDirs[id] = directory
    else delete modelDirs[id]
    if (Object.keys(modelDirs).length) storage.modelDirs = modelDirs
    else delete storage.modelDirs
  }

  writeAppState({ ...state, storage })
  return getStorageSettings()
}

/**
 * startServer() - Spawns the Express server process
 * The server handles all sd-cli interactions via API
 */
function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    // In dev mode: __dirname is flaxeo-vue/out/main, so go up to flaxeo-vue root
    // In production: server.js is in resourcesPath
    const serverPath = is.dev
      ? join(__dirname, '../server/index.js')
      : join(__dirname, '../server/index.js') // inside app.asar/out/server/index.js

    const cwdPath = is.dev
      ? join(__dirname, '../..') // flaxeo-vue root
      : process.resourcesPath

    console.log('[Main] Starting server from:', serverPath)
    console.log('[Main] Working directory:', cwdPath)

    // Check if the bundled server exists
    if (!fs.existsSync(serverPath)) {
      console.error('[Main] server not found at:', serverPath)
      reject(new Error('Server file not found'))
      return
    }

    // Pass CLI arguments to the server, filtering out Electron-specific ones
    const args = process.argv
      .slice(2)
      .filter(
        (arg) => !arg.startsWith('--user-data-dir=') && !arg.startsWith('--runtime-') && arg !== '.'
      )

    console.log('[Main] Passing args to server:', args)

    const storagePaths = resolveStoragePaths(readAppState().storage)
    activeStoragePaths = storagePaths

    // Environment variables for the server process
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      FLAXEO_PACKAGED: is.dev ? '0' : '1',
      FLAXEO_RESOURCES_PATH: is.dev ? join(__dirname, '../..') : process.resourcesPath,
      FLAXEO_STORAGE_PATHS: JSON.stringify(storagePaths)
    }

    // Use fork() which is designed for Node.js processes
    // In production, spawn the Electron binary with ELECTRON_RUN_AS_NODE
    // In development, fork() uses node automatically
    if (is.dev) {
      // Development: use fork() which uses node automatically
      serverProcess = fork(serverPath, args, {
        cwd: cwdPath,
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      })
    } else {
      // Production: use Electron binary as Node runtime
      const { spawn } = require('child_process')
      serverProcess = spawn(process.execPath, [serverPath, ...args], {
        cwd: cwdPath,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    }

    if (!serverProcess) {
      reject(new Error('Failed to create server process'))
      return
    }

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      // Write raw output directly to preserve progress bars
      process.stdout.write(output)

      // Parse port from server output (matches "[Server] Running on port: 3000")
      const portMatch = output.match(/port:\s*(\d+)/i)
      if (portMatch) {
        serverPort = parseInt(portMatch[1])
        console.log('[Main] Server started on port:', serverPort)
        resolve(serverPort)
      }
    })

    serverProcess.stderr?.on('data', (data) => {
      // Write raw stderr directly
      process.stderr.write(data.toString())
    })

    serverProcess.on('error', (err) => {
      console.error('[Main] Failed to start server:', err)
      reject(err)
    })

    serverProcess.on('exit', (code) => {
      console.log('[Main] Server exited with code:', code)
      if (code !== 0 && code !== null) {
        console.error('[Main] Server crashed or exited unexpectedly.')
      }
      serverProcess = null
    })

    // Fallback: resolve after timeout if no port detected
    setTimeout(() => resolve(serverPort), 3000)
  })
}

/**
 * stopServer() - Terminates the server process
 */
function stopServer(): void {
  if (serverProcess) {
    console.log('[Main] Stopping server...')
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

/**
 * createWindow() - Creates the main application window
 * Configures frameless window with custom titlebar
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#09090b',
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * IPC Handlers - Window Controls
 */
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window-close', () => mainWindow?.close())

function openDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true })
  void shell.openPath(directory)
}

/**
 * IPC Handlers - Folder Access
 */
ipcMain.on('open-gallery-folder', () => {
  openDirectory(getStorageSettings().outputDir)
})

ipcMain.on('open-models-folder', () => {
  const storage = getStorageSettings()
  const modelDirectories = Object.values(storage.modelDirs)
  const parents = new Set(modelDirectories.map((directory) => dirname(directory)))
  openDirectory(parents.size === 1 ? [...parents][0] : storage.modelDirs.diffusion)
})

ipcMain.on('open-custom-folder', () => {
  const customDir = getResourcePath('backend/custom')
  openDirectory(customDir)
})

/**
 * IPC Handlers - Settings & Server Info
 */
ipcMain.handle('get-init-state', () => {
  const state = readAppState()
  return {
    firstRun: state.firstRun,
    setupComplete: state.setupComplete,
    skipped: state.skipped,
    port: serverPort,
    isDev: is.dev
  }
})

ipcMain.handle('get-server-port', () => serverPort)

ipcMain.handle('get-storage-settings', () => getStorageSettings())

ipcMain.handle('choose-storage-directory', async (_event, id: string) => {
  if (!isStorageDirectoryId(id)) throw new Error('Invalid storage directory')

  const options: OpenDialogOptions = {
    title: 'Choose storage directory',
    properties: ['openDirectory', 'createDirectory']
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const directory = result.filePaths[0]
  if (result.canceled || !directory) return null

  fs.mkdirSync(directory, { recursive: true })
  return updateStorageOverride(id, directory)
})

ipcMain.handle('reset-storage-directory', (_event, id: string) => {
  if (!isStorageDirectoryId(id)) throw new Error('Invalid storage directory')
  return updateStorageOverride(id)
})

ipcMain.handle('open-storage-directory', (_event, id: string) => {
  if (!isStorageDirectoryId(id)) throw new Error('Invalid storage directory')
  openDirectory(storageDirectory(getStorageSettings(), id))
})

ipcMain.handle('set-first-run-complete', () => {
  const state = readAppState()
  writeAppState({ ...state, firstRun: false, setupComplete: true, skipped: false })
  return true
})

ipcMain.handle('reopen-setup', () => {
  const state = readAppState()
  writeAppState({ ...state, setupComplete: false, skipped: false })
  return true
})

ipcMain.handle('set-setup-skipped', () => {
  const state = readAppState()
  writeAppState({ ...state, skipped: true })
  return true
})

ipcMain.handle('toggle-local-network', (_event, enabled: boolean) => {
  console.log('[Main] Toggle local network:', enabled)
})

/**
 * App lifecycle handlers
 */
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.flaxeo.ui')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start the backend server first
  try {
    await startServer()
    console.log('[Main] Server started, creating window...')
  } catch (err) {
    console.error('[Main] Server start failed:', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopServer()
})
