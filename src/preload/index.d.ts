import { ElectronAPI } from '@electron-toolkit/preload'
import type { StorageDirectoryId, StorageSettings } from '../shared/storage'

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
  getStorageSettings: () => Promise<StorageSettings>
  chooseStorageDirectory: (id: StorageDirectoryId) => Promise<StorageSettings | null>
  resetStorageDirectory: (id: StorageDirectoryId) => Promise<StorageSettings>
  openStorageDirectory: (id: StorageDirectoryId) => Promise<void>

  // Settings
  getInitState: () => Promise<{
    firstRun: boolean
    setupComplete: boolean
    skipped: boolean
    port: number
    isDev: boolean
  }>
  setFirstRunComplete: () => Promise<boolean>
  reopenSetup: () => Promise<boolean>
  setSetupSkipped: () => Promise<boolean>
  toggleLocalNetwork: (enabled: boolean) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: CustomElectronAPI
  }
}
