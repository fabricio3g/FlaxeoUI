import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { isPathInside, safeOutputPath } from '../utils'

function readPngParams(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(1024 * 1024)
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    fs.closeSync(fd)
    if (buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null

    let offset = 8
    while (offset < bytesRead) {
      const length = buffer.readUInt32BE(offset)
      const type = buffer.toString('utf8', offset + 4, offset + 8)
      const dataOffset = offset + 8
      if (type === 'tEXt') {
        let nullByteIndex = -1
        for (let i = 0; i < length; i++) {
          if (buffer[dataOffset + i] === 0) {
            nullByteIndex = i
            break
          }
        }
        if (nullByteIndex > 0) {
          const keyword = buffer.toString('utf8', dataOffset, dataOffset + nullByteIndex)
          const text = buffer.toString('utf8', dataOffset + nullByteIndex + 1, dataOffset + length)
          if (keyword === 'parameters') return text
        }
      }
      offset += 12 + length
    }
  } catch (error) {
    console.error('Error reading PNG params:', error)
  }
  return null
}

function parseParams(paramsText: string | null): Record<string, any> {
  const result: Record<string, any> = {}
  if (!paramsText) return result

  const lines = paramsText.split('\n')
  let prompt = lines[0] || ''
  let negativePrompt = ''
  let otherParams = ''

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('Negative prompt:')) negativePrompt = lines[i].replace('Negative prompt:', '').trim()
    else if (lines[i].startsWith('Steps:')) otherParams = lines[i]
    else if (!negativePrompt && !otherParams) prompt += '\n' + lines[i]
  }

  result.prompt = prompt.trim()
  result.negativePrompt = negativePrompt.trim()
  result.negative_prompt = result.negativePrompt

  for (const pair of otherParams.split(', ')) {
    const [key, value] = pair.split(': ')
    if (key === 'Steps') result.steps = parseInt(value, 10)
    if (key === 'CFG scale') {
      result.cfgScale = parseFloat(value)
      result.cfg_scale = result.cfgScale
    }
    if (key === 'Seed') result.seed = parseInt(value, 10)
    if (key === 'Size') {
      const [width, height] = value.split('x')
      result.width = parseInt(width, 10)
      result.height = parseInt(height, 10)
    }
    if (key === 'Sampler') result.sampler = value
    if (key === 'Scheduler') result.scheduler = value
    if (key === 'Model') {
      result.diffusionModel = value
      result.model = value
    }
  }

  return result
}

function listGallery(ctx: AppContext): string[] {
  if (!fs.existsSync(ctx.paths.outputDir)) return []
  return fs
    .readdirSync(ctx.paths.outputDir)
    .filter((file) => /\.(png|jpg|jpeg|webp|gif|mp4)$/i.test(file))
    .sort((a, b) => fs.statSync(path.join(ctx.paths.outputDir, b)).mtime.getTime() - fs.statSync(path.join(ctx.paths.outputDir, a)).mtime.getTime())
}

export function registerMediaRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/gallery', (_req, res) => {
    try {
      res.json(listGallery(ctx))
    } catch (error: any) {
      console.error('Gallery error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  app.post('/api/delete', (req, res) => {
    try {
      const filename = req.body?.filename
      if (!filename || typeof filename !== 'string') return res.status(400).json({ message: 'Filename required' })
      const filePath = safeOutputPath(ctx, filename)
      if (!filePath) return res.status(400).json({ message: 'Invalid filename' })
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found', filename })
      fs.unlinkSync(filePath)
      res.json({ message: 'Deleted', filename })
    } catch (error: any) {
      res.status(500).json({ message: 'Delete failed', error: error.message })
    }
  })

  app.get('/api/logs', (req, res) => {
    const since = parseInt(String(req.query.since || 0), 10)
    const rawLimit = req.query.limit
    const limit = rawLimit === undefined ? 0 : parseInt(String(rawLimit), 10)
    const logs = limit > 0
      ? ctx.state.serverLogs.slice(since, since + limit)
      : ctx.state.serverLogs.slice(since)
    res.json({ logs, total: ctx.state.serverLogs.length, hasMore: since + logs.length < ctx.state.serverLogs.length })
  })

  app.get('/api/logs/stream', (req, res) => {
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
    const since = parseInt(String(req.query.since || 0), 10)
    send('hello', {
      logs: ctx.state.serverLogs.slice(since),
      total: ctx.state.serverLogs.length
    })

    const onLog = (line: string): void => {
      send('log', { line, total: ctx.state.serverLogs.length })
    }
    const onClear = (): void => {
      send('clear', {})
    }
    ctx.state.logBus.on('log', onLog)
    ctx.state.logBus.on('clear', onClear)

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n')
    }, 15000)

    req.on('close', () => {
      clearInterval(keepAlive)
      ctx.state.logBus.removeListener('log', onLog)
      ctx.state.logBus.removeListener('clear', onClear)
    })
  })

  app.post('/api/logs/clear', (_req, res) => {
    ctx.state.serverLogs = []
    ctx.state.logBus.emit('clear')
    res.json({ success: true })
  })

  app.post('/api/image/params', (req, res) => {
    const relativePath = req.body?.path || req.body?.filename
    if (!relativePath) return res.status(400).json({ error: 'Path required' })
    const filePath = safeOutputPath(ctx, relativePath)
    if (!filePath) return res.status(403).json({ error: 'Access denied' })
    res.json(parseParams(readPngParams(filePath)))
  })

  app.get('/api/file', (req, res) => {
    const requested = String(req.query.path || '')
    if (!requested) return res.status(400).json({ error: 'Path required' })
    const resolved = path.resolve(requested)
    const allowedRoots = [ctx.paths.outputDir, ctx.paths.tempDir, ...Object.values(ctx.paths.modelDirs)]
    if (!allowedRoots.some((root) => isPathInside(root, resolved)))
      return res.status(403).json({ error: 'Access denied' })
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' })
    res.sendFile(resolved)
  })

  app.post('/api/open-folder', (req, res) => {
    const folder = req.body?.folder
    const folderPath = folder === 'models' ? ctx.paths.modelsDir : folder === 'output' ? ctx.paths.outputDir : null
    if (!folderPath) return res.status(400).json({ success: false, error: 'Invalid folder' })
    fs.mkdirSync(folderPath, { recursive: true })
    const absPath = path.resolve(folderPath)
    const command = process.platform === 'darwin' ? `open "${absPath}"` : process.platform === 'win32' ? `start "" "${absPath}"` : `xdg-open "${absPath}"`
    exec(command, (error) => {
      if (error) res.json({ success: false, error: error.message })
      else res.json({ success: true })
    })
  })
}
