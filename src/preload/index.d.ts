import { ElectronAPI } from '@electron-toolkit/preload'

/**
 * Custom Electron API type definitions
 * Exposed to renderer via contextBridge
 */
interface CustomElectronAPI {
  // Window controls
  minimize: () => void
  maximize: () => void
  close: () => void

  // Folder access
  openGalleryFolder: () => void
  openModelsFolder: () => void
  openCustomFolder: () => void

  // Settings
  getInitState: () => Promise<{ firstRun: boolean; port: number }>
  setFirstRunComplete: () => Promise<boolean>
  toggleLocalNetwork: (enabled: boolean) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: CustomElectronAPI
  }
}
