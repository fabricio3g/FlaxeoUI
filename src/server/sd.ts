import fs from 'fs'
import path from 'path'
import type { AppContext, JsonObject } from './types'
import { asBool, firstString, modelPath, roundTo } from './utils'

export function getSdCliPath(ctx: AppContext): string {
  return path.join(ctx.getActiveBackendPath(), process.platform === 'win32' ? 'sd-cli.exe' : 'sd-cli')
}

export function getSdServerPath(ctx: AppContext): string {
  return path.join(ctx.getActiveBackendPath(), process.platform === 'win32' ? 'sd-server.exe' : 'sd-server')
}

export function backendHasBinaries(dir: string): boolean {
  const hasServer = fs.existsSync(path.join(dir, 'sd-server')) || fs.existsSync(path.join(dir, 'sd-server.exe'))
  const hasCli = fs.existsSync(path.join(dir, 'sd-cli')) || fs.existsSync(path.join(dir, 'sd-cli.exe'))
  return hasServer && hasCli
}

export function addModelArgs(ctx: AppContext, args: string[], body: JsonObject): void {
  const loadMode = firstString(body.loadMode) || 'standard'
  const diffusionModel = firstString(body.diffusionModel, body.diffusion_model)
  const vae = firstString(body.vae, body.vaeModel)

  if (loadMode === 'split') {
    const pairs: Array<[string, string, string | undefined]> = [
      ['--diffusion-model', 'diffusion', diffusionModel],
      ['--high-noise-diffusion-model', 'diffusion', firstString(body.highNoiseDiffusionModel, body.high_noise_diffusion_model)],
      ['--uncond-diffusion-model', 'uncond_diffusion', firstString(body.uncondDiffusionModel, body.uncond_diffusion_model)],
      ['--clip_l', 'clip', firstString(body.clipL, body.clip_l)],
      ['--clip_g', 'clip', firstString(body.clipG, body.clip_g)],
      ['--clip_vision', 'clip_vision', firstString(body.clipVision, body.clip_vision)],
      ['--t5xxl', 't5xxl', firstString(body.t5xxl)],
      ['--llm', 'llm', firstString(body.llm)],
      ['--llm_vision', 'llm_vision', firstString(body.llmVision, body.llm_vision)],
      ['--embeddings-connectors', 'embeddings_connectors', firstString(body.embeddingsConnectors, body.embeddings_connectors)],
      ['--audio-vae', 'audio_vae', firstString(body.audioVae, body.audio_vae)],
      ['--vae', 'vae', vae]
    ]
    for (const [flag, subdir, file] of pairs) {
      const resolved = modelPath(ctx, subdir, file)
      if (resolved) args.push(flag, resolved)
    }
  } else {
    const model = modelPath(ctx, 'diffusion', diffusionModel)
    if (model) args.push('-m', model)
    const vaePath = modelPath(ctx, 'vae', vae)
    if (vaePath) args.push('--vae', vaePath)
  }
}

export function addGenerationArgs(
  args: string[],
  body: JsonObject,
  outputPath: string,
  defaults: { width: number; height: number; cfg: number; multiple: number }
): void {
  args.push('-p', String(body.prompt || ''))
  if (body.negative_prompt) args.push('-n', String(body.negative_prompt))
  args.push('--steps', String(body.steps || 20))
  args.push('--cfg-scale', String(body.cfg_scale || defaults.cfg))
  args.push('-W', String(roundTo(body.width, defaults.width, defaults.multiple)))
  args.push('-H', String(roundTo(body.height, defaults.height, defaults.multiple)))
  args.push('-s', String(body.seed || -1))
  args.push('-o', outputPath)
}

export function addOptionalArgs(args: string[], body: JsonObject): void {
  const clipSkip = body.clip_skip ?? body.clipSkip
  if (body.guidance) args.push('--guidance', String(body.guidance))
  if (clipSkip && parseInt(String(clipSkip), 10) !== -1) args.push('--clip-skip', String(clipSkip))
  if (body.scheduler) args.push('--scheduler', String(body.scheduler))
  if (body.samplingMethod) args.push('--sampling-method', String(body.samplingMethod))
  if (body.loraApplyMode) args.push('--lora-apply-mode', String(body.loraApplyMode))
  if (body.vaeTileSize && Number(body.vaeTileSize) > 0) args.push('--vae-tile-size', String(body.vaeTileSize))
  if (body.rngType) args.push('--rng', String(body.rngType))
  if (body.samplerRngType) args.push('--sampler-rng', String(body.samplerRngType))
  if (body.predictionType) args.push('--prediction', String(body.predictionType))
  if (body.vaeFormat) args.push('--vae-format', String(body.vaeFormat))
  if (body.flowShift && Number(body.flowShift) !== 0) args.push('--flow-shift', String(body.flowShift))
  if (body.eta && Number(body.eta) !== 0) args.push('--eta', String(body.eta))
  if (body.slgScale && Number(body.slgScale) !== 0) args.push('--slg-scale', String(body.slgScale))
  if (body.skipLayerStart && Number(body.skipLayerStart) !== 0.01) args.push('--skip-layer-start', String(body.skipLayerStart))
  if (body.skipLayerEnd && Number(body.skipLayerEnd) !== 0.2) args.push('--skip-layer-end', String(body.skipLayerEnd))
  if (body.skipLayers) args.push('--skip-layers', String(body.skipLayers))
  if (body.sigmas) args.push('--sigmas', String(body.sigmas))
  if (body.imgCfgScale && Number(body.imgCfgScale) > 0) args.push('--img-cfg-scale', String(body.imgCfgScale))
  if (body.extraSampleArgs) args.push('--extra-sample-args', String(body.extraSampleArgs))
  if (body.extraTilingArgs) args.push('--extra-tiling-args', String(body.extraTilingArgs))
  if (body.cacheMode) args.push('--cache-mode', String(body.cacheMode))
  if (body.cacheOption) args.push('--cache-option', String(body.cacheOption))
  if (body.scmMask) args.push('--scm-mask', String(body.scmMask))
  if (body.scmPolicy) args.push('--scm-policy', String(body.scmPolicy))
}

export function addHardwareArgs(args: string[], body: JsonObject, prompt = ''): void {
  if (asBool(body.diffusionFa) && !prompt.includes('<lora:')) args.push('--diffusion-fa')
  if (asBool(body.vaeTiling)) args.push('--vae-tiling')
  if (asBool(body.clipOnCpu)) args.push('--clip-on-cpu')
  if (asBool(body.vaeOnCpu)) args.push('--vae-on-cpu')
  if (asBool(body.controlNetOnCpu)) args.push('--control-net-cpu')
  if (asBool(body.offloadToCpu)) args.push('--offload-to-cpu')
  if (asBool(body.diffusionConvDirect)) args.push('--diffusion-conv-direct')
  if (asBool(body.vaeConvDirect)) args.push('--vae-conv-direct')
  if (asBool(body.forceSDXLVaeConvScale)) args.push('--force-sdxl-vae-conv-scale')
  if (asBool(body.streamLayers)) args.push('--stream-layers')
  if (asBool(body.mmap)) args.push('--mmap')
  if (asBool(body.circular)) args.push('--circular')
  if (asBool(body.circularX)) args.push('--circularx')
  if (asBool(body.circularY)) args.push('--circulary')
  if (asBool(body.qwenImageZeroCondT)) args.push('--qwen-image-zero-cond-t')
  if (asBool(body.chromaEnableT5Mask)) args.push('--chroma-enable-t5-mask')
  if (asBool(body.chromaDisableDitMask)) args.push('--chroma-disable-dit-mask')
  if (asBool(body.disableImageMetadata)) args.push('--disable-image-metadata')
  if (body.backendAssignment) args.push('--backend', String(body.backendAssignment))
  if (body.paramsBackendAssignment) args.push('--params-backend', String(body.paramsBackendAssignment))
  if (body.threads && Number(body.threads) > 0) args.push('--threads', String(body.threads))
  if (body.maxVram && Number(body.maxVram) !== 0) args.push('--max-vram', String(body.maxVram))
  if (body.chromaT5MaskPad && Number(body.chromaT5MaskPad) > 0) args.push('--chroma-t5-mask-pad', String(body.chromaT5MaskPad))
}

export function addPromptModelExtras(ctx: AppContext, args: string[], body: JsonObject, prompt = ''): void {
  const embeddingsDir = path.join(ctx.paths.modelsDir, 'embeddings')
  if (fs.existsSync(embeddingsDir)) args.push('--embd-dir', embeddingsDir)
  if (prompt.includes('<lora:')) args.push('--lora-model-dir', path.join(ctx.paths.modelsDir, 'loras'))
  if (body.quantizationType) args.push('--type', String(body.quantizationType))
  if (body.tensorTypeRules) args.push('--tensor-type-rules', String(body.tensorTypeRules))
}
