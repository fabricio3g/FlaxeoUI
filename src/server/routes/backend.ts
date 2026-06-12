import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { backendHasBinaries } from '../sd'
import { downloadFile, fetchJson } from '../utils'

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/leejet/stable-diffusion.cpp/releases'
const CACHE_TTL = 5 * 60 * 1000

let releasesCache: any[] | null = null
let releasesCacheTime = 0

function installedVersions(ctx: AppContext): string[] {
  if (!fs.existsSync(ctx.paths.releasesDir)) return []
  return fs
    .readdirSync(ctx.paths.releasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((version) => backendHasBinaries(path.join(ctx.paths.releasesDir, version)))
}

function flattenNestedRelease(versionDir: string): void {
  const items = fs.readdirSync(versionDir)
  const hasBinaries = items.some((item) => item.startsWith('sd-server') || item.startsWith('sd-cli'))
  if (hasBinaries || items.length !== 1) return

  const nestedDir = path.join(versionDir, items[0])
  if (!fs.statSync(nestedDir).isDirectory()) return
  for (const item of fs.readdirSync(nestedDir)) {
    fs.renameSync(path.join(nestedDir, item), path.join(versionDir, item))
  }
  fs.rmdirSync(nestedDir)
}

export function registerBackendRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/backend/releases', async (_req, res) => {
    try {
      if (releasesCache && Date.now() - releasesCacheTime < CACHE_TTL) return res.json(releasesCache)
      const releases = await fetchJson<any[]>(GITHUB_RELEASES_URL)
      const processed = releases.slice(0, 10).map((release) => ({
        tag: release.tag_name,
        name: release.name,
        published: release.published_at,
        assets: release.assets
          .map((asset: any) => ({ name: asset.name, size: asset.size, url: asset.browser_download_url }))
          .filter((asset: any) => asset.name.endsWith('.zip'))
      }))
      releasesCache = processed
      releasesCacheTime = Date.now()
      res.json(processed)
    } catch (error) {
      console.error('Releases fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch releases' })
    }
  })

  app.get('/api/backend/detect', (_req, res) => {
    const recommendation: Record<string, any> = { platform: process.platform, arch: process.arch, variant: null, note: null }
    if (process.platform === 'linux') {
      recommendation.variant = 'Linux-Ubuntu'
      recommendation.note = 'The official Ubuntu build is CPU-only. For Vulkan/ROCm support on Linux, you need to compile from source and place the binaries in the backend/ folder.'
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
          const output = execSync('powershell -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { encoding: 'utf8', stdio: 'pipe' })
          if (output.includes('Radeon') || output.includes('AMD')) {
            gpuType = 'rocm'
            recommendation.note = 'AMD GPU detected. Recommend ROCM or Vulkan build.'
          } else if (output.includes('NVIDIA') || output.includes('GeForce') || output.includes('Quadro')) {
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
    res.json({
      activeVersion: ctx.state.backendConfig.activeVersion,
      customBinaryExists: backendHasBinaries(ctx.paths.customDir),
      installedVersions: versions,
      activeBackendPath: activeBackend,
      activeBackendValid: backendHasBinaries(activeBackend),
      customDir: ctx.paths.customDir,
      releasesDir: ctx.paths.releasesDir
    })
  })

  app.post('/api/backend/config', (req, res) => {
    try {
      ctx.state.backendConfig = { ...ctx.state.backendConfig, ...req.body }
      ctx.saveBackendConfig()
      res.json({ success: true, config: ctx.state.backendConfig })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  })

  app.post('/api/backend/download', async (req, res) => {
    const { url, variant, version } = req.body || {}
    if (!url || !version) return res.status(400).json({ error: 'Download URL and version required' })

    const versionDir = path.join(ctx.paths.releasesDir, version)
    const isTarGz = url.endsWith('.tar.gz') || url.endsWith('.tgz')
    const archivePath = path.join(ctx.paths.releasesDir, `download${isTarGz ? '.tar.gz' : '.zip'}`)
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    ctx.state.downloads[id] = {
      id,
      label: `Backend: ${variant || version}`,
      url,
      targetPath: archivePath,
      status: 'downloading',
      receivedBytes: 0,
      totalBytes: null,
      startedAt: Date.now(),
      updatedAt: Date.now()
    }

    try {
      console.log(`[Backend] Downloading ${version} (${variant}) from ${url}`)
      fs.mkdirSync(versionDir, { recursive: true })
      await downloadFile(url, archivePath, {
        registerCancel: (cancel) => {
          const task = ctx.state.downloads[id]
          if (task) task.cancel = cancel
        },
        onProgress: (receivedBytes, totalBytes) => {
          const task = ctx.state.downloads[id]
          if (!task) return
          task.receivedBytes = receivedBytes
          task.totalBytes = totalBytes
          task.updatedAt = Date.now()
        }
      })
      if (isTarGz) await tar.x({ file: archivePath, cwd: versionDir, strip: 0 })
      else new AdmZip(archivePath).extractAllTo(versionDir, true)
      if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath)
      flattenNestedRelease(versionDir)

      if (process.platform !== 'win32') {
        for (const bin of ['sd', 'sd-server', 'sd-cli']) {
          const binPath = path.join(versionDir, bin)
          if (fs.existsSync(binPath)) fs.chmodSync(binPath, '755')
        }
      }

      ctx.state.backendConfig.activeVersion = version
      ctx.state.backendConfig.installedVersions = Array.from(new Set([...(ctx.state.backendConfig.installedVersions || []), version]))
      ctx.saveBackendConfig()
      ctx.state.downloads[id].status = 'completed'
      ctx.state.downloads[id].updatedAt = Date.now()
      res.json({ success: true, id, version, path: versionDir })
    } catch (error: any) {
      console.error('[Backend] Download/install error:', error)
      if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath)
      const task = ctx.state.downloads[id]
      if (task) {
        task.status = error.message === 'Download cancelled' ? 'cancelled' : 'failed'
        task.error = error.message
        task.updatedAt = Date.now()
      }
      res.status(500).json({ error: error.message })
    }
  })

  app.post('/api/backend/use-custom', (_req, res) => {
    ctx.state.backendConfig.activeVersion = 'custom'
    ctx.saveBackendConfig()
    res.json({ success: true, activeVersion: 'custom' })
  })

  app.post('/api/backend/set-active', (req, res) => {
    const version = req.body?.version
    if (!version) return res.status(400).json({ error: 'Version required' })
    if (version !== 'custom' && !backendHasBinaries(path.join(ctx.paths.releasesDir, version))) return res.status(400).json({ error: `Version ${version} not found` })
    ctx.state.backendConfig.activeVersion = version
    ctx.saveBackendConfig()
    res.json({ success: true, activeVersion: version })
  })
}
