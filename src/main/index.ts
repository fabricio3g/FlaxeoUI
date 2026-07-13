import {
  app,
  shell,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from 'electron'
import { dirname, isAbsolute, join } from 'path'
import { fork, ChildProcess } from 'child_process'
import http from 'http'
import os from 'os'
import { createPrivateKey, randomBytes, X509Certificate } from 'crypto'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { generate } from 'selfsigned'
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
import { resolveModelStorage } from '../shared/storagePaths'
import {
  isLanAccessLevel,
  isLanTransport,
  isPrivateIpv4,
  type LanAccessLevel,
  type LanInterface,
  type LanSharingOptions,
  type LanSharingStatus,
  type LanTransport
} from '../shared/lan'

// Fix Linux SUID sandbox helper issue (chrome-sandbox permissions)
// This is a no-op on Windows/macOS, so it stays cross-platform safe
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('--no-sandbox')
}

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let serverPort = 3000
let activeStoragePaths: ResolvedStoragePaths | null = null
const serverControlToken = randomBytes(32).toString('hex')
const desktopApiToken = randomBytes(32).toString('hex')
let lanTransition: Promise<void> = Promise.resolve()

function queueLanTransition<T>(operation: () => Promise<T>): Promise<T> {
  const result = lanTransition.then(operation, operation)
  lanTransition = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function isTrustedRendererUrl(candidate: string): boolean {
  try {
    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      return new URL(candidate).origin === new URL(process.env.ELECTRON_RENDERER_URL).origin
    }
    const expected = pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
    return candidate.split('#')[0] === expected
  } catch {
    return false
  }
}

function assertTrustedIpc(event: IpcMainInvokeEvent): void {
  if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url))
    throw new Error('Untrusted renderer')
}

interface LanPreferences {
  enabled: boolean
  address?: string
  transport: LanTransport
  accessLevel: LanAccessLevel
}

interface AppState {
  firstRun: boolean
  setupComplete: boolean
  skipped: boolean
  storage: StorageOverrides
  lan: LanPreferences
}

const defaultAppState: AppState = {
  firstRun: true,
  setupComplete: false,
  skipped: false,
  storage: {},
  lan: { enabled: false, transport: 'https', accessLevel: 'generation' }
}

function sanitizeStorageOverrides(value: unknown): StorageOverrides {
  if (!value || typeof value !== 'object') return {}

  const candidate = value as StorageOverrides
  const modelsRootDir =
    typeof candidate.modelsRootDir === 'string' && isAbsolute(candidate.modelsRootDir)
      ? candidate.modelsRootDir
      : undefined
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
    ...(modelsRootDir ? { modelsRootDir } : {}),
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
      storage: sanitizeStorageOverrides(parsed.storage),
      lan: {
        enabled: parsed.lan?.enabled === true,
        ...(typeof parsed.lan?.address === 'string' ? { address: parsed.lan.address } : {}),
        transport: isLanTransport(parsed.lan?.transport) ? parsed.lan.transport : 'https',
        accessLevel: isLanAccessLevel(parsed.lan?.accessLevel)
          ? parsed.lan.accessLevel
          : 'generation'
      }
    }
  } catch (e) {
    console.error('[Main] Failed to read app state:', e)
    return { ...defaultAppState }
  }
}

function getLanInterfaces(): LanInterface[] {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) =>
      (entries || [])
        .filter(
          (entry) => entry.family === 'IPv4' && !entry.internal && isPrivateIpv4(entry.address)
        )
        .map((entry) => ({ name, address: entry.address }))
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address))
}

interface LanCertificate {
  keyPath: string
  certPath: string
  caCertPath: string
  fingerprint: string
}

async function ensureLanCertificate(address: string): Promise<LanCertificate> {
  const securityDir = join(app.getPath('userData'), 'lan-security')
  const suffix = address.replace(/[^a-zA-Z0-9.-]/g, '_')
  const caKeyPath = join(securityDir, 'flaxeo-local-ca.key.pem')
  const caCertPath = join(securityDir, 'flaxeo-local-ca.cert.pem')
  const keyPath = join(securityDir, `lan-v2-${suffix}.key.pem`)
  const certPath = join(securityDir, `lan-v2-${suffix}.cert.pem`)
  fs.mkdirSync(securityDir, { recursive: true, mode: 0o700 })

  let regenerateAuthority = !fs.existsSync(caKeyPath) || !fs.existsSync(caCertPath)
  if (!regenerateAuthority) {
    try {
      const authority = new X509Certificate(fs.readFileSync(caCertPath))
      regenerateAuthority =
        !authority.ca ||
        Date.parse(authority.validTo) <= Date.now() + 24 * 60 * 60 * 1000 ||
        !authority.checkPrivateKey(createPrivateKey(fs.readFileSync(caKeyPath)))
    } catch {
      regenerateAuthority = true
    }
  }

  if (regenerateAuthority) {
    const authority = await generate([{ name: 'commonName', value: 'Flaxeo Image Local CA' }], {
      keyType: 'ec',
      curve: 'P-256',
      algorithm: 'sha256',
      notAfterDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      extensions: [
        { name: 'basicConstraints', cA: true, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }
      ]
    })
    fs.writeFileSync(caKeyPath, authority.private, { mode: 0o600 })
    fs.writeFileSync(caCertPath, authority.cert, { mode: 0o644 })
  }

  let regenerate = regenerateAuthority || !fs.existsSync(keyPath) || !fs.existsSync(certPath)
  if (!regenerate) {
    try {
      const certificate = new X509Certificate(fs.readFileSync(certPath))
      const authority = new X509Certificate(fs.readFileSync(caCertPath))
      regenerate =
        Date.parse(certificate.validTo) <= Date.now() + 24 * 60 * 60 * 1000 ||
        certificate.checkIP(address) !== address ||
        !certificate.verify(authority.publicKey) ||
        !certificate.checkPrivateKey(createPrivateKey(fs.readFileSync(keyPath)))
    } catch {
      regenerate = true
    }
  }

  if (regenerate) {
    const generated = await generate([{ name: 'commonName', value: address }], {
      keyType: 'ec',
      curve: 'P-256',
      algorithm: 'sha256',
      notAfterDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      ca: {
        key: fs.readFileSync(caKeyPath, 'utf8'),
        cert: fs.readFileSync(caCertPath, 'utf8')
      },
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyAgreement: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 7, ip: address }] }
      ]
    })
    fs.writeFileSync(keyPath, generated.private, { mode: 0o600 })
    fs.writeFileSync(certPath, generated.cert, { mode: 0o644 })
  }

  try {
    fs.chmodSync(keyPath, 0o600)
    fs.chmodSync(caKeyPath, 0o600)
  } catch {
    // Windows ACLs are used instead of POSIX modes.
  }
  const certificate = new X509Certificate(fs.readFileSync(certPath))
  return { keyPath, certPath, caCertPath, fingerprint: certificate.fingerprint256 }
}

function requestServerControl<T>(pathName: string, body?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ''
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: pathName,
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${serverControlToken}`,
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {})
        },
        timeout: 5000
      },
      (response) => {
        let text = ''
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => {
          if (!response.statusCode || response.statusCode >= 400)
            return reject(new Error(text || `Server control failed (${response.statusCode})`))
          try {
            resolve(JSON.parse(text) as T)
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('timeout', () => request.destroy(new Error('Server control timed out')))
    request.on('error', reject)
    if (data) request.write(data)
    request.end()
  })
}

async function getLanSharingStatus(): Promise<LanSharingStatus> {
  const interfaces = getLanInterfaces()
  try {
    const status =
      await requestServerControl<Omit<LanSharingStatus, 'interfaces'>>('/api/internal/lan')
    return { ...status, interfaces }
  } catch (error) {
    const preferences = readAppState().lan
    return {
      enabled: false,
      transport: preferences.transport,
      accessLevel: preferences.accessLevel,
      selectedAddress: preferences.address || interfaces[0]?.address || null,
      interfaces,
      url: null,
      pairingCode: null,
      pairingExpiresAt: null,
      certificateFingerprint: null,
      sessionCount: 0,
      devices: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function setLanSharing(
  enabled: boolean,
  options: LanSharingOptions
): Promise<LanSharingStatus> {
  const state = readAppState()
  const interfaces = getLanInterfaces()
  const address = options.address || state.lan.address || interfaces[0]?.address
  const transport = isLanTransport(options.transport) ? options.transport : 'https'
  const requestedAccessLevel = isLanAccessLevel(options.accessLevel)
    ? options.accessLevel
    : 'generation'
  const accessLevel = transport === 'http' ? 'generation' : requestedAccessLevel
  if (enabled && (!address || !interfaces.some((item) => item.address === address))) {
    throw new Error('Select an available private Wi-Fi or Ethernet address.')
  }

  let body: Record<string, unknown> = { enabled: false, transport, accessLevel }
  if (enabled && address) {
    body = {
      enabled: true,
      address,
      transport,
      accessLevel
    }
    if (transport === 'https') {
      const certificate = await ensureLanCertificate(address)
      body.keyPath = certificate.keyPath
      body.certPath = certificate.certPath
    }
  }
  await requestServerControl('/api/internal/lan', body)
  // Quick HTTP sharing is deliberately one-session-only and never auto-starts after restart.
  writeAppState({
    ...state,
    lan: {
      enabled: enabled && transport === 'https',
      ...(address ? { address } : {}),
      transport,
      accessLevel
    }
  })
  return getLanSharingStatus()
}

async function lanStartupEnvironment(): Promise<NodeJS.ProcessEnv> {
  const preferences = readAppState().lan
  const available = getLanInterfaces()
  const address = preferences.address || available[0]?.address
  if (!preferences.enabled || !address || !available.some((item) => item.address === address)) {
    return { FLAXEO_LAN_ENABLED: '0' }
  }
  const certificate = await ensureLanCertificate(address)
  return {
    FLAXEO_LAN_ENABLED: '1',
    FLAXEO_LAN_ADDRESS: address,
    FLAXEO_LAN_TRANSPORT: preferences.transport,
    FLAXEO_LAN_ACCESS_LEVEL: preferences.accessLevel,
    FLAXEO_LAN_KEY_PATH: certificate.keyPath,
    FLAXEO_LAN_CERT_PATH: certificate.certPath
  }
}

/**
 * writeAppState() - Persists app state to disk
 */
function writeAppState(state: AppState): void {
  const statePath = getStateFilePath()
  const temporaryPath = `${statePath}.tmp`
  try {
    fs.mkdirSync(dirname(statePath), { recursive: true })
    fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2))
    fs.renameSync(temporaryPath, statePath)
  } catch (e) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch {
      // Preserve the original persistence error.
    }
    console.error('[Main] Failed to write app state:', e)
    throw e
  }
}

/**
 * Writable data root for models / output / temp / backend downloads.
 * Linux AppImage mounts resources read-only — use userData there.
 * Windows/macOS packaged: keep process.resourcesPath (existing installs).
 * Dev: repo root (same as before).
 */
function getWritableDataRoot(): string {
  if (is.dev) {
    return join(__dirname, '../..')
  }
  // AppImage / many Linux packages: resourcesPath is not writable
  if (process.platform === 'linux') {
    return join(app.getPath('userData'), 'data')
  }
  return process.resourcesPath
}

function resolveStoragePaths(overrides: StorageOverrides): ResolvedStoragePaths {
  const dataRoot = getWritableDataRoot()
  const { modelsRootDir, modelDirs } = resolveModelStorage(join(dataRoot, 'models'), overrides)

  return {
    modelsRootDir,
    outputDir: overrides.outputDir || join(dataRoot, 'output'),
    tempDir: overrides.tempDir || join(dataRoot, 'temp'),
    modelDirs
  }
}

function storagePathsEqual(a: ResolvedStoragePaths | null, b: ResolvedStoragePaths): boolean {
  if (
    !a ||
    a.modelsRootDir !== b.modelsRootDir ||
    a.outputDir !== b.outputDir ||
    a.tempDir !== b.tempDir
  )
    return false
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
  if (id === 'modelsRoot') return settings.modelsRootDir
  if (id === 'output') return settings.outputDir
  if (id === 'temp') return settings.tempDir
  return settings.modelDirs[id]
}

function updateStorageOverride(id: StorageDirectoryId, directory?: string): StorageSettings {
  const state = readAppState()
  const storage = sanitizeStorageOverrides(state.storage)

  if (id === 'modelsRoot') {
    if (directory) storage.modelsRootDir = directory
    else delete storage.modelsRootDir
  } else if (id === 'output') {
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
async function startServer(): Promise<number> {
  const lanEnvironment = await lanStartupEnvironment()
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
    const dataRoot = getWritableDataRoot()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      FLAXEO_PACKAGED: is.dev ? '0' : '1',
      // Read-only bundle (icons, empty scaffold); writable data may differ on Linux
      FLAXEO_RESOURCES_PATH: is.dev ? join(__dirname, '../..') : process.resourcesPath,
      FLAXEO_DATA_PATH: dataRoot,
      FLAXEO_STORAGE_PATHS: JSON.stringify(storagePaths),
      FLAXEO_CONTROL_TOKEN: serverControlToken,
      FLAXEO_DESKTOP_TOKEN: desktopApiToken,
      ...lanEnvironment
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
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
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
  try {
    fs.mkdirSync(directory, { recursive: true })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[Main] Failed to ensure directory:', directory, e)
    dialog.showErrorBox(
      'Could not open folder',
      `Unable to create or access:\n${directory}\n\n${detail}\n\nSet a writable path under Settings → Storage, then try again.`
    )
    return
  }

  void shell.openPath(directory).then((errorMessage) => {
    if (errorMessage) {
      console.error('[Main] shell.openPath failed:', errorMessage)
      dialog.showErrorBox('Could not open folder', `Path:\n${directory}\n\n${errorMessage}`)
    }
  })
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
  // Writable backend/custom (Linux AppImage cannot write into bundled resources)
  openDirectory(join(getWritableDataRoot(), 'backend', 'custom'))
})

/**
 * IPC Handlers - Settings & Server Info
 */
ipcMain.handle('get-init-state', (event) => {
  assertTrustedIpc(event)
  const state = readAppState()
  return {
    firstRun: state.firstRun,
    setupComplete: state.setupComplete,
    skipped: state.skipped,
    port: serverPort,
    isDev: is.dev,
    desktopApiToken
  }
})

ipcMain.handle('get-server-port', () => serverPort)

ipcMain.handle('get-lan-sharing-status', (event) => {
  assertTrustedIpc(event)
  return getLanSharingStatus()
})

ipcMain.handle('set-lan-sharing', (event, enabled: boolean, options: LanSharingOptions) => {
  assertTrustedIpc(event)
  return queueLanTransition(() => setLanSharing(enabled, options))
})

ipcMain.handle('rotate-lan-pairing-code', async (event) => {
  assertTrustedIpc(event)
  await requestServerControl('/api/internal/lan/rotate', {})
  return getLanSharingStatus()
})

ipcMain.handle('revoke-lan-sessions', async (event) => {
  assertTrustedIpc(event)
  await requestServerControl('/api/internal/lan/revoke', {})
  return getLanSharingStatus()
})

ipcMain.handle('revoke-lan-session', async (event, deviceId: string) => {
  assertTrustedIpc(event)
  await requestServerControl('/api/internal/lan/revoke', { deviceId })
  return getLanSharingStatus()
})

ipcMain.handle('export-lan-ca-certificate', async (event) => {
  assertTrustedIpc(event)
  const status = await getLanSharingStatus()
  const address = status.selectedAddress || status.interfaces[0]?.address
  if (!address) throw new Error('No private LAN interface is available.')
  const certificate = await ensureLanCertificate(address)
  const options = {
    title: 'Export Flaxeo trusted certificate',
    defaultPath: 'flaxeo-local-ca.crt',
    filters: [{ name: 'Certificate', extensions: ['crt', 'pem'] }]
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return false
  fs.copyFileSync(certificate.caCertPath, result.filePath)
  return true
})

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

  try {
    fs.mkdirSync(directory, { recursive: true })
    const resolved = fs.realpathSync.native(directory)
    if (
      dirname(resolved) === resolved ||
      resolved === fs.realpathSync.native(app.getPath('home'))
    ) {
      throw new Error('Choose a dedicated subfolder, not a filesystem or home-directory root.')
    }
    if (!is.dev && resolved === fs.realpathSync.native(process.resourcesPath)) {
      throw new Error('The application installation folder cannot be used for storage.')
    }
    const probe = join(resolved, `.flaxeo-write-test-${process.pid}-${Date.now()}`)
    fs.writeFileSync(probe, 'test', { flag: 'wx' })
    fs.rmSync(probe, { force: true })
    return updateStorageOverride(id, resolved)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[Main] Failed to create storage directory:', directory, e)
    dialog.showErrorBox(
      'Could not use folder',
      `Unable to create or access:\n${directory}\n\n${detail}`
    )
    return null
  }
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
