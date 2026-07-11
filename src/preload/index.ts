import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { StorageDirectoryId, StorageSettings } from '../shared/storage'

/**
 * Custom Electron API exposed to the renderer process
 * Provides window controls and folder access functions
 */
const api = {
  /**
   * Window Controls - IPC communications to main process
   */
  minimize: (): void => ipcRenderer.send('window-minimize'),
  maximize: (): void => ipcRenderer.send('window-maximize'),
  close: (): void => ipcRenderer.send('window-close'),

  /**
   * Folder Access - Opens directories in native file explorer
   */
  openGalleryFolder: (): void => ipcRenderer.send('open-gallery-folder'),
  openModelsFolder: (): void => ipcRenderer.send('open-models-folder'),
  openCustomFolder: (): void => ipcRenderer.send('open-custom-folder'),
  getStorageSettings: (): Promise<StorageSettings> => ipcRenderer.invoke('get-storage-settings'),
  chooseStorageDirectory: (id: StorageDirectoryId): Promise<StorageSettings | null> =>
    ipcRenderer.invoke('choose-storage-directory', id),
  resetStorageDirectory: (id: StorageDirectoryId): Promise<StorageSettings> =>
    ipcRenderer.invoke('reset-storage-directory', id),
  openStorageDirectory: (id: StorageDirectoryId): Promise<void> =>
    ipcRenderer.invoke('open-storage-directory', id),

  /**
   * Settings & State
   */
  getInitState: (): Promise<{
    firstRun: boolean
    setupComplete: boolean
    skipped: boolean
    port: number
    isDev: boolean
  }> => ipcRenderer.invoke('get-init-state'),
  setFirstRunComplete: (): Promise<boolean> => ipcRenderer.invoke('set-first-run-complete'),
  reopenSetup: (): Promise<boolean> => ipcRenderer.invoke('reopen-setup'),
  setSetupSkipped: (): Promise<boolean> => ipcRenderer.invoke('set-setup-skipped'),
  toggleLocalNetwork: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('toggle-local-network', enabled)
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.electronAPI = api
}
