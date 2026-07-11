import fs from 'fs'
import path from 'path'
import type { AppContext, JsonObject } from './types'
import { firstString, modelDirectory, modelPath } from './utils'
import {
  addGenerationArgs as addGenerationArgsPure,
  addHardwareArgs as addHardwareArgsPure,
  addOptionalArgs as addOptionalArgsPure,
  pushArg as pushArgPure
} from '../shared/sdArgHelpers'

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

export const pushArg = pushArgPure

export function addGenerationArgs(
  args: string[],
  body: JsonObject,
  outputPath: string,
  defaults: { width: number; height: number; cfg: number; multiple: number }
): void {
  addGenerationArgsPure(args, body, outputPath, defaults)
}

export function addOptionalArgs(args: string[], body: JsonObject): void {
  addOptionalArgsPure(args, body)
}

export function addHardwareArgs(args: string[], body: JsonObject, prompt = ''): void {
  addHardwareArgsPure(args, body, prompt)
}

export function addPromptModelExtras(
  ctx: AppContext,
  args: string[],
  body: JsonObject,
  prompt = ''
): void {
  const embeddingsDir = modelDirectory(ctx, 'embeddings')
  if (fs.existsSync(embeddingsDir)) args.push('--embd-dir', embeddingsDir)
  if (prompt.includes('<lora:')) args.push('--lora-model-dir', modelDirectory(ctx, 'loras'))
  pushArg(args, '--type', body.quantizationType)
  pushArg(args, '--tensor-type-rules', body.tensorTypeRules)
}
