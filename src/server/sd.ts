import fs from 'fs'
import path from 'path'
import type { AppContext, JsonObject } from './types'
import { asBool, firstString, modelDirectory, modelPath, roundTo } from './utils'

export function getSdCliPath(ctx: AppContext): string {
  return getBackendBinaryPath(ctx, 'sd-cli')
}

export function getSdServerPath(ctx: AppContext): string {
  return getBackendBinaryPath(ctx, 'sd-server')
}

function getBackendBinaryPath(ctx: AppContext, name: string): string {
  return path.join(ctx.getActiveBackendPath(), process.platform === 'win32' ? `${name}.exe` : name)
}

export function backendHasBinaries(dir: string): boolean {
  const hasServer =
    fs.existsSync(path.join(dir, 'sd-server')) || fs.existsSync(path.join(dir, 'sd-server.exe'))
  const hasCli =
    fs.existsSync(path.join(dir, 'sd-cli')) || fs.existsSync(path.join(dir, 'sd-cli.exe'))
  return hasServer && hasCli
}

export function addModelArgs(ctx: AppContext, args: string[], body: JsonObject): void {
  const loadMode = firstString(body.loadMode) || 'standard'
  const diffusionModel = firstString(body.diffusionModel, body.diffusion_model)
  const vae = firstString(body.vae, body.vaeModel)

  if (loadMode === 'split') {
    const pairs: Array<[string, string, string | undefined]> = [
      ['--diffusion-model', 'diffusion', diffusionModel],
      [
        '--high-noise-diffusion-model',
        'diffusion',
        firstString(body.highNoiseDiffusionModel, body.high_noise_diffusion_model)
      ],
      [
        '--uncond-diffusion-model',
        'uncond_diffusion',
        firstString(body.uncondDiffusionModel, body.uncond_diffusion_model)
      ],
      ['--clip_l', 'clip', firstString(body.clipL, body.clip_l)],
      ['--clip_g', 'clip', firstString(body.clipG, body.clip_g)],
      ['--clip_vision', 'clip_vision', firstString(body.clipVision, body.clip_vision)],
      ['--t5xxl', 't5xxl', firstString(body.t5xxl)],
      ['--llm', 'llm', firstString(body.llm)],
      ['--llm_vision', 'llm_vision', firstString(body.llmVision, body.llm_vision)],
      [
        '--embeddings-connectors',
        'embeddings_connectors',
        firstString(body.embeddingsConnectors, body.embeddings_connectors)
      ],
      ['--audio-vae', 'audio_vae', firstString(body.audioVae, body.audio_vae)],
      ['--vae', 'vae', vae]
    ]
    pairs.forEach(([flag, subdir, file]) => pushModelArg(ctx, args, flag, subdir, file))
  } else {
    pushModelArg(ctx, args, '-m', 'diffusion', diffusionModel)
    pushModelArg(ctx, args, '--vae', 'vae', vae)
  }
}

export function pushModelArg(
  ctx: AppContext,
  args: string[],
  flag: string,
  subdir: string,
  file?: string
): void {
  const resolved = modelPath(ctx, subdir, file)
  if (resolved) args.push(flag, resolved)
}

export function pushArg(args: string[], flag: string, value: unknown): void {
  if (value) args.push(flag, String(value))
}

function pushNumericArg(
  args: string[],
  flag: string,
  value: unknown,
  predicate: (value: number) => boolean
): void {
  if (!value) return
  const numberValue = Number(value)
  if (predicate(numberValue)) args.push(flag, String(value))
}

function pushBoolArg(args: string[], flag: string, value: unknown): void {
  if (asBool(value)) args.push(flag)
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
  const seed = body.seed === '' || body.seed == null ? -1 : body.seed
  args.push('-s', String(seed))
  args.push('-o', outputPath)
}

export function addOptionalArgs(args: string[], body: JsonObject): void {
  const clipSkip = body.clip_skip ?? body.clipSkip
  pushArg(args, '--guidance', body.guidance)
  if (clipSkip && parseInt(String(clipSkip), 10) !== -1) pushArg(args, '--clip-skip', clipSkip)
  pushArg(args, '--scheduler', body.scheduler)
  pushArg(args, '--sampling-method', body.samplingMethod)
  pushArg(args, '--lora-apply-mode', body.loraApplyMode)
  pushNumericArg(args, '--vae-tile-size', body.vaeTileSize, (value) => value > 0)
  pushArg(args, '--rng', body.rngType)
  pushArg(args, '--sampler-rng', body.samplerRngType)
  pushArg(args, '--prediction', body.predictionType)
  pushArg(args, '--vae-format', body.vaeFormat)
  pushNumericArg(args, '--flow-shift', body.flowShift, (value) => value !== 0)
  pushNumericArg(args, '--eta', body.eta, (value) => value !== 0)
  pushNumericArg(args, '--slg-scale', body.slgScale, (value) => value !== 0)
  pushNumericArg(args, '--skip-layer-start', body.skipLayerStart, (value) => value !== 0.01)
  pushNumericArg(args, '--skip-layer-end', body.skipLayerEnd, (value) => value !== 0.2)
  pushArg(args, '--skip-layers', body.skipLayers)
  pushArg(args, '--sigmas', body.sigmas)
  pushNumericArg(args, '--img-cfg-scale', body.imgCfgScale, (value) => value > 0)
  pushArg(args, '--extra-sample-args', body.extraSampleArgs)
  pushArg(args, '--extra-tiling-args', body.extraTilingArgs)
  pushArg(args, '--cache-mode', body.cacheMode)
  pushArg(args, '--cache-option', body.cacheOption)
  pushArg(args, '--scm-mask', body.scmMask)
  pushArg(args, '--scm-policy', body.scmPolicy)
}

export function addHardwareArgs(args: string[], body: JsonObject, prompt = ''): void {
  if (!prompt.includes('<lora:')) pushBoolArg(args, '--diffusion-fa', body.diffusionFa)
  pushBoolArg(args, '--vae-tiling', body.vaeTiling)
  pushBoolArg(args, '--clip-on-cpu', body.clipOnCpu)
  pushBoolArg(args, '--vae-on-cpu', body.vaeOnCpu)
  pushBoolArg(args, '--control-net-cpu', body.controlNetOnCpu)
  pushBoolArg(args, '--offload-to-cpu', body.offloadToCpu)
  pushBoolArg(args, '--diffusion-conv-direct', body.diffusionConvDirect)
  pushBoolArg(args, '--vae-conv-direct', body.vaeConvDirect)
  pushBoolArg(args, '--force-sdxl-vae-conv-scale', body.forceSDXLVaeConvScale)
  pushBoolArg(args, '--stream-layers', body.streamLayers)
  pushBoolArg(args, '--mmap', body.mmap)
  pushBoolArg(args, '--circular', body.circular)
  pushBoolArg(args, '--circularx', body.circularX)
  pushBoolArg(args, '--circulary', body.circularY)
  pushBoolArg(args, '--qwen-image-zero-cond-t', body.qwenImageZeroCondT)
  pushBoolArg(args, '--chroma-enable-t5-mask', body.chromaEnableT5Mask)
  pushBoolArg(args, '--chroma-disable-dit-mask', body.chromaDisableDitMask)
  pushBoolArg(args, '--disable-image-metadata', body.disableImageMetadata)
  if (!asBool(body.autoFit)) {
    pushArg(args, '--backend', body.backendAssignment)
    pushArg(args, '--params-backend', body.paramsBackendAssignment)
  }
  pushBoolArg(args, '--auto-fit', body.autoFit)
  pushArg(args, '--split-mode', body.splitMode)
  pushNumericArg(args, '--threads', body.threads, (value) => value > 0)
  pushNumericArg(args, '--max-vram', body.maxVram, (value) => value !== 0)
  pushNumericArg(args, '--chroma-t5-mask-pad', body.chromaT5MaskPad, (value) => value > 0)
}

export function addPromptModelExtras(
  ctx: AppContext,
  args: string[],
  body: JsonObject,
  prompt = ''
): void {
  const embeddingsDir = modelDirectory(ctx, 'embeddings')
  if (fs.existsSync(embeddingsDir)) args.push('--embd-dir', embeddingsDir)
  if (prompt.includes('<lora:'))
    args.push('--lora-model-dir', modelDirectory(ctx, 'loras'))
  pushArg(args, '--type', body.quantizationType)
  pushArg(args, '--tensor-type-rules', body.tensorTypeRules)
}
