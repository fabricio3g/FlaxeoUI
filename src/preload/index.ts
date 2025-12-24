import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

  /**
   * Settings & State
   */
  getInitState: (): Promise<{ firstRun: boolean; port: number }> =>
    ipcRenderer.invoke('get-init-state'),
  setFirstRunComplete: (): Promise<boolean> =>
    ipcRenderer.invoke('set-first-run-complete'),
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
