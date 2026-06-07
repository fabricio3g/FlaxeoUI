import fs from 'fs'
import path from 'path'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { appendLog, listFiles, spawnLoggedProcess } from '../utils'
import { addHardwareArgs, addModelArgs, addOptionalArgs, addPromptModelExtras, getSdServerPath } from '../sd'

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
      taesd: listFiles(modelDir('taesd')),
      embeddings: listFiles(modelDir('embeddings'))
    })
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
    res.json({ running: !!ctx.state.sdProcess, logs: ctx.state.serverLogs.slice(-50) })
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
}
