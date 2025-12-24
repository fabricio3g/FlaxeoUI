import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let serverPort = 3000

/**
 * getResourcePath() - Gets the correct path for resources in dev/production
 */
function getResourcePath(relativePath: string): string {
  if (is.dev) {
    return join(__dirname, '../../..', relativePath)
  }
  return join(process.resourcesPath, relativePath)
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
      ? join(__dirname, '../..', 'server.js')  // flaxeo-vue/server.js
      : join(process.resourcesPath, 'server.js')

    const cwdPath = is.dev
      ? join(__dirname, '../..')  // flaxeo-vue root
      : process.resourcesPath

    console.log('[Main] Starting server from:', serverPath)
    console.log('[Main] Working directory:', cwdPath)

    // Check if server.js exists
    if (!fs.existsSync(serverPath)) {
      console.error('[Main] server.js not found at:', serverPath)
      reject(new Error('Server file not found'))
      return
    }

    // Pass CLI arguments to the server, filtering out Electron-specific ones
    const args = process.argv.slice(2).filter(arg => 
      !arg.startsWith('--user-data-dir=') && 
      !arg.startsWith('--runtime-') &&
      arg !== '.'
    )

    console.log('[Main] Passing args to server:', args)

    serverProcess = spawn('node', [serverPath, ...args], {
      cwd: cwdPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log('[Server]', output)

      // Parse port from server output
      const portMatch = output.match(/Server running on port (\d+)/)
      if (portMatch) {
        serverPort = parseInt(portMatch[1])
        console.log('[Main] Server started on port:', serverPort)
        resolve(serverPort)
      }
    })

    serverProcess.stderr?.on('data', (data) => {
      console.error('[Server Error]', data.toString())
    })

    serverProcess.on('error', (err) => {
      console.error('[Main] Failed to start server:', err)
      reject(err)
    })

    serverProcess.on('exit', (code) => {
      console.log('[Main] Server exited with code:', code)
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
    titleBarStyle: 'hidden',
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

/**
 * IPC Handlers - Folder Access
 */
ipcMain.on('open-gallery-folder', () => {
  const outputDir = getResourcePath('output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  shell.openPath(outputDir)
})

ipcMain.on('open-models-folder', () => {
  const modelsDir = getResourcePath('models')
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true })
  }
  shell.openPath(modelsDir)
})

ipcMain.on('open-custom-folder', () => {
  const customDir = getResourcePath('backend/custom')
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true })
  }
  shell.openPath(customDir)
})

/**
 * IPC Handlers - Settings & Server Info
 */
ipcMain.handle('get-init-state', () => {
  return {
    firstRun: false,
    port: serverPort,
    isDev: is.dev
  }
})

ipcMain.handle('get-server-port', () => serverPort)

ipcMain.handle('set-first-run-complete', () => true)

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
