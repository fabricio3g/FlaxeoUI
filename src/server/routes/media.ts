import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { isPathInside, safeOutputPath } from '../utils'

function readPngParams(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const stat = fs.statSync(filePath)
    // Cap read size for large gallery files while still covering param chunks near the end.
    const maxRead = Math.min(stat.size, 4 * 1024 * 1024)
    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(maxRead)
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    fs.closeSync(fd)
    if (buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null

    let offset = 8
    let parametersText: string | null = null
    while (offset + 12 <= bytesRead) {
      const length = buffer.readUInt32BE(offset)
      const type = buffer.toString('utf8', offset + 4, offset + 8)
      const dataOffset = offset + 8
      if (dataOffset + length > bytesRead) break

      if (type === 'tEXt') {
        const text = decodeTextChunk(buffer, dataOffset, length)
        if (text?.keyword === 'parameters') parametersText = text.value
      } else if (type === 'iTXt') {
        const text = decodeItxtChunk(buffer, dataOffset, length)
        if (text?.keyword === 'parameters') parametersText = text.value
      } else if (type === 'IEND') {
        break
      }

      offset += 12 + length
    }
    return parametersText
  } catch (error) {
    console.error('Error reading PNG params:', error)
  }
  return null
}

function decodeTextChunk(
  buffer: Buffer,
  dataOffset: number,
  length: number
): { keyword: string; value: string } | null {
  let nullByteIndex = -1
  for (let i = 0; i < length; i++) {
    if (buffer[dataOffset + i] === 0) {
      nullByteIndex = i
      break
    }
  }
  if (nullByteIndex <= 0) return null
  const keyword = buffer.toString('utf8', dataOffset, dataOffset + nullByteIndex)
  const value = buffer.toString('utf8', dataOffset + nullByteIndex + 1, dataOffset + length)
  return { keyword, value }
}

function decodeItxtChunk(
  buffer: Buffer,
  dataOffset: number,
  length: number
): { keyword: string; value: string } | null {
  // iTXt: keyword\0 compression_flag compression_method language\0 translated\0 text
  let nullByteIndex = -1
  for (let i = 0; i < length; i++) {
    if (buffer[dataOffset + i] === 0) {
      nullByteIndex = i
      break
    }
  }
  if (nullByteIndex <= 0 || nullByteIndex + 2 >= length) return null
  const keyword = buffer.toString('utf8', dataOffset, dataOffset + nullByteIndex)
  const compressionFlag = buffer[dataOffset + nullByteIndex + 1]
  if (compressionFlag !== 0) return null // compressed iTXt not supported

  let cursor = dataOffset + nullByteIndex + 3 // skip keyword, flag, method
  // language tag
  while (cursor < dataOffset + length && buffer[cursor] !== 0) cursor++
  cursor++ // skip null
  // translated keyword
  while (cursor < dataOffset + length && buffer[cursor] !== 0) cursor++
  cursor++ // skip null
  if (cursor > dataOffset + length) return null
  const value = buffer.toString('utf8', cursor, dataOffset + length)
  return { keyword, value }
}

function parseParams(paramsText: string | null): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (!paramsText) return result

  const lines = paramsText.replace(/\r\n/g, '\n').split('\n')
  let prompt = lines[0] || ''
  let negativePrompt = ''
  let otherParams = ''

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('Negative prompt:')) {
      negativePrompt = line.replace('Negative prompt:', '').trim()
    } else if (/^Steps:\s*/i.test(line) || /,\s*Steps:\s*/i.test(line) || line.startsWith('Steps:')) {
      otherParams = line
    } else if (!negativePrompt && !otherParams) {
      prompt += '\n' + line
    } else if (otherParams && !line.includes(':')) {
      // continuation of param line is rare; ignore
    } else if (!otherParams && line.includes('Seed:') && line.includes('Size:')) {
      otherParams = line
    }
  }

  // Some tools put the entire settings line as the last line without "Steps:" only.
  if (!otherParams) {
    for (let i = lines.length - 1; i >= 1; i--) {
      if (lines[i].includes('Seed:') && (lines[i].includes('Steps:') || lines[i].includes('Size:'))) {
        otherParams = lines[i]
        break
      }
    }
  }

  result.prompt = prompt.trim()
  result.negativePrompt = negativePrompt.trim()
  result.negative_prompt = result.negativePrompt

  // Split on ", " but values may contain commas rarely; webui uses ", Key: value"
  const pairs = otherParams.split(/,\s*(?=[A-Za-z][A-Za-z0-9 +./()-]*:\s)/)
  for (const pair of pairs) {
    const colon = pair.indexOf(':')
    if (colon <= 0) continue
    const key = pair.slice(0, colon).trim()
    const value = pair.slice(colon + 1).trim()
    if (!value) continue

    if (key === 'Steps') result.steps = parseInt(value, 10)
    else if (key === 'CFG scale' || key === 'CFG Scale') {
      result.cfgScale = parseFloat(value)
      result.cfg_scale = result.cfgScale
    } else if (key === 'Seed') result.seed = parseInt(value, 10)
    else if (key === 'Size') {
      const [width, height] = value.split(/x/i)
      result.width = parseInt(width, 10)
      result.height = parseInt(height, 10)
    } else if (key === 'Sampler' || key === 'Sampling method') result.sampler = value
    else if (key === 'Scheduler') result.scheduler = value
    else if (key === 'Model' || key === 'Model hash') {
      if (key === 'Model' || !result.model) {
        result.diffusionModel = value
        result.model = value
      }
    } else if (key === 'Guidance' || key === 'Distilled CFG Scale') {
      result.guidance = parseFloat(value)
    } else if (key === 'Clip skip' || key === 'CLIP skip') {
      result.clipSkip = parseInt(value, 10)
      result.clip_skip = result.clipSkip
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
    } catch (error: unknown) {
      console.error('Gallery error:', error)
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
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
    } catch (error: unknown) {
      res.status(500).json({
        message: 'Delete failed',
        error: error instanceof Error ? error.message : String(error)
      })
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
