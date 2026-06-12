import fs from 'fs'
import path from 'path'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { appendLog, listFiles, spawnLoggedProcess } from '../utils'
import { addHardwareArgs, addModelArgs, addOptionalArgs, addPromptModelExtras, getSdServerPath } from '../sd'
import { downloadFile } from '../utils'

const MODEL_DOWNLOAD_DIRS = new Set([
  'diffusion',
  'uncond_diffusion',
  'vae',
  'audio_vae',
  'llm',
  'llm_vision',
  't5xxl',
  'embeddings_connectors',
  'clip',
  'clip_vision',
  'loras',
  'controlnet',
  'photomaker',
  'upscale',
  'hires_upscalers',
  'taesd',
  'embeddings'
])

function createDownloadTask(ctx: AppContext, label: string, url: string, targetPath: string): string {
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

async function trackedDownload(ctx: AppContext, id: string, url: string, targetPath: string): Promise<string> {
  return downloadFile(url, targetPath, {
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
    .map(({ cancel: _cancel, ...task }) => task)
}

function filenameFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0]
  const name = decodeURIComponent(path.basename(cleanUrl))
  return name || `model_${Date.now()}`
}

export function registerCoreRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/models', (_req, res) => {
    const modelDir = (subdir: string) => path.join(ctx.paths.modelsDir, subdir)
    res.json({
      diffusion: listFiles(modelDir('diffusion')),
      uncondDiffusion: listFiles(modelDir('uncond_diffusion')),
      loras: listFiles(modelDir('loras')),
      vae: listFiles(modelDir('vae')),
      audioVae: listFiles(modelDir('audio_vae')),
      llm: listFiles(modelDir('llm')),
      llmVision: listFiles(modelDir('llm_vision')),
      t5xxl: listFiles(modelDir('t5xxl')),
      embeddingsConnectors: listFiles(modelDir('embeddings_connectors')),
      clip: listFiles(modelDir('clip')),
      clipG: listFiles(modelDir('clip')),
      clipVision: listFiles(modelDir('clip_vision')),
      controlnet: listFiles(modelDir('controlnet')),
      photomaker: listFiles(modelDir('photomaker')),
      upscale: listFiles(modelDir('upscale')),
      hiresUpscalers: listFiles(modelDir('hires_upscalers')),
      taesd: listFiles(modelDir('taesd')),
      embeddings: listFiles(modelDir('embeddings'))
    })
  })

  app.post('/api/models/download', async (req, res) => {
    const { url, category, filename } = req.body || {}
    if (typeof url !== 'string' || !url.startsWith('https://')) return res.status(400).json({ error: 'HTTPS model URL required' })
    if (typeof category !== 'string' || !MODEL_DOWNLOAD_DIRS.has(category)) return res.status(400).json({ error: 'Invalid model category' })

    const safeFilename = path.basename(typeof filename === 'string' && filename.trim() ? filename : filenameFromUrl(url))
    const targetDir = path.join(ctx.paths.modelsDir, category)
    const targetPath = path.join(targetDir, safeFilename)
    const id = createDownloadTask(ctx, `Model: ${safeFilename}`, url, targetPath)

    try {
      fs.mkdirSync(targetDir, { recursive: true })
      await trackedDownload(ctx, id, url, targetPath)
      ctx.state.downloads[id].status = 'completed'
      ctx.state.downloads[id].updatedAt = Date.now()
      res.json({ success: true, id, category, filename: safeFilename, path: targetPath })
    } catch (error: any) {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
      const task = ctx.state.downloads[id]
      if (task) {
        task.status = error.message === 'Download cancelled' ? 'cancelled' : 'failed'
        task.error = error.message
        task.updatedAt = Date.now()
      }
      res.status(500).json({ error: error.message })
    }
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

  app.post('/api/start', (req, res) => {
    if (ctx.state.sdProcess) return res.status(400).json({ message: 'Server already running' })

    const body = req.body || {}
    const args = ['--listen-port', String(body.port || 1234), '-v']
    addModelArgs(ctx, args, body)

    if (body.loraDir) args.push('--lora-model-dir', path.join(ctx.paths.modelsDir, 'loras'))
    args.push('--lora-apply-mode', body.loraApplyMode || 'auto')
    addOptionalArgs(args, body)
    addHardwareArgs(args, body)
    addPromptModelExtras(ctx, args, body)
    if (body.vaeTileSize && Number(body.vaeTileSize) > 0) args.push('--vae-tile-size', String(body.vaeTileSize))
    if (body.controlNet) args.push('--control-net', path.join(ctx.paths.modelsDir, 'controlnet', body.controlNet))
    if (body.photoMaker) args.push('--photo-maker', path.join(ctx.paths.modelsDir, 'photomaker', body.photoMaker))
    if (body.defaultSteps) args.push('--steps', String(body.defaultSteps))
    if (body.defaultCfg) args.push('--cfg-scale', String(body.defaultCfg))

    try {
      const activeBackend = ctx.getActiveBackendPath()
      ctx.state.serverLogs = []
      ctx.state.sdProcess = spawnLoggedProcess(ctx, getSdServerPath(ctx), args, 'SD-SERVER', { cwd: activeBackend })
      ctx.state.sdProcess.on('close', (code) => {
        console.log(`SD Exit: ${code}`)
        ctx.state.sdProcess = null
        appendLog(ctx, `EXIT: ${code}`)
      })
      res.json({ message: 'Server started', args })
    } catch (error: any) {
      res.status(500).json({ message: 'Failed to start', error: error.message })
    }
  })

  app.post('/api/stop', (_req, res) => {
    if (!ctx.state.sdProcess) return res.status(400).json({ message: 'Not running' })
    ctx.state.sdProcess.kill()
    ctx.state.sdProcess = null
    res.json({ message: 'Stopped' })
  })

  app.get('/api/status', (_req, res) => {
    res.json({ running: !!ctx.state.sdProcess, logs: ctx.state.serverLogs })
  })

  app.post('/api/generate', async (req, res) => {
    if (!ctx.state.sdProcess) return res.status(400).json({ message: 'Server not running' })

    const body = req.body || {}
    const stepsVal = parseInt(body.steps, 10) || 20
    const payload: Record<string, any> = {
      prompt: body.prompt,
      negative_prompt: body.negative_prompt || '',
      n: 1,
      size: `${Math.round((body.width || 512) / 64) * 64}x${Math.round((body.height || 512) / 64) * 64}`,
      response_format: 'b64_json',
      steps: stepsVal,
      sample_steps: stepsVal,
      num_inference_steps: stepsVal,
      cfg_scale: parseFloat(body.cfg_scale) || 7.0,
      seed: parseInt(body.seed, 10) || -1
    }
    if (body.guidance) payload.guidance = parseFloat(body.guidance)
    if (body.clip_skip) payload.clip_skip = parseInt(body.clip_skip, 10)

    try {
      const generatedFiles: string[] = []
      const batchSize = parseInt(body.batch_size, 10) || 1
      for (let i = 0; i < batchSize; i++) {
        if (payload.seed !== -1 && i > 0) payload.seed += 1
        const response = await fetch('http://localhost:1234/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error(await response.text())
        const data = await response.json()
        if (!data.data?.[0]) throw new Error('No data received')
        const filename = `gen_${Date.now()}_${i}.png`
        fs.writeFileSync(path.join(ctx.paths.outputDir, filename), Buffer.from(data.data[0].b64_json, 'base64'))
        generatedFiles.push(filename)
      }
      res.json({ message: 'Complete', filenames: generatedFiles })
    } catch (error: any) {
      console.error('Gen Error:', error)
      res.status(500).json({ message: 'Generation failed', error: error.message })
    }
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

    const onProgress = (p: unknown): void => { send('progress', p) }
    const onStart = (s: unknown): void => { send('start', s) }
    const onEnd = (): void => { send('end', {}) }

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
