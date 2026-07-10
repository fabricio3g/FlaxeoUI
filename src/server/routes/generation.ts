import fs from 'fs'
import path from 'path'
import multer from 'multer'
import type { Express, Request, Response } from 'express'
import type { AppContext, JsonObject } from '../types'
import {
  asBool,
  errorMessage,
  firstString,
  modelPath,
  parseStepLine,
  removeDir,
  removeFile,
  spawnLoggedProcess,
  waitForProcess
} from '../utils'
import type { ParsedStep } from '../utils'
import {
  addGenerationArgs,
  addHardwareArgs,
  addModelArgs,
  addOptionalArgs,
  addPromptModelExtras,
  getSdCliPath,
  pushArg,
  pushModelArg
} from '../sd'

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
          const dir = path.join(ctx.paths.tempDir, `kontext_${Date.now()}`)
          fs.mkdirSync(dir, { recursive: true })
          req.kontextRefDir = dir
          cb(null, dir)
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
    { name: 'kontextRefImage', maxCount: 1 },
    { name: 'controlNetImage', maxCount: 1 },
    { name: 'initImage', maxCount: 1 }
  ])
}

async function runCli(
  ctx: AppContext,
  args: string[],
  label: string
): Promise<{ cancelled: boolean }> {
  const activeBackend = ctx.getActiveBackendPath()
  const startedAt = Date.now()
  ctx.state.progressBus.emit('start', { label, startedAt })
  ctx.state.progress = { current: 0, total: 0, itPerSec: 0, label, startedAt, updatedAt: startedAt }

  ctx.state.cliProcess = spawnLoggedProcess(ctx, getSdCliPath(ctx), args, label, {
    cwd: activeBackend
  })

  const onChunk = (data: Buffer): void => {
    const text = data.toString()
    const lines = text.split('\n')
    for (const line of lines) {
      const parsed = parseStepLine(line)
      if (parsed) {
        updateProgress(ctx, parsed, label, startedAt)
      }
    }
  }
  ctx.state.cliProcess.stdout?.on('data', onChunk)
  ctx.state.cliProcess.stderr?.on('data', onChunk)

  try {
    return await waitForProcess(ctx.state.cliProcess, label)
  } finally {
    ctx.state.cliProcess = null
    ctx.state.progress = null
    ctx.state.progressBus.emit('end', {})
  }
}

function updateProgress(
  ctx: AppContext,
  parsed: ParsedStep,
  label: string,
  startedAt: number
): void {
  const p = {
    current: parsed.current,
    total: parsed.total,
    itPerSec: parsed.itPerSec,
    label,
    startedAt,
    updatedAt: Date.now()
  }
  ctx.state.progress = p
  ctx.state.progressBus.emit('progress', p)
}

function fileFromUpload(req: UploadRequest, field: string): string | null {
  if (!req.files || Array.isArray(req.files)) return null
  const files = req.files?.[field]
  return files?.[0]?.path || null
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

function sendCliResult(
  res: Response,
  result: { cancelled: boolean },
  outputPath: string,
  filename: string,
  failedMessage: string
): void {
  if (result.cancelled) {
    res.json({ message: 'Cancelled' })
    return
  }
  if (fs.existsSync(outputPath)) {
    res.json({ message: 'Complete', filenames: [filename], filename })
    return
  }
  res.status(500).json({ message: failedMessage })
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
  addPromptModelExtras(ctx, args, body, prompt)

  const kontextRefPath =
    fileFromUpload(req, 'kontextRefImage') ||
    firstString(body.kontextRefPath, body.kontextRefGallery)
  if (kontextRefPath) {
    const resolved = resolveOutputFile(ctx, kontextRefPath)
    if (resolved && fs.existsSync(resolved)) args.push('-r', resolved)
  }

  const initImage = fileFromUpload(req, 'initImage') || firstString(body.initImagePath)
  if (initImage) {
    const resolved = resolveOutputFile(ctx, initImage)
    if (resolved && fs.existsSync(resolved)) args.push('-i', resolved)
    pushArg(args, '--strength', body.img2imgStrength)
  }

  const upscaleModel = modelPath(ctx, 'upscale', firstString(body.upscaleModel))
  if (upscaleModel) args.push('--upscale-model', upscaleModel)
  const taesdModel = modelPath(ctx, 'taesd', firstString(body.taesdModel))
  if (taesdModel) args.push('--taesd', taesdModel)
  if (body.livePreviewMethod) {
    args.push(
      '--preview',
      String(body.livePreviewMethod),
      '--preview-path',
      path.join(ctx.paths.tempDir, 'preview.png'),
      '--preview-interval',
      '1'
    )
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
    cleanupFiles: [fileFromUpload(req, 'controlNetImage'), fileFromUpload(req, 'initImage')].filter(
      Boolean
    ) as string[]
  }
}

export function registerGenerationRoutes(app: Express, ctx: AppContext): void {
  app.post('/api/generate-cli', uploadMiddleware(ctx), async (req: UploadRequest, res) => {
    const body = req.body || {}
    const diffusionModel = firstString(body.diffusionModel, body.diffusion_model)
    if (!diffusionModel) {
      return res.status(400).json({
        message:
          'No model selected. Please select a model in the sidebar (Model Configuration section).',
        error: 'MODEL_REQUIRED'
      })
    }

    const filename = `gen_${Date.now()}.png`
    const outputPath = path.join(ctx.paths.outputDir, filename)
    const { args, cleanupDirs, cleanupFiles } = buildImageArgs(ctx, body, req, outputPath)

    try {
      const result = await runCli(ctx, args, 'CLI-GEN')
      sendCliResult(res, result, outputPath, filename, 'Generation failed - no output file')
    } catch (error: unknown) {
      res.status(500).json({ message: 'CLI generation failed', error: errorMessage(error) })
    } finally {
      removeTemporaryFiles(cleanupDirs, cleanupFiles)
    }
  })

  app.post('/api/cancel-cli', (_req, res) => {
    if (ctx.state.cliProcess) {
      ctx.state.cliProcess.kill('SIGTERM')
      res.json({ message: 'Cancelled' })
    } else {
      res.json({ message: 'No CLI process running' })
    }
  })

  app.get('/api/preview-image', (_req, res) => {
    const previewPath = path.join(ctx.paths.tempDir, 'preview.png')
    if (!fs.existsSync(previewPath))
      return res.status(404).json({ message: 'No preview available' })
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    })
    res.sendFile(previewPath)
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
      addPromptModelExtras(ctx, args, body, String(body.prompt || ''))
      args.push('-v')
      const tempFiles = [fileFromUpload(req, 'initImage'), maskPath]

      try {
        const result = await runCli(ctx, args, 'INPAINT')
        sendCliResult(res, result, outputPath, filename, 'Inpainting failed - no output file')
      } catch (error: unknown) {
        res.status(500).json({ message: 'Inpainting failed', error: errorMessage(error) })
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
      { name: 'reference_image', maxCount: 1 }
    ]),
    async (req: UploadRequest, res) => {
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
      addGenerationArgs(args, body, outputPath, { width: 832, height: 480, cfg: 6.0, multiple: 16 })
      args.push('--video-frames', String(body.videoFrames || body.video_frames || 33))
      args.push('--flow-shift', String(body.flowShift || body.flow_shift || 3.0))
      if (highNoise) {
        pushArg(args, '--high-noise-cfg-scale', body.highNoiseCfg)
        pushArg(args, '--high-noise-steps', body.highNoiseSteps)
        pushArg(args, '--high-noise-sampling-method', body.highNoiseSampler)
      }
      addOptionalArgs(args, body)
      addHardwareArgs(args, body, String(body.prompt || ''))
      addPromptModelExtras(ctx, args, body, String(body.prompt || ''))
      args.push('-v')
      const tempFiles = [fileFromUpload(req, 'initImage'), fileFromUpload(req, 'reference_image')]

      try {
        const result = await runCli(ctx, args, 'VIDEO')
        sendCliResult(res, result, outputPath, filename, 'Video generation failed - no output file')
      } catch (error: unknown) {
        res.status(500).json({ message: 'Video generation failed', error: errorMessage(error) })
      } finally {
        removeTemporaryFiles([], tempFiles)
      }
    }
  )

  app.post('/api/convert', async (req, res) => {
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

    const sourcePath = path.join(ctx.paths.modelsDir, sourceType, safeSourceModel)
    const outputPath = path.join(ctx.paths.modelsDir, sourceType, safeOutputName)
    if (!fs.existsSync(sourcePath))
      return res.status(400).json({ success: false, error: 'Source model not found' })
    if (fs.existsSync(outputPath))
      return res.status(400).json({ success: false, error: 'Output file already exists' })
    const args = ['-M', 'convert', '-m', sourcePath, '-o', outputPath, '--type', outputFormat, '-v']
    try {
      await runCli(ctx, args, 'CONVERT')
      res.json({ success: fs.existsSync(outputPath), outputPath: outputName })
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: errorMessage(error) })
    }
  })
}
