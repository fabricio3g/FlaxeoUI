import fs from 'fs'
import path from 'path'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { appendLog, errorMessage, modelDirectory } from '../utils'
import { MODEL_DIRECTORY_KEYS, resolveModelDirectoryKey } from '../../shared/storage'
import { getSdCliPath } from '../sd'
import { loadedModelStatus, stopLoadedModel } from '../loadedModel'
import { downloadFile, listFiles } from '../utils'
import { getModelsPayload, invalidateModelsCache } from '../modelsCache'

const MODEL_DOWNLOAD_DIRS = new Set<string>(MODEL_DIRECTORY_KEYS)

function createDownloadTask(
  ctx: AppContext,
  label: string,
  url: string,
  targetPath: string
): string {
  const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  ctx.state.downloads[id] = {
    id,
    label,
    url,
    targetPath,
    status: 'downloading',
    receivedBytes: 0,
    totalBytes: null,
    startedAt: Date.now(),
    updatedAt: Date.now()
  }
  return id
}

async function trackedDownload(
  ctx: AppContext,
  id: string,
  url: string,
  targetPath: string
): Promise<string> {
  const token = ctx.state.backendConfig.huggingFaceToken
  const civitai = ctx.state.backendConfig.civitaiToken
  return downloadFile(url, targetPath, {
    huggingFaceToken: typeof token === 'string' && token ? token : undefined,
    civitaiToken: typeof civitai === 'string' && civitai ? civitai : undefined,
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
}

function publicDownloadTasks(ctx: AppContext) {
  return Object.values(ctx.state.downloads)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((task) => {
      const publicTask = { ...task }
      delete publicTask.cancel
      return publicTask
    })
}

function filenameFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0]
  const name = decodeURIComponent(path.basename(cleanUrl))
  return name || `model_${Date.now()}`
}

/** Status poll should not ship multi-MB log arrays every 2s. */
const STATUS_LOG_TAIL = 150

export function registerCoreRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/models', (req, res) => {
    const force =
      req.query.refresh === '1' || req.query.refresh === 'true' || req.query.force === '1'
    res.json(getModelsPayload(ctx, force))
  })

  /** Installed files with size and date, per category (Models page). */
  app.get('/api/models/files', (_req, res) => {
    const remote = Boolean(res.locals.lanSession)
    const files: Array<{
      category: string
      name: string
      size: number
      mtime: number
      path: string
    }> = []
    for (const category of MODEL_DIRECTORY_KEYS) {
      const dir = modelDirectory(ctx, category)
      for (const name of listFiles(dir)) {
        try {
          const full = path.join(dir, name)
          const stat = fs.statSync(full)
          files.push({
            category,
            name,
            size: stat.size,
            mtime: stat.mtimeMs,
            path: remote ? '' : full
          })
        } catch {
          /* vanished while listing */
        }
      }
    }
    res.json({ files })
  })

  /** Desktop only: whether a Hugging Face token is set (the token is never returned). */
  app.get('/api/models/hf-token', (_req, res) => {
    if (res.locals.lanSession) return res.status(403).json({ error: 'Desktop only' })
    const token = ctx.state.backendConfig.huggingFaceToken
    res.json({ configured: typeof token === 'string' && token.length > 0 })
  })

  app.post('/api/models/hf-token', (req, res) => {
    if (res.locals.lanSession) return res.status(403).json({ error: 'Desktop only' })
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
    if (token && !/^hf_[A-Za-z0-9]{20,}$/.test(token))
      return res.status(400).json({ error: 'That does not look like a Hugging Face token (hf_…).' })
    ctx.state.backendConfig.huggingFaceToken = token || undefined
    ctx.saveBackendConfig()
    res.json({ configured: Boolean(token) })
  })

  /**
   * Queue a model download and return immediately.
   * Large weights (e.g. AnimateDiff ~800MB) must not hold the HTTP request open —
   * progress is tracked via GET /api/downloads.
   */
  app.post('/api/models/download', async (req, res) => {
    const { url, category, filename, label } = req.body || {}
    if (typeof url !== 'string' || !url.startsWith('https://'))
      return res.status(400).json({ error: 'HTTPS model URL required' })
    // Aliases (clipG → clip) resolve here so hub packs and the server agree
    const categoryKey = typeof category === 'string' ? resolveModelDirectoryKey(category) : null
    if (!categoryKey)
      return res.status(400).json({
        error: `Invalid model category: ${category}. Allowed: ${[...MODEL_DOWNLOAD_DIRS].join(', ')}`
      })

    const safeFilename = path.basename(
      typeof filename === 'string' && filename.trim() ? filename : filenameFromUrl(url)
    )
    const targetDir = modelDirectory(ctx, categoryKey)
    const targetPath = path.join(targetDir, safeFilename)

    try {
      fs.mkdirSync(targetDir, { recursive: true })
    } catch (error: unknown) {
      return res.status(500).json({
        error: `Cannot create model folder ${category}: ${errorMessage(error)}`
      })
    }

    // Prefer HF resolve?download=true for more reliable LFS/CDN redirects
    let downloadUrl = url
    try {
      const parsed = new URL(url)
      if (
        parsed.hostname.endsWith('huggingface.co') &&
        parsed.pathname.includes('/resolve/') &&
        !parsed.searchParams.has('download')
      ) {
        parsed.searchParams.set('download', 'true')
        downloadUrl = parsed.toString()
      }
    } catch {
      /* keep original url */
    }

    const taskLabel =
      typeof label === 'string' && label.trim()
        ? `Model: ${label.trim()}`
        : `Model: ${safeFilename}`
    const id = createDownloadTask(ctx, taskLabel, downloadUrl, targetPath)

    // Respond before the multi-hundred-MB transfer finishes
    res.status(202).json({
      success: true,
      queued: true,
      id,
      category,
      filename: safeFilename,
      path: targetPath
    })

    void trackedDownload(ctx, id, downloadUrl, targetPath)
      .then(() => {
        const task = ctx.state.downloads[id]
        if (!task || task.status === 'cancelled') return
        task.status = 'completed'
        task.updatedAt = Date.now()
        invalidateModelsCache()
        appendLog(ctx, `[Download] completed ${safeFilename} → ${targetPath}\n`)
      })
      .catch((error: unknown) => {
        try {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
        } catch {
          /* ignore */
        }
        const task = ctx.state.downloads[id]
        const message = errorMessage(error)
        if (task && task.status === 'downloading') {
          task.status = message === 'Download cancelled' ? 'cancelled' : 'failed'
          task.error = message
          task.updatedAt = Date.now()
        }
        appendLog(ctx, `[Download] failed ${safeFilename}: ${message}\n`)
      })
  })

  app.get('/api/downloads', (_req, res) => {
    res.json({ downloads: publicDownloadTasks(ctx) })
  })

  app.post('/api/downloads/:id/cancel', (req, res) => {
    const task = ctx.state.downloads[req.params.id]
    if (!task) return res.status(404).json({ error: 'Download not found' })
    if (task.status !== 'downloading') return res.json({ success: true, task })
    task.cancel?.()
    task.status = 'cancelled'
    task.updatedAt = Date.now()
    if (fs.existsSync(task.targetPath)) fs.unlinkSync(task.targetPath)
    res.json({ success: true })
  })

  app.post('/api/downloads/clear-completed', (_req, res) => {
    for (const [id, task] of Object.entries(ctx.state.downloads)) {
      if (task.status !== 'downloading') delete ctx.state.downloads[id]
    }
    res.json({ success: true })
  })

  /** "Keep the model loaded" (Settings → Engine). Desktop only; sd-server loads on the next run. */
  app.post('/api/loaded-model', (req, res) => {
    if (res.locals.lanSession) return res.status(403).json({ error: 'Desktop only' })
    const enabled = req.body?.enabled === true
    ctx.state.backendConfig.keepModelLoaded = enabled
    ctx.saveBackendConfig()
    if (!enabled) stopLoadedModel(ctx, 'turned off')
    res.json(loadedModelStatus(ctx))
  })

  /** Free the memory now; the next run loads the model again. */
  app.post('/api/stop', (_req, res) => {
    stopLoadedModel(ctx, 'unloaded from Settings')
    res.json(loadedModelStatus(ctx))
  })

  app.get('/api/status', (_req, res) => {
    const all = ctx.state.serverLogs
    res.json({
      ...loadedModelStatus(ctx),
      logs: all.slice(-STATUS_LOG_TAIL),
      logTotal: all.length,
      logTail: STATUS_LOG_TAIL
    })
  })

  app.get('/api/remote/status', (_req, res) => {
    const loaded = loadedModelStatus(ctx)
    res.json({
      running: loaded.running,
      loadedModel: loaded.enabled ? { status: loaded.status, model: loaded.model } : null,
      activeVersion: ctx.state.backendConfig.activeVersion,
      activeBackendValid: fs.existsSync(getSdCliPath(ctx))
    })
  })

  app.get('/api/generation/progress', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders()

    const send = (evt: string, data: unknown): void => {
      res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    send('hello', { ok: true, progress: ctx.state.progress })

    const onProgress = (p: unknown): void => {
      send('progress', p)
    }
    const onStart = (s: unknown): void => {
      send('start', s)
    }
    const onEnd = (): void => {
      send('end', {})
    }

    ctx.state.progressBus.on('progress', onProgress)
    ctx.state.progressBus.on('start', onStart)
    ctx.state.progressBus.on('end', onEnd)

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n')
    }, 15000)

    req.on('close', () => {
      clearInterval(keepAlive)
      ctx.state.progressBus.removeListener('progress', onProgress)
      ctx.state.progressBus.removeListener('start', onStart)
      ctx.state.progressBus.removeListener('end', onEnd)
    })
  })
}
