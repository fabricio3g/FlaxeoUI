import { ElectronAPI } from '@electron-toolkit/preload'
import type { StorageDirectoryId, StorageSettings } from '../shared/storage'
import type { LanSharingOptions, LanSharingStatus } from '../shared/lan'

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
  getLanSharingStatus: () => Promise<LanSharingStatus>
  setLanSharing: (enabled: boolean, options: LanSharingOptions) => Promise<LanSharingStatus>
  rotateLanPairingCode: () => Promise<LanSharingStatus>
  revokeLanSessions: () => Promise<LanSharingStatus>
  revokeLanSession: (deviceId: string) => Promise<LanSharingStatus>
  exportLanCaCertificate: () => Promise<boolean>

  // Settings
  getInitState: () => Promise<{
    firstRun: boolean
    setupComplete: boolean
    skipped: boolean
    port: number
    isDev: boolean
    desktopApiToken: string
  }>
  setFirstRunComplete: () => Promise<boolean>
  reopenSetup: () => Promise<boolean>
  setSetupSkipped: () => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: CustomElectronAPI
  }
}
