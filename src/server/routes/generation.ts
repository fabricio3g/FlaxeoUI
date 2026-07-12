import fs from 'fs'
import path from 'path'
import multer from 'multer'
import type { Express, Request, Response } from 'express'
import type { AppContext, JsonObject } from '../types'
import {
  asBool,
  errorMessage,
  firstString,
  modelDirectory,
  modelPath,
  parseStepLine,
  removeDir,
  removeFile,
  spawnLoggedProcess,
  waitForProcess
} from '../utils'
import { formatHumanizedError, humanizeCliError } from '../../shared/cliErrors'
import {
  advancePhase,
  detectPhaseFromLine,
  phaseLabel,
  type GenerationPhase
} from '../../shared/generationPhases'
import type { ParsedStep } from '../utils'
import { invalidateModelsCache } from '../modelsCache'
import type { ProgressPhase } from '../types'
import {
  addGenerationArgs,
  addHardwareArgs,
  addModelArgs,
  addOptionalArgs,
  addPromptModelExtras,
  assertLoraFilesPresent,
  ensureBinaryExecutable,
  getSdCliPath,
  pushArg,
  pushModelArg
} from '../sd'

function pushNumericArgIfPresent(args: string[], flag: string, value: unknown): void {
  if (value === '' || value == null) return
  const n = Number(value)
  if (!Number.isFinite(n)) return
  args.push(flag, String(value))
}

interface UploadRequest extends Request {
  pmImagesDir?: string
  kontextRefDir?: string
  files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>
  file?: Express.Multer.File
}

function uploadMiddleware(ctx: AppContext) {
  return multer({
    storage: multer.diskStorage({
      destination: (req: UploadRequest, file, cb) => {
        if (file.fieldname === 'kontextRefImage') {
          if (!req.kontextRefDir) {
            req.kontextRefDir = path.join(ctx.paths.tempDir, `kontext_${Date.now()}`)
            fs.mkdirSync(req.kontextRefDir, { recursive: true })
          }
          cb(null, req.kontextRefDir)
          return
        }

        if (file.fieldname === 'controlNetImage' || file.fieldname === 'initImage') {
          cb(null, ctx.paths.tempDir)
          return
        }

        if (!req.pmImagesDir) {
          req.pmImagesDir = path.join(ctx.paths.tempDir, `pm_${Date.now()}`)
          fs.mkdirSync(req.pmImagesDir, { recursive: true })
        }
        cb(null, req.pmImagesDir)
      },
      filename: (_req, file, cb) =>
        cb(null, `${Date.now()}_${file.originalname || file.fieldname}.png`)
    })
  }).fields([
    { name: 'pmImages', maxCount: 4 },
    { name: 'kontextRefImage', maxCount: 8 },
    { name: 'controlNetImage', maxCount: 1 },
    { name: 'initImage', maxCount: 1 }
  ])
}

function sendCliBusy(res: Response): void {
  const human = humanizeCliError('GENERATION_BUSY: Another generation is already running')
  res.status(409).json({
    message: formatHumanizedError(human),
    error: 'GENERATION_BUSY',
    title: human.title,
    detail: human.detail,
    hint: human.hint
  })
}

/** Returns false if a response was already sent (busy). */
function ensureCliIdle(ctx: AppContext, res: Response): boolean {
  if (ctx.state.cliProcess) {
    sendCliBusy(res)
    return false
  }
  return true
}

async function runCli(
  ctx: AppContext,
  args: string[],
  label: string
): Promise<{ cancelled: boolean }> {
  if (ctx.state.cliProcess) {
    throw new Error('GENERATION_BUSY: Another generation is already running')
  }

  const activeBackend = ctx.getActiveBackendPath()
  const startedAt = Date.now()
  const logStart = ctx.state.serverLogs.length
  let phase: GenerationPhase = 'starting'
  ctx.state.progressBus.emit('start', {
    label,
    startedAt,
    phase,
    phaseLabel: phaseLabel(phase)
  })
  ctx.state.progress = {
    current: 0,
    total: 0,
    itPerSec: 0,
    label,
    startedAt,
    updatedAt: startedAt,
    phase: phase as ProgressPhase,
    phaseLabel: phaseLabel(phase)
  }

  const cliPath = getSdCliPath(ctx)
  ensureBinaryExecutable(cliPath)
  ctx.state.cliProcess = spawnLoggedProcess(ctx, cliPath, args, label, {
    cwd: activeBackend
  })

  const onChunk = (data: Buffer): void => {
    const text = data.toString()
    const lines = text.split('\n')
    for (const line of lines) {
      const nextPhase = advancePhase(phase, detectPhaseFromLine(line))
      if (nextPhase !== phase) {
        phase = nextPhase
        emitPhase(ctx, phase, label, startedAt)
      }
      const parsed = parseStepLine(line)
      if (parsed) {
        // Steps imply sampling
        if (phase !== 'sampling' && phase !== 'decoding' && phase !== 'saving') {
          phase = 'sampling'
        }
        updateProgress(ctx, parsed, label, startedAt, phase)
      }
    }
  }
  ctx.state.cliProcess.stdout?.on('data', onChunk)
  ctx.state.cliProcess.stderr?.on('data', onChunk)

  try {
    return await waitForProcess(ctx.state.cliProcess, label)
  } catch (error: unknown) {
    // Attach recent process output so humanizeCliError can detect OOM / missing files
    const tail = ctx.state.serverLogs
      .slice(logStart)
      .join('')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-24)
      .join('\n')
    const base = errorMessage(error) || 'CLI failed'
    throw new Error(tail ? `${base}\n${tail}` : base)
  } finally {
    ctx.state.cliProcess = null
    ctx.state.progress = null
    ctx.state.progressBus.emit('end', {})
  }
}

function emitPhase(
  ctx: AppContext,
  phase: GenerationPhase,
  label: string,
  startedAt: number
): void {
  const prev = ctx.state.progress
  const p = {
    current: prev?.current ?? 0,
    total: prev?.total ?? 0,
    itPerSec: prev?.itPerSec ?? 0,
    label,
    startedAt,
    updatedAt: Date.now(),
    phase: phase as ProgressPhase,
    phaseLabel: phaseLabel(phase)
  }
  ctx.state.progress = p
  ctx.state.progressBus.emit('progress', p)
}

function updateProgress(
  ctx: AppContext,
  parsed: ParsedStep,
  label: string,
  startedAt: number,
  phase: GenerationPhase = 'sampling'
): void {
  const p = {
    current: parsed.current,
    total: parsed.total,
    itPerSec: parsed.itPerSec,
    label,
    startedAt,
    updatedAt: Date.now(),
    phase: phase as ProgressPhase,
    phaseLabel: phaseLabel(phase)
  }
  ctx.state.progress = p
  ctx.state.progressBus.emit('progress', p)
}

function watchPreviewFile(ctx: AppContext, previewPath: string): () => void {
  let lastSize = 0
  let lastMtimeMs = 0
  const interval = setInterval(() => {
    try {
      if (!fs.existsSync(previewPath)) return
      const stat = fs.statSync(previewPath)
      const mtimeMs = stat.mtimeMs
      // Skip full read when file has not changed (size + mtime gate)
      if (stat.size === 0 || (stat.size === lastSize && mtimeMs === lastMtimeMs)) return
      lastSize = stat.size
      lastMtimeMs = mtimeMs
      const buffer = fs.readFileSync(previewPath)
      if (buffer.length > 0) {
        ctx.state.previewImageBuffer = buffer
        ctx.state.previewEtag = `"${stat.size}-${Math.floor(mtimeMs)}"`
      }
    } catch {
      // File locked by writer, skip this tick
    }
  }, 400)
  return () => {
    clearInterval(interval)
    ctx.state.previewImageBuffer = null
    ctx.state.previewTempFile = null
    ctx.state.previewEtag = null
  }
}

function fileFromUpload(req: UploadRequest, field: string): string | null {
  if (!req.files || Array.isArray(req.files)) return null
  const files = req.files?.[field]
  return files?.[0]?.path || null
}

function filesFromUpload(req: UploadRequest, field: string): string[] {
  if (!req.files || Array.isArray(req.files)) return []
  const files = req.files?.[field]
  if (!files?.length) return []
  return files.map((file) => file.path).filter(Boolean)
}

function resolveOutputFile(ctx: AppContext, filePath?: string): string | null {
  if (!filePath) return null
  return fs.existsSync(filePath) ? filePath : path.join(ctx.paths.outputDir, filePath)
}

function removeTemporaryFiles(
  dirs: Array<string | null> = [],
  files: Array<string | null | undefined> = []
): void {
  dirs.forEach(removeDir)
  files.forEach((file) => removeFile(file || undefined))
}

/**
 * Collect batch outputs for modern sd-cli (master-769+).
 * With `-b N` and `-o dir/name_%03d.png`, files are name_000.png, name_001.png, …
 * Without %d, a single file at outputPath (plus optional legacy _1,_2 siblings).
 */
function collectOutputFilenames(outputPath: string, batchCount: number): string[] {
  const dir = path.dirname(outputPath)
  const base = path.basename(outputPath)

  if (base.includes('%')) {
    if (!fs.existsSync(dir)) return []
    const patternSource = base
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%0(\d+)d/g, '\\d{$1}')
      .replace(/%d/g, '\\d+')
    const re = new RegExp(`^${patternSource}$`)
    const found: { idx: number; name: string }[] = []

    for (const name of fs.readdirSync(dir)) {
      if (!re.test(name)) continue
      const full = path.join(dir, name)
      try {
        if (!fs.statSync(full).isFile()) continue
      } catch {
        continue
      }
      const nums = name.match(/\d+/g)
      const idx = nums ? parseInt(nums[nums.length - 1], 10) : 0
      found.push({ idx: Number.isFinite(idx) ? idx : 0, name })
    }
    found.sort((a, b) => a.idx - b.idx)
    return found.map((f) => f.name)
  }

  const names: string[] = []
  if (fs.existsSync(outputPath)) names.push(base)
  const ext = path.extname(base)
  const stem = path.basename(base, ext)
  for (let i = 1; i < Math.max(batchCount, 1); i++) {
    const sibling = `${stem}_${i}${ext}`
    if (fs.existsSync(path.join(dir, sibling))) names.push(sibling)
  }
  return names
}

function sendCliResult(
  res: Response,
  result: { cancelled: boolean },
  outputPath: string,
  filename: string,
  failedMessage: string,
  batchCount = 1
): void {
  if (result.cancelled) {
    res.json({ message: 'Cancelled' })
    return
  }

  const filenames = collectOutputFilenames(outputPath, batchCount)
  if (filenames.length > 0) {
    res.json({
      message: 'Complete',
      filenames,
      filename: filenames[0]
    })
    return
  }

  if (fs.existsSync(outputPath)) {
    res.json({ message: 'Complete', filenames: [filename], filename })
    return
  }

  const human = humanizeCliError(failedMessage)
  res.status(500).json({
    message: formatHumanizedError(human),
    error: failedMessage,
    title: human.title,
    detail: human.detail,
    hint: human.hint
  })
}

function sendCliFailure(res: Response, error: unknown, fallback = 'CLI operation failed'): void {
  const raw = errorMessage(error) || fallback
  const human = humanizeCliError(raw)
  res.status(500).json({
    message: formatHumanizedError(human),
    error: raw,
    title: human.title,
    detail: human.detail,
    hint: human.hint
  })
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function copyPhotoMakerGallery(
  ctx: AppContext,
  body: JsonObject,
  req: UploadRequest
): string | null {
  let pmImagesDir = req.pmImagesDir || null
  const localImages = parseJsonArray(body.photoMakerImages)
  const galleryImages = parseJsonArray(body.pmGalleryImages)
  const allImages = [
    ...localImages,
    ...galleryImages.map((file) => path.join(ctx.paths.outputDir, file))
  ]

  for (const imgPath of allImages) {
    if (!fs.existsSync(imgPath)) continue
    if (!pmImagesDir) {
      pmImagesDir = path.join(ctx.paths.tempDir, `pm_${Date.now()}`)
      fs.mkdirSync(pmImagesDir, { recursive: true })
    }
    fs.copyFileSync(imgPath, path.join(pmImagesDir, path.basename(imgPath)))
  }
  return pmImagesDir
}

function buildImageArgs(
  ctx: AppContext,
  body: JsonObject,
  req: UploadRequest,
  outputPath: string
): { args: string[]; cleanupDirs: Array<string | null>; cleanupFiles: string[] } {
  const args: string[] = []
  const prompt = String(body.prompt || '')
  addModelArgs(ctx, args, body)
  addGenerationArgs(args, body, outputPath, { width: 1024, height: 1024, cfg: 7, multiple: 64 })
  addOptionalArgs(args, body)

  const batchCount = parseInt(String(body.batchCount || body.batch_count || 1), 10)
  if (batchCount > 1) args.push('-b', String(batchCount))
  addHardwareArgs(args, body, prompt)
  assertLoraFilesPresent(ctx, body, prompt)
  addPromptModelExtras(ctx, args, body, prompt)

  // Multi-ref images for Kontext / Qwen Image Edit (`-r` can be repeated)
  const refUploads = filesFromUpload(req, 'kontextRefImage')
  const refFromBody = [
    ...parseJsonArray(body.kontextRefPaths),
    ...parseJsonArray(body.refImages),
    firstString(body.kontextRefPath, body.kontextRefGallery)
  ].filter(Boolean) as string[]

  const allRefPaths = [...refUploads, ...refFromBody]
  for (const refPath of allRefPaths) {
    const resolved = resolveOutputFile(ctx, refPath)
    if (resolved && fs.existsSync(resolved)) args.push('-r', resolved)
  }

  if (asBool(body.increaseRefIndex)) args.push('--increase-ref-index')
  if (asBool(body.disableAutoResizeRefImage)) args.push('--disable-auto-resize-ref-image')

  const initImage = fileFromUpload(req, 'initImage') || firstString(body.initImagePath)
  if (initImage) {
    const resolved = resolveOutputFile(ctx, initImage)
    if (resolved && fs.existsSync(resolved)) args.push('-i', resolved)
    pushArg(args, '--strength', body.img2imgStrength ?? body.strength)
  }

  const upscaleModel = modelPath(ctx, 'upscale', firstString(body.upscaleModel))
  if (upscaleModel) args.push('--upscale-model', upscaleModel)
  const taesdModel = modelPath(ctx, 'taesd', firstString(body.taesdModel))
  if (taesdModel) args.push('--taesd', taesdModel)
  if (body.livePreviewMethod) {
    const previewPath = path.join(ctx.paths.tempDir, `preview_${Date.now()}.png`)
    args.push(
      '--preview',
      String(body.livePreviewMethod),
      '--preview-path',
      previewPath,
      '--preview-interval',
      '1'
    )
    ctx.state.previewTempFile = previewPath
  }

  const pmImagesDir = copyPhotoMakerGallery(ctx, body, req)
  const photoMaker = modelPath(ctx, 'photomaker', firstString(body.photoMaker))
  if (photoMaker) {
    args.push('--photo-maker', photoMaker)
    if (pmImagesDir && fs.existsSync(pmImagesDir) && fs.readdirSync(pmImagesDir).length > 0)
      args.push('--pm-id-images-dir', pmImagesDir)
    pushArg(args, '--pm-style-strength', body.pmStyleStrength)
    pushArg(args, '--pm-id-embed-path', body.pmIdEmbedsPath)
  }

  const controlNet = modelPath(ctx, 'controlnet', firstString(body.controlNet))
  if (controlNet) {
    args.push('--control-net', controlNet)
    const controlImage =
      fileFromUpload(req, 'controlNetImage') ||
      firstString(body.controlImagePath, body.controlNetImageGallery, body.controlImage)
    if (controlImage) {
      const resolved = resolveOutputFile(ctx, controlImage)
      if (resolved && fs.existsSync(resolved)) args.push('--control-image', resolved)
    }
    pushArg(args, '--control-strength', body.controlStrength)
    if (asBool(body.applyCanny)) args.push('--canny')
  }

  args.push('-v')
  return {
    args,
    cleanupDirs: [pmImagesDir, req.kontextRefDir || null],
    cleanupFiles: [
      ...filesFromUpload(req, 'kontextRefImage'),
      fileFromUpload(req, 'controlNetImage'),
      fileFromUpload(req, 'initImage')
    ].filter(Boolean) as string[]
  }
}

export function registerGenerationRoutes(app: Express, ctx: AppContext): void {
  app.post('/api/generate-cli', uploadMiddleware(ctx), async (req: UploadRequest, res) => {
    if (!ensureCliIdle(ctx, res)) return

    const body = req.body || {}
    const diffusionModel = firstString(body.diffusionModel, body.diffusion_model)
    if (!diffusionModel) {
      return res.status(400).json({
        message:
          'No model selected. Please select a model in the sidebar (Model Configuration section).',
        error: 'MODEL_REQUIRED'
      })
    }

    // Modern sd-cli: use printf %d for multi-image sequences when batch > 1
    // (see --output help: e.g. output_%03d.png + --output-begin-idx)
    const batchCount = Math.max(
      1,
      Math.min(16, parseInt(String(body.batchCount || body.batch_count || 1), 10) || 1)
    )
    const stamp = Date.now()
    const filename = batchCount > 1 ? `gen_${stamp}_%03d.png` : `gen_${stamp}.png`
    const outputPath = path.join(ctx.paths.outputDir, filename)
    // Ensure body carries clamped batch so buildImageArgs emits -b
    body.batchCount = batchCount
    const { args, cleanupDirs, cleanupFiles } = buildImageArgs(ctx, body, req, outputPath)
    if (batchCount > 1 && filename.includes('%') && !args.includes('--output-begin-idx')) {
      args.push('--output-begin-idx', '0')
    }

    ctx.state.previewImageBuffer = null

    let stopWatching: (() => void) | null = null
    if (ctx.state.previewTempFile) {
      stopWatching = watchPreviewFile(ctx, ctx.state.previewTempFile)
    }

    try {
      const result = await runCli(ctx, args, 'CLI-GEN')
      sendCliResult(
        res,
        result,
        outputPath,
        filename,
        'Generation failed - no output file',
        batchCount
      )
    } catch (error: unknown) {
      sendCliFailure(res, error, 'CLI generation failed')
    } finally {
      if (stopWatching) stopWatching()
      if (ctx.state.previewTempFile) {
        removeFile(ctx.state.previewTempFile)
        ctx.state.previewTempFile = null
      }
      ctx.state.previewImageBuffer = null
      removeTemporaryFiles(cleanupDirs, cleanupFiles)
    }
  })

  app.post('/api/cancel-cli', (_req, res) => {
    if (ctx.state.cliProcess) {
      ctx.state.cliProcess.kill('SIGTERM')
      ctx.state.previewImageBuffer = null
      if (ctx.state.previewTempFile) {
        removeFile(ctx.state.previewTempFile)
        ctx.state.previewTempFile = null
      }
      if (ctx.state.convertOutputPath) {
        removeFile(ctx.state.convertOutputPath)
        ctx.state.convertOutputPath = null
      }
      res.json({ message: 'Cancelled' })
    } else {
      res.json({ message: 'No CLI process running' })
    }
  })

  app.get('/api/preview-image', (req, res) => {
    if (!ctx.state.previewImageBuffer) {
      const fallback = ctx.state.previewTempFile
      if (fallback && fs.existsSync(fallback)) {
        try {
          const stat = fs.statSync(fallback)
          const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`
          if (req.headers['if-none-match'] === etag) {
            return res.status(304).end()
          }
          res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
            ETag: etag
          })
          return res.sendFile(fallback)
        } catch {
          return res.status(404).json({ message: 'No preview available' })
        }
      }
      return res.status(404).json({ message: 'No preview available' })
    }

    const etag = ctx.state.previewEtag || `"${ctx.state.previewImageBuffer.length}"`
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ETag: etag
    })
    res.send(ctx.state.previewImageBuffer)
  })

  const inpaintUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, ctx.paths.tempDir),
      filename: (_req, file, cb) => cb(null, `${file.fieldname}_${Date.now()}.png`)
    })
  })
  app.post(
    '/api/inpaint',
    inpaintUpload.fields([
      { name: 'initImage', maxCount: 1 },
      { name: 'mask', maxCount: 1 }
    ]),
    async (req: UploadRequest, res) => {
      if (!ensureCliIdle(ctx, res)) return

      const body = req.body || {}
      const initImg =
        fileFromUpload(req, 'initImage') || resolveOutputFile(ctx, firstString(body.initImagePath))
      if (!initImg || !fs.existsSync(initImg))
        return res.status(400).json({ message: 'Init image required' })

      const filename = `inpaint_${Date.now()}.png`
      const outputPath = path.join(ctx.paths.outputDir, filename)
      const args: string[] = []
      addModelArgs(ctx, args, body)
      args.push('-i', initImg)
      const maskPath = fileFromUpload(req, 'mask')
      if (maskPath) args.push('--mask', maskPath)
      const parsedStrength = parseFloat(String(body.strength))
      const strength = Number.isFinite(parsedStrength)
        ? Math.min(1, Math.max(0, parsedStrength))
        : 0.75
      args.push('--strength', String(strength))
      addGenerationArgs(args, body, outputPath, { width: 1024, height: 1024, cfg: 7, multiple: 64 })
      addOptionalArgs(args, body)
      addHardwareArgs(args, body, String(body.prompt || ''))
      assertLoraFilesPresent(ctx, body, String(body.prompt || ''))
      addPromptModelExtras(ctx, args, body, String(body.prompt || ''))
      args.push('-v')
      const tempFiles = [fileFromUpload(req, 'initImage'), maskPath]

      try {
        const result = await runCli(ctx, args, 'INPAINT')
        sendCliResult(res, result, outputPath, filename, 'Inpainting failed - no output file')
      } catch (error: unknown) {
        sendCliFailure(res, error, 'Inpainting failed')
      } finally {
        removeTemporaryFiles([], tempFiles)
      }
    }
  )

  const videoUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, ctx.paths.tempDir),
      filename: (_req, _file, cb) => cb(null, `video_init_${Date.now()}.png`)
    })
  })
  app.post(
    '/api/generate-video',
    videoUpload.fields([
      { name: 'initImage', maxCount: 1 },
      { name: 'reference_image', maxCount: 1 },
      { name: 'endImage', maxCount: 1 },
      { name: 'end_img', maxCount: 1 }
    ]),
    async (req: UploadRequest, res) => {
      if (!ensureCliIdle(ctx, res)) return

      const body = req.body || {}
      const filename = `video_${Date.now()}.mp4`
      const outputPath = path.join(ctx.paths.outputDir, filename)
      const args = ['-M', 'vid_gen']
      pushModelArg(
        ctx,
        args,
        '--diffusion-model',
        'diffusion',
        firstString(body.diffusionModel, body.diffusion_model)
      )
      const highNoise = modelPath(
        ctx,
        'diffusion',
        firstString(body.highNoiseDiffusionModel, body.high_noise_diffusion_model)
      )
      if (highNoise) args.push('--high-noise-diffusion-model', highNoise)
      pushModelArg(ctx, args, '--t5xxl', 't5xxl', firstString(body.t5xxl))
      pushModelArg(ctx, args, '--llm', 'llm', firstString(body.llm))
      pushModelArg(
        ctx,
        args,
        '--llm_vision',
        'llm_vision',
        firstString(body.llmVision, body.llm_vision)
      )
      pushModelArg(
        ctx,
        args,
        '--embeddings-connectors',
        'embeddings_connectors',
        firstString(body.embeddingsConnectors, body.embeddings_connectors)
      )
      pushModelArg(ctx, args, '--vae', 'vae', firstString(body.vae))
      pushModelArg(
        ctx,
        args,
        '--audio-vae',
        'audio_vae',
        firstString(body.audioVae, body.audio_vae)
      )
      pushModelArg(
        ctx,
        args,
        '--clip_vision',
        'clip_vision',
        firstString(body.clipVision, body.clip_vision)
      )
      const initImg =
        fileFromUpload(req, 'initImage') ||
        fileFromUpload(req, 'reference_image') ||
        resolveOutputFile(ctx, firstString(body.initImagePath))
      if (initImg && fs.existsSync(initImg)) args.push('-i', initImg)

      // FLF2V end frame
      const endImg =
        fileFromUpload(req, 'endImage') ||
        fileFromUpload(req, 'end_img') ||
        resolveOutputFile(ctx, firstString(body.endImagePath, body.end_img, body.endImg))
      if (endImg && fs.existsSync(endImg)) args.push('--end-img', endImg)

      // VACE control video: directory of frames in lexicographic order
      const controlVideo = firstString(body.controlVideo, body.control_video, body.controlVideoPath)
      if (controlVideo && fs.existsSync(controlVideo)) {
        args.push('--control-video', controlVideo)
      }

      addGenerationArgs(args, body, outputPath, { width: 832, height: 480, cfg: 6.0, multiple: 16 })
      args.push('--video-frames', String(body.videoFrames || body.video_frames || 33))
      const fps = parseInt(String(body.fps ?? 24), 10)
      if (Number.isFinite(fps) && fps > 0) args.push('--fps', String(fps))
      args.push('--flow-shift', String(body.flowShift || body.flow_shift || 3.0))

      pushNumericArgIfPresent(args, '--vace-strength', body.vaceStrength ?? body.vace_strength)
      pushNumericArgIfPresent(args, '--moe-boundary', body.moeBoundary ?? body.moe_boundary)

      // High-noise suite (Wan2.2 MoE and similar)
      if (highNoise || body.highNoiseSteps != null || body.highNoiseCfg != null) {
        pushArg(args, '--high-noise-cfg-scale', body.highNoiseCfg ?? body.highNoiseCfgScale)
        pushArg(args, '--high-noise-steps', body.highNoiseSteps)
        pushArg(
          args,
          '--high-noise-sampling-method',
          body.highNoiseSampler ?? body.highNoiseSamplingMethod
        )
        pushArg(args, '--high-noise-guidance', body.highNoiseGuidance)
        pushArg(args, '--high-noise-eta', body.highNoiseEta)
        pushArg(args, '--high-noise-slg-scale', body.highNoiseSlgScale)
        pushArg(args, '--high-noise-skip-layers', body.highNoiseSkipLayers)
        pushArg(args, '--high-noise-skip-layer-start', body.highNoiseSkipLayerStart)
        pushArg(args, '--high-noise-skip-layer-end', body.highNoiseSkipLayerEnd)
        pushArg(args, '--high-noise-img-cfg-scale', body.highNoiseImgCfgScale)
      }

      addOptionalArgs(args, body)
      addHardwareArgs(args, body, String(body.prompt || ''))
      assertLoraFilesPresent(ctx, body, String(body.prompt || ''))
      addPromptModelExtras(ctx, args, body, String(body.prompt || ''))
      args.push('-v')
      const tempFiles = [
        fileFromUpload(req, 'initImage'),
        fileFromUpload(req, 'reference_image'),
        fileFromUpload(req, 'endImage'),
        fileFromUpload(req, 'end_img')
      ]

      try {
        const result = await runCli(ctx, args, 'VIDEO')
        sendCliResult(res, result, outputPath, filename, 'Video generation failed - no output file')
      } catch (error: unknown) {
        sendCliFailure(res, error, 'Video generation failed')
      } finally {
        removeTemporaryFiles([], tempFiles)
      }
    }
  )

  app.post('/api/upscale', async (req, res) => {
    if (!ensureCliIdle(ctx, res)) return

    const body = (req.body || {}) as JsonObject
    const sourceFilename = firstString(body.filename, body.source, body.image)
    if (!sourceFilename) return res.status(400).json({ message: 'Source image filename required' })

    const sourcePath = resolveOutputFile(ctx, sourceFilename)
    if (!sourcePath || !fs.existsSync(sourcePath))
      return res.status(400).json({ message: 'Source image not found' })

    const upscaleModelName = firstString(body.upscaleModel, body.upscale_model)
    const upscaleModel = modelPath(ctx, 'upscale', upscaleModelName)
    if (!upscaleModel)
      return res.status(400).json({
        message: 'Upscale model required. Place an ESRGAN model in models/upscale.',
        error: 'UPSCALE_MODEL_REQUIRED'
      })

    const ext = path.extname(sourcePath) || '.png'
    const filename = `upscale_${Date.now()}${ext}`
    const outputPath = path.join(ctx.paths.outputDir, filename)
    const args: string[] = ['-M', 'upscale', '-i', sourcePath, '-o', outputPath]
    args.push('--upscale-model', upscaleModel)

    const repeats = parseInt(String(body.upscaleRepeats ?? body.upscale_repeats ?? 1), 10)
    if (Number.isFinite(repeats) && repeats > 1) args.push('--upscale-repeats', String(repeats))

    const tileSize = parseInt(String(body.upscaleTileSize ?? body.upscale_tile_size ?? 0), 10)
    if (Number.isFinite(tileSize) && tileSize > 0)
      args.push('--upscale-tile-size', String(tileSize))

    addHardwareArgs(args, body)
    args.push('-v')

    try {
      const result = await runCli(ctx, args, 'UPSCALE')
      sendCliResult(res, result, outputPath, filename, 'Upscale failed - no output file')
    } catch (error: unknown) {
      sendCliFailure(res, error, 'Upscale failed')
    }
  })

  app.post('/api/convert', async (req, res) => {
    if (!ensureCliIdle(ctx, res)) return

    const { sourceType, sourceModel, outputFormat, outputName } = req.body || {}
    if (!sourceType || !sourceModel || !outputFormat || !outputName)
      return res.status(400).json({ success: false, error: 'Missing required parameters' })
    const allowedSourceTypes = new Set([
      'diffusion',
      'uncond_diffusion',
      'vae',
      'llm',
      't5xxl',
      'clip',
      'clip_vision'
    ])
    if (!allowedSourceTypes.has(String(sourceType)))
      return res.status(400).json({ success: false, error: 'Unsupported source model category' })

    const safeSourceModel = path.basename(String(sourceModel))
    const safeOutputName = path.basename(String(outputName))
    if (safeSourceModel !== String(sourceModel) || safeOutputName !== String(outputName))
      return res.status(400).json({ success: false, error: 'Invalid model filename' })

    const sourceDirectory = modelDirectory(ctx, String(sourceType))
    const sourcePath = path.join(sourceDirectory, safeSourceModel)
    const outputPath = path.join(sourceDirectory, safeOutputName)
    if (!fs.existsSync(sourcePath))
      return res.status(400).json({ success: false, error: 'Source model not found' })
    if (fs.existsSync(outputPath))
      return res.status(400).json({ success: false, error: 'Output file already exists' })
    const args = ['-M', 'convert', '-m', sourcePath, '-o', outputPath, '--type', outputFormat, '-v']
    try {
      ctx.state.convertOutputPath = outputPath
      await runCli(ctx, args, 'CONVERT')
      // New GGUF on disk — drop model list cache
      invalidateModelsCache()
      res.json({ success: fs.existsSync(outputPath), outputPath: outputName })
    } catch (error: unknown) {
      const raw = errorMessage(error)
      const human = humanizeCliError(raw)
      res.status(500).json({
        success: false,
        error: formatHumanizedError(human),
        message: formatHumanizedError(human),
        title: human.title,
        detail: human.detail,
        hint: human.hint
      })
    } finally {
      ctx.state.convertOutputPath = null
    }
  })
}
