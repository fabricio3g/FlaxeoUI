import type { ChildProcess } from 'child_process'
import type { Server } from 'http'

export type JsonObject = Record<string, any>

export interface BackendConfig {
  activeVersion: string
  installedVersions: string[]
  customBinaryExists: boolean
  [key: string]: any
}

export interface Paths {
  root: string
  backendDir: string
  customDir: string
  releasesDir: string
  modelsDir: string
  outputDir: string
  tempDir: string
  configFile: string
}

export interface NetworkStatus {
  local: { enabled: boolean; url: string | null }
  ngrok: { enabled: boolean; url: string | null; error: string | null }
  cloudflare: { enabled: boolean; url: string | null; error: string | null }
}

export interface RuntimeState {
  backendConfig: BackendConfig
  serverLogs: string[]
  sdProcess: ChildProcess | null
  cliProcess: ChildProcess | null
  server: Server | null
  networkStatus: NetworkStatus
  ngrokListener: any
  cloudflareTunnel: ChildProcess | null
}

export interface AppContext {
  args: string[]
  host: string
  port: number
  paths: Paths
  state: RuntimeState
  getActiveBackendPath: () => string
  saveBackendConfig: () => void
  hasFlag: (name: string) => boolean
}
