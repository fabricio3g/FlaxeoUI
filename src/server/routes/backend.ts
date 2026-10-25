import fs from 'fs'
import path from 'path'
import { execFile, execSync } from 'child_process'
import { promisify } from 'util'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import type { Express } from 'express'
import type { AppContext } from '../types'
import {
  backendDirPlatformMismatch,
  backendHasBinaries,
  getSdCliPath,
  getSdServerPath
} from '../sd'
import { downloadFile, fetchJson } from '../utils'
import { parseCliHelp } from '../../shared/cliHelp'
import { stopLoadedModel } from '../loadedModel'
import { getHelpForUi, invalidateCapabilitiesCache } from '../capabilitiesCache'

const execFileAsync = promisify(execFile)

function parseDeviceList(text: string): Array<{ name: string; description: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 2 && /^[A-Za-z][\w.-]{0,40}$/.test(parts[0].trim()))
    .map(([name, ...rest]) => ({ name: name.trim(), description: rest.join(' ').trim() }))
    .slice(0, 32)
}

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/leejet/stable-diffusion.cpp/releases'
const CACHE_TTL = 5 * 60 * 1000
/** Cap the tag list so the picker stays manageable. */
const RELEASES_FETCH_LIMIT = 25

interface GithubReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

interface GithubRelease {
  tag_name: string
  name: string
  published_at: string
  assets: GithubReleaseAsset[]
}

interface ProcessedRelease {
  tag: string
  name: string
  published: string
  assets: { name: string; size: number; url: string }[]
}

let releasesCache: ProcessedRelease[] | null = null
let releasesCacheTime = 0

function installedVersions(ctx: AppContext): string[] {
  if (!fs.existsSync(ctx.paths.releasesDir)) return []
  return fs
    .readdirSync(ctx.paths.releasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((version) => backendHasBinaries(path.join(ctx.paths.releasesDir, version)))
}

/** What we remember about an installed build (written at install time). */
interface BuildInfo {
  version: string
  asset: string
  installedAt: number
  sizeBytes: number
}

const BUILD_INFO_FILE = 'flaxeo-build.json'

function readBuildInfo(ctx: AppContext, version: string): BuildInfo {
  const dir = path.join(ctx.paths.releasesDir, version)
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, BUILD_INFO_FILE), 'utf8'))
    return {
      version,
      asset: typeof raw.asset === 'string' ? raw.asset : '',
      installedAt: Number(raw.installedAt) || fs.statSync(dir).mtimeMs,
      sizeBytes: Number(raw.sizeBytes) || 0
    }
  } catch {
    let installedAt = 0
    try {
      installedAt = fs.statSync(dir).mtimeMs
    } catch {
      /* folder vanished */
    }
    return { version, asset: '', installedAt, sizeBytes: 0 }
  }
}

/** Release tags are folder names: letters, digits, dots, dashes and underscores only. */
function isSafeVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[\w.-]{1,80}$/.test(value) && !value.includes('..')
}

function flattenNestedRelease(versionDir: string): void {
  const items = fs.readdirSync(versionDir)
  const hasBinaries = items.some(
    (item) => item.startsWith('sd-server') || item.startsWith('sd-cli')
  )
  if (hasBinaries || items.length !== 1) return

  const nestedDir = path.join(versionDir, items[0])
  if (!fs.statSync(nestedDir).isDirectory()) return
  for (const item of fs.readdirSync(nestedDir)) {
    fs.renameSync(path.join(nestedDir, item), path.join(versionDir, item))
  }
  fs.rmdirSync(nestedDir)
}

export function registerBackendRoutes(app: Express, ctx: AppContext): void {
  /** ggml devices for --backend / --params-backend (one "name<TAB>description" per line). */
  app.get('/api/backend/devices', async (_req, res) => {
    const cliPath = getSdCliPath(ctx)
    if (!fs.existsSync(cliPath)) return res.json({ devices: [], error: 'sd-cli not installed' })
    try {
      const { stdout } = await execFileAsync(cliPath, ['--list-devices'], {
        cwd: ctx.getActiveBackendPath(),
        timeout: 20000,
        windowsHide: true,
        maxBuffer: 512 * 1024
      })
      res.json({ devices: parseDeviceList(stdout || '') })
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string }
      const devices = parseDeviceList(err?.stdout || '')
      res.json({
        devices,
        error: devices.length
          ? undefined
          : 'This sd-cli build cannot list devices (--list-devices).'
      })
    }
  })

  app.get('/api/backend/capabilities', async (_req, res) => {
    try {
      const cwd = ctx.getActiveBackendPath()
      const cliPath = getSdCliPath(ctx)
      const serverPath = getSdServerPath(ctx)

      async function runHelp(binPath: string): Promise<string> {
        try {
          const { stdout, stderr } = await execFileAsync(binPath, ['--help'], {
            cwd,
            timeout: 15000,
            windowsHide: true,
            maxBuffer: 2 * 1024 * 1024
          })
          return `${stdout || ''}\n${stderr || ''}`
        } catch (error: unknown) {
          // Many tools print help to stderr and exit non-zero
          const err = error as { stdout?: string; stderr?: string; message?: string }
          return `${err?.stdout || ''}\n${err?.stderr || ''}\n${err?.message || ''}`
        }
      }

      if (!fs.existsSync(cliPath)) {
        return res.json({
          probed: true,
          flags: [],
          modes: [],
          error: 'sd-cli binary not found',
          server: fs.existsSync(serverPath)
            ? { present: true }
            : { present: false, error: 'sd-server binary not found' }
        })
      }

      const cliHelp = await runHelp(cliPath)
      if (!cliHelp.trim()) {
        return res.json({
          probed: true,
          flags: [],
          modes: [],
          error: 'Empty help output from sd-cli'
        })
      }

      const cliParsed = parseCliHelp(cliHelp)

      let serverBlock:
        | {
            present: boolean
            versionLine?: string
            flags?: string[]
            modes?: string[]
            error?: string
          }
        | undefined

      if (fs.existsSync(serverPath)) {
        const serverHelp = await runHelp(serverPath)
        if (serverHelp.trim()) {
          const serverParsed = parseCliHelp(serverHelp)
          serverBlock = {
            present: true,
            versionLine: serverParsed.versionLine,
            flags: serverParsed.flags,
            modes: serverParsed.modes
          }
        } else {
          serverBlock = { present: true, error: 'Empty help output from sd-server' }
        }
      } else {
        serverBlock = { present: false, error: 'sd-server binary not found' }
      }

      // Flat flags/modes remain CLI so soft-gates stay correct for generate-cli paths
      res.json({
        probed: true,
        versionLine: cliParsed.versionLine,
        flags: cliParsed.flags,
        modes: cliParsed.modes,
        cli: {
          versionLine: cliParsed.versionLine,
          flags: cliParsed.flags,
          modes: cliParsed.modes
        },
        server: serverBlock
      })
    } catch (error: unknown) {
      res.json({
        probed: true,
        flags: [],
        modes: [],
        error: error instanceof Error ? error.message : 'Failed to probe backend help'
      })
    }
  })

  app.get('/api/backend/releases', async (_req, res) => {
    try {
      if (releasesCache && Date.now() - releasesCacheTime < CACHE_TTL)
        return res.json(releasesCache)
      const releases = await fetchJson<GithubRelease[]>(GITHUB_RELEASES_URL)
      const processed: ProcessedRelease[] = releases
        .slice(0, RELEASES_FETCH_LIMIT)
        .map((release) => ({
          tag: release.tag_name,
          name: release.name,
          published: release.published_at,
          assets: release.assets
            .map((asset) => ({
              name: asset.name,
              size: asset.size,
              url: asset.browser_download_url
            }))
            .filter((asset) => asset.name.endsWith('.zip'))
        }))
      releasesCache = processed
      releasesCacheTime = Date.now()
      res.json(processed)
    } catch (error) {
      console.error('Releases fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch releases' })
    }
  })

  /** Every sd-cli option (installed binary, or the help captured in the repo when none is). */
  app.get('/api/backend/options', async (_req, res) => {
    try {
      const { help, live } = await getHelpForUi(getSdCliPath(ctx))
      res.json({ live, versionLine: help.versionLine, options: help.options })
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Options unavailable' })
    }
  })

  app.get('/api/backend/detect', (_req, res) => {
    const recommendation: {
      platform: NodeJS.Platform
      arch: string
      variant: string | null
      note: string | null
    } = { platform: process.platform, arch: process.arch, variant: null, note: null }
    if (process.platform === 'linux') {
      recommendation.variant = 'Linux-Ubuntu'
      recommendation.note =
        'The official Ubuntu build is CPU-only. For Vulkan/ROCm support on Linux, you need to compile from source and place the binaries in the backend/ folder.'
    } else if (process.platform === 'darwin') {
      recommendation.variant = 'Darwin-macOS'
      recommendation.note = 'macOS build uses Metal acceleration.'
    } else if (process.platform === 'win32') {
      let gpuType = 'vulkan'
      try {
        execSync('nvidia-smi', { stdio: 'ignore' })
        gpuType = 'cuda12'
        recommendation.note = 'NVIDIA GPU detected. Recommend CUDA 12 build.'
      } catch {
        try {
          const output = execSync(
            'powershell -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"',
            { encoding: 'utf8', stdio: 'pipe' }
          )
          if (output.includes('Radeon') || output.includes('AMD')) {
            // ROCm builds need AMD's HIP SDK (it sets HIP_PATH); Vulkan runs on any AMD card.
            if (process.env.HIP_PATH) {
              gpuType = 'rocm'
              recommendation.note =
                'AMD GPU with the ROCm (HIP SDK) runtime found: the ROCm build is fastest; Vulkan also works.'
            } else {
              gpuType = 'amd'
              recommendation.note =
                'AMD GPU detected: Vulkan runs on it. ROCm is faster only if your card supports it and AMD’s HIP SDK is installed.'
            }
          } else if (
            output.includes('NVIDIA') ||
            output.includes('GeForce') ||
            output.includes('Quadro')
          ) {
            gpuType = 'cuda12'
            recommendation.note = 'NVIDIA GPU detected. Recommend CUDA 12 build.'
          } else recommendation.note = 'Vulkan is recommended as universal fallback.'
        } catch {
          recommendation.note = 'Could not detect GPU. Vulkan is recommended as universal fallback.'
        }
      }
      recommendation.variant = `win-${gpuType}-x64`
    }
    res.json(recommendation)
  })

  app.get('/api/backend/config', (_req, res) => {
    const versions = installedVersions(ctx)
    const activeBackend = ctx.getActiveBackendPath()
    const outputImageFormat = ctx.state.backendConfig.outputImageFormat === 'avif' ? 'avif' : 'png'
    const customBinaryExists = backendHasBinaries(ctx.paths.customDir)
    // A stored version whose folder is gone (stale config, moved data dir) is
    // reported as empty rather than echoed back as a phantom install.
    const storedVersion = ctx.state.backendConfig.activeVersion
    const activeVersion =
      storedVersion === 'custom'
        ? customBinaryExists
          ? 'custom'
          : ''
        : versions.includes(storedVersion)
          ? storedVersion
          : ''
    res.json({
      activeVersion,
      customBinaryExists,
      installedVersions: versions,
      installed: versions.map((version) => readBuildInfo(ctx, version)),
      activeBackendPath: activeBackend,
      activeBackendValid: backendHasBinaries(activeBackend),
      activeBackendPlatformMismatch: backendDirPlatformMismatch(activeBackend),
      hostPlatform: process.platform,
      customDir: ctx.paths.customDir,
      releasesDir: ctx.paths.releasesDir,
      outputImageFormat
    })
  })

  app.post('/api/backend/config', (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>
      const next = { ...ctx.state.backendConfig, ...body }
      if (body.outputImageFormat !== undefined) {
        next.outputImageFormat = body.outputImageFormat === 'avif' ? 'avif' : 'png'
      }
      ctx.state.backendConfig = next
      ctx.saveBackendConfig()
      res.json({ success: true, config: ctx.state.backendConfig })
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * Install an engine build in the background. Replies at once with the download id;
   * progress, completion and errors are read from /api/downloads (cancel works there too).
   */
  app.post('/api/backend/download', (req, res) => {
    const { url, variant, version, runtimeUrl } = req.body || {}
    // Windows CUDA builds load the CUDA runtime DLLs from their own folder
    const runtime =
      typeof runtimeUrl === 'string' && /^https:\/\//.test(runtimeUrl) ? runtimeUrl : ''
    if (typeof url !== 'string' || !/^https:\/\//.test(url) || !isSafeVersion(version))
      return res.status(400).json({ error: 'A download link and a release tag are required' })
    const busy = Object.values(ctx.state.downloads).some(
      (task) => task.label.startsWith('Engine:') && task.status === 'downloading'
    )
    if (busy) return res.status(409).json({ error: 'An engine build is already installing' })

    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const versionDir = path.join(ctx.paths.releasesDir, version)
    const isTarGz = url.endsWith('.tar.gz') || url.endsWith('.tgz')
    const archivePath = path.join(ctx.paths.releasesDir, `${id}${isTarGz ? '.tar.gz' : '.zip'}`)
    ctx.state.downloads[id] = {
      id,
      label: `Engine: ${version}`,
      url,
      targetPath: archivePath,
      status: 'downloading',
      receivedBytes: 0,
      totalBytes: null,
      startedAt: Date.now(),
      updatedAt: Date.now()
    }
    res.status(202).json({ id })

    void (async () => {
      const task = (): (typeof ctx.state.downloads)[string] | undefined => ctx.state.downloads[id]
      try {
        console.log(`[Backend] Downloading ${version} (${variant}) from ${url}`)
        fs.mkdirSync(versionDir, { recursive: true })
        // One progress bar across the build and its runtime (offset by what is done)
        const fetchInto = async (from: string, offset: number): Promise<number> => {
          await downloadFile(from, archivePath, {
            registerCancel: (cancel) => {
              const t = task()
              if (t) t.cancel = cancel
            },
            onProgress: (receivedBytes, totalBytes) => {
              const t = task()
              if (!t) return
              t.receivedBytes = offset + receivedBytes
              if (totalBytes) t.totalBytes = Math.max(t.totalBytes || 0, offset + totalBytes)
              t.updatedAt = Date.now()
            }
          })
          const size = fs.statSync(archivePath).size
          if (isTarGz) await tar.x({ file: archivePath, cwd: versionDir, strip: 0 })
          else new AdmZip(archivePath).extractAllTo(versionDir, true)
          fs.rmSync(archivePath, { force: true })
          flattenNestedRelease(versionDir)
          return size
        }
        let sizeBytes = await fetchInto(url, 0)
        if (runtime) sizeBytes += await fetchInto(runtime, sizeBytes)

        if (process.platform !== 'win32') {
          for (const bin of ['sd', 'sd-server', 'sd-cli']) {
            const binPath = path.join(versionDir, bin)
            if (fs.existsSync(binPath)) fs.chmodSync(binPath, '755')
          }
        }
        if (!backendHasBinaries(versionDir)) {
          throw new Error('The download did not contain sd-cli and sd-server for this computer.')
        }
        fs.writeFileSync(
          path.join(versionDir, BUILD_INFO_FILE),
          JSON.stringify({
            version,
            asset: typeof variant === 'string' ? variant : '',
            installedAt: Date.now(),
            sizeBytes
          })
        )

        ctx.state.backendConfig.activeVersion = version
        ctx.state.backendConfig.installedVersions = Array.from(
          new Set([...(ctx.state.backendConfig.installedVersions || []), version])
        )
        ctx.saveBackendConfig()
        invalidateCapabilitiesCache()
        const t = task()
        if (t) {
          t.status = 'completed'
          t.updatedAt = Date.now()
        }
      } catch (error: unknown) {
        console.error('[Backend] Download/install error:', error)
        fs.rmSync(archivePath, { force: true })
        if (!backendHasBinaries(versionDir)) fs.rmSync(versionDir, { recursive: true, force: true })
        const message = error instanceof Error ? error.message : String(error)
        const t = task()
        if (t) {
          t.status = message === 'Download cancelled' ? 'cancelled' : 'failed'
          t.error = message
          t.updatedAt = Date.now()
        }
      }
    })()
  })

  /** Delete an installed build that is not in use. */
  app.post('/api/backend/remove', (req, res) => {
    const version = req.body?.version
    if (!isSafeVersion(version) || !installedVersions(ctx).includes(version))
      return res.status(400).json({ error: 'Unknown build' })
    if (ctx.state.backendConfig.activeVersion === version)
      return res.status(400).json({ error: 'Switch to another build before removing this one' })
    fs.rmSync(path.join(ctx.paths.releasesDir, version), { recursive: true, force: true })
    ctx.state.backendConfig.installedVersions = (
      ctx.state.backendConfig.installedVersions || []
    ).filter((v: string) => v !== version)
    ctx.saveBackendConfig()
    res.json({ success: true })
  })

  app.post('/api/backend/use-custom', (_req, res) => {
    ctx.state.backendConfig.activeVersion = 'custom'
    ctx.saveBackendConfig()
    invalidateCapabilitiesCache()
    res.json({ success: true, activeVersion: 'custom' })
  })

  app.post('/api/backend/set-active', (req, res) => {
    const version = req.body?.version
    if (version !== 'custom' && !isSafeVersion(version))
      return res.status(400).json({ error: 'Version required' })
    if (version !== 'custom' && !backendHasBinaries(path.join(ctx.paths.releasesDir, version)))
      return res.status(400).json({ error: `Version ${version} not found` })
    // A model kept loaded by the old build would keep serving runs; unload it.
    stopLoadedModel(ctx, 'switched sd.cpp build')
    ctx.state.backendConfig.activeVersion = version
    ctx.saveBackendConfig()
    invalidateCapabilitiesCache()
    res.json({ success: true, activeVersion: version })
  })
}
