import fs from 'fs'
import path from 'path'
import multer from 'multer'
import type { Express, Request } from 'express'
import type { AppContext, JsonObject } from '../types'
import {
  asBool,
  firstString,
  modelPath,
  removeDir,
  removeFile,
  spawnLoggedProcess,
  waitForProcess
} from '../utils'
import {
  addGenerationArgs,
  addHardwareArgs,
  addModelArgs,
  addOptionalArgs,
  addPromptModelExtras,
  getSdCliPath
} from '../sd'

interface UploadRequest extends Request {
  pmImagesDir?: string
  kontextRefDir?: string
  files?: any
  file?: any
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
      filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname || file.fieldname}.png`)
    })
  }).fields([
    { name: 'pmImages', maxCount: 4 },
    { name: 'kontextRefImage', maxCount: 1 },
    { name: 'controlNetImage', maxCount: 1 },
    { name: 'initImage', maxCount: 1 }
  ])
}

async function runCli(ctx: AppContext, args: string[], label: string): Promise<{ cancelled: boolean }> {
  const activeBackend = ctx.getActiveBackendPath()
  ctx.state.cliProcess = spawnLoggedProcess(ctx, getSdCliPath(ctx), args, label, { cwd: activeBackend })
  try {
    return await waitForProcess(ctx.state.cliProcess, label)
  } finally {
    ctx.state.cliProcess = null
  }
}

function fileFromUpload(req: UploadRequest, field: string): string | null {
  const files = req.files?.[field]
  return files?.[0]?.path || null
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

function copyPhotoMakerGallery(ctx: AppContext, body: JsonObject, req: UploadRequest): string | null {
  let pmImagesDir = req.pmImagesDir || null
  const localImages = parseJsonArray(body.photoMakerImages)
  const galleryImages = parseJsonArray(body.pmGalleryImages)
  const allImages = [...localImages, ...galleryImages.map((file) => path.join(ctx.paths.outputDir, file))]

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

function buildImageArgs(ctx: AppContext, body: JsonObject, req: UploadRequest, outputPath: string): { args: string[]; cleanupDirs: Array<string | null>; cleanupFiles: string[] } {
  const args: string[] = []
  const prompt = String(body.prompt || '')
  addModelArgs(ctx, args, body)
  addGenerationArgs(args, body, outputPath, { width: 1024, height: 1024, cfg: 7, multiple: 64 })
  addOptionalArgs(args, body)

  const batchCount = parseInt(String(body.batchCount || body.batch_count || 1), 10)
  if (batchCount > 1) args.push('-b', String(batchCount))
  addHardwareArgs(args, body, prompt)
  addPromptModelExtras(ctx, args, body, prompt)

  const kontextRefPath = fileFromUpload(req, 'kontextRefImage') || firstString(body.kontextRefPath, body.kontextRefGallery)
  if (kontextRefPath) {
    const resolved = fs.existsSync(kontextRefPath) ? kontextRefPath : path.join(ctx.paths.outputDir, kontextRefPath)
    if (fs.existsSync(resolved)) args.push('-r', resolved)
  }

  const initImage = fileFromUpload(req, 'initImage') || firstString(body.initImagePath)
  if (initImage) {
    const resolved = fs.existsSync(initImage) ? initImage : path.join(ctx.paths.outputDir, initImage)
    if (fs.existsSync(resolved)) args.push('-i', resolved)
    if (body.img2imgStrength) args.push('--strength', String(body.img2imgStrength))
  }

  const upscaleModel = modelPath(ctx, 'upscale', firstString(body.upscaleModel))
  if (upscaleModel) args.push('--upscale-model', upscaleModel)
  const taesdModel = modelPath(ctx, 'taesd', firstString(body.taesdModel))
  if (taesdModel) args.push('--taesd', taesdModel)
  if (body.livePreviewMethod) {
    args.push('--preview', String(body.livePreviewMethod), '--preview-path', path.join(ctx.paths.tempDir, 'preview.png'), '--preview-interval', '1')
  }

  const pmImagesDir = copyPhotoMakerGallery(ctx, body, req)
  const photoMaker = modelPath(ctx, 'photomaker', firstString(body.photoMaker))
  if (photoMaker) {
    args.push('--photo-maker', photoMaker)
    if (pmImagesDir && fs.existsSync(pmImagesDir) && fs.readdirSync(pmImagesDir).length > 0) args.push('--pm-id-images-dir', pmImagesDir)
    if (body.pmStyleStrength) args.push('--pm-style-strength', String(body.pmStyleStrength))
    if (body.pmIdEmbedsPath) args.push('--pm-id-embed-path', String(body.pmIdEmbedsPath))
  }

  const controlNet = modelPath(ctx, 'controlnet', firstString(body.controlNet))
  if (controlNet) {
    args.push('--control-net', controlNet)
    const controlImage = fileFromUpload(req, 'controlNetImage') || firstString(body.controlImagePath, body.controlNetImageGallery, body.controlImage)
    if (controlImage) {
      const resolved = fs.existsSync(controlImage) ? controlImage : path.join(ctx.paths.outputDir, controlImage)
      if (fs.existsSync(resolved)) args.push('--control-image', resolved)
    }
    if (body.controlStrength) args.push('--control-strength', String(body.controlStrength))
    if (asBool(body.applyCanny)) args.push('--canny')
  }

  args.push('-v')
  return {
    args,
    cleanupDirs: [pmImagesDir, req.kontextRefDir || null],
    cleanupFiles: [fileFromUpload(req, 'controlNetImage'), fileFromUpload(req, 'initImage')].filter(Boolean) as string[]
  }
}

export function registerGenerationRoutes(app: Express, ctx: AppContext): void {
  app.post('/api/generate-cli', uploadMiddleware(ctx), async (req: UploadRequest, res) => {
    const body = req.body || {}
    const diffusionModel = firstString(body.diffusionModel, body.diffusion_model)
    if (!diffusionModel) {
      return res.status(400).json({ message: 'No model selected. Please select a model in the sidebar (Model Configuration section).', error: 'MODEL_REQUIRED' })
    }

    const filename = `gen_${Date.now()}.png`
    const outputPath = path.join(ctx.paths.outputDir, filename)
    const { args, cleanupDirs, cleanupFiles } = buildImageArgs(ctx, body, req, outputPath)

    try {
      const result = await runCli(ctx, args, 'CLI-GEN')
      cleanupDirs.forEach(removeDir)
      cleanupFiles.forEach(removeFile)
      if (result.cancelled) res.json({ message: 'Cancelled' })
      else if (fs.existsSync(outputPath)) res.json({ message: 'Complete', filenames: [filename], filename })
      else res.status(500).json({ message: 'Generation failed - no output file' })
    } catch (error: any) {
      cleanupDirs.forEach(removeDir)
      cleanupFiles.forEach(removeFile)
      res.status(500).json({ message: 'CLI generation failed', error: error.message })
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
    if (!fs.existsSync(previewPath)) return res.status(404).json({ message: 'No preview available' })
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '0' })
    res.sendFile(previewPath)
  })

  const inpaintUpload = multer({ storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, ctx.paths.tempDir), filename: (_req, file, cb) => cb(null, `${file.fieldname}_${Date.now()}.png`) }) })
  app.post('/api/inpaint', inpaintUpload.fields([{ name: 'initImage', maxCount: 1 }, { name: 'mask', maxCount: 1 }]), async (req: UploadRequest, res) => {
    const body = req.body || {}
    const initImg = fileFromUpload(req, 'initImage') || (body.initImagePath ? path.join(ctx.paths.outputDir, body.initImagePath) : null)
    if (!initImg || !fs.existsSync(initImg)) return res.status(400).json({ message: 'Init image required' })

    const filename = `inpaint_${Date.now()}.png`
    const outputPath = path.join(ctx.paths.outputDir, filename)
    const args: string[] = []
    addModelArgs(ctx, args, body)
    args.push('-i', initImg)
    const maskPath = fileFromUpload(req, 'mask')
    if (maskPath) args.push('--mask', maskPath)
    args.push('--strength', String(parseFloat(body.strength) || 0.75))
    addGenerationArgs(args, body, outputPath, { width: 1024, height: 1024, cfg: 7, multiple: 64 })
    addOptionalArgs(args, body)
    addHardwareArgs(args, body, String(body.prompt || ''))
    addPromptModelExtras(ctx, args, body, String(body.prompt || ''))
    args.push('-v')

    try {
      const result = await runCli(ctx, args, 'INPAINT')
      removeFile(fileFromUpload(req, 'initImage') || undefined)
      removeFile(maskPath || undefined)
      if (result.cancelled) res.json({ message: 'Cancelled' })
      else if (fs.existsSync(outputPath)) res.json({ message: 'Complete', filenames: [filename], filename })
      else res.status(500).json({ message: 'Inpainting failed - no output file' })
    } catch (error: any) {
      removeFile(fileFromUpload(req, 'initImage') || undefined)
      removeFile(maskPath || undefined)
      res.status(500).json({ message: 'Inpainting failed', error: error.message })
    }
  })

  const videoUpload = multer({ storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, ctx.paths.tempDir), filename: (_req, _file, cb) => cb(null, `video_init_${Date.now()}.png`) }) })
  app.post('/api/generate-video', videoUpload.fields([{ name: 'initImage', maxCount: 1 }, { name: 'reference_image', maxCount: 1 }]), async (req: UploadRequest, res) => {
    const body = req.body || {}
    const filename = `video_${Date.now()}.mp4`
    const outputPath = path.join(ctx.paths.outputDir, filename)
    const args = ['-M', 'vid_gen']
    const diffusionModel = modelPath(ctx, 'diffusion', firstString(body.diffusionModel, body.diffusion_model))
    if (diffusionModel) args.push('--diffusion-model', diffusionModel)
    const highNoise = modelPath(ctx, 'diffusion', firstString(body.highNoiseDiffusionModel, body.high_noise_diffusion_model))
    if (highNoise) args.push('--high-noise-diffusion-model', highNoise)
    const t5xxl = modelPath(ctx, 't5xxl', firstString(body.t5xxl))
    if (t5xxl) args.push('--t5xxl', t5xxl)
    const llm = modelPath(ctx, 'llm', firstString(body.llm))
    if (llm) args.push('--llm', llm)
    const llmVision = modelPath(ctx, 'llm_vision', firstString(body.llmVision, body.llm_vision))
    if (llmVision) args.push('--llm_vision', llmVision)
    const embeddingsConnectors = modelPath(ctx, 'embeddings_connectors', firstString(body.embeddingsConnectors, body.embeddings_connectors))
    if (embeddingsConnectors) args.push('--embeddings-connectors', embeddingsConnectors)
    const vae = modelPath(ctx, 'vae', firstString(body.vae))
    if (vae) args.push('--vae', vae)
    const audioVae = modelPath(ctx, 'audio_vae', firstString(body.audioVae, body.audio_vae))
    if (audioVae) args.push('--audio-vae', audioVae)
    const clipVision = modelPath(ctx, 'clip_vision', firstString(body.clipVision, body.clip_vision))
    if (clipVision) args.push('--clip_vision', clipVision)
    const initImg = fileFromUpload(req, 'initImage') || fileFromUpload(req, 'reference_image') || (body.initImagePath ? path.join(ctx.paths.outputDir, body.initImagePath) : null)
    if (initImg && fs.existsSync(initImg)) args.push('-i', initImg)
    addGenerationArgs(args, body, outputPath, { width: 832, height: 480, cfg: 6.0, multiple: 16 })
    args.push('--video-frames', String(body.videoFrames || body.video_frames || 33))
    args.push('--flow-shift', String(body.flowShift || body.flow_shift || 3.0))
    if (highNoise) {
      if (body.highNoiseCfg) args.push('--high-noise-cfg-scale', String(body.highNoiseCfg))
      if (body.highNoiseSteps) args.push('--high-noise-steps', String(body.highNoiseSteps))
      if (body.highNoiseSampler) args.push('--high-noise-sampling-method', String(body.highNoiseSampler))
    }
    addOptionalArgs(args, body)
    addHardwareArgs(args, body, String(body.prompt || ''))
    addPromptModelExtras(ctx, args, body, String(body.prompt || ''))
    args.push('-v')

    try {
      const result = await runCli(ctx, args, 'VIDEO')
      removeFile(fileFromUpload(req, 'initImage') || undefined)
      removeFile(fileFromUpload(req, 'reference_image') || undefined)
      if (result.cancelled) res.json({ message: 'Cancelled' })
      else if (fs.existsSync(outputPath)) res.json({ message: 'Complete', filenames: [filename], filename })
      else res.status(500).json({ message: 'Video generation failed - no output file' })
    } catch (error: any) {
      removeFile(fileFromUpload(req, 'initImage') || undefined)
      removeFile(fileFromUpload(req, 'reference_image') || undefined)
      res.status(500).json({ message: 'Video generation failed', error: error.message })
    }
  })

  app.post('/api/convert', async (req, res) => {
    const { sourceType, sourceModel, outputFormat, outputName } = req.body || {}
    if (!sourceType || !sourceModel || !outputFormat || !outputName) return res.status(400).json({ success: false, error: 'Missing required parameters' })
    const sourcePath = path.join(ctx.paths.modelsDir, sourceType, sourceModel)
    const outputPath = path.join(ctx.paths.modelsDir, sourceType, outputName)
    if (!fs.existsSync(sourcePath)) return res.status(400).json({ success: false, error: 'Source model not found' })
    if (fs.existsSync(outputPath)) return res.status(400).json({ success: false, error: 'Output file already exists' })
    const args = ['-M', 'convert', '-m', sourcePath, '-o', outputPath, '--type', outputFormat, '-v']
    try {
      await runCli(ctx, args, 'CONVERT')
      res.json({ success: fs.existsSync(outputPath), outputPath: outputName })
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message })
    }
  })
}
