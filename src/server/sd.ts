import fs from 'fs'
import path from 'path'
import type { AppContext, JsonObject } from './types'
import { firstString, modelDirectory, modelPath } from './utils'
import {
  addAdetailerArgs as addAdetailerArgsPure,
  addGenerationArgs as addGenerationArgsPure,
  addHardwareArgs as addHardwareArgsPure,
  addOptionalArgs as addOptionalArgsPure,
  pushArg as pushArgPure
} from '../shared/sdArgHelpers'
import { listLoraFiles, loraLookupNames, normalizeLoraName } from '../shared/loraFiles'

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

  // Primary weights: standard uses -m; flow/split uses --diffusion-model (+ optional dual streams)
  if (loadMode === 'split') {
    pushModelArg(ctx, args, '--diffusion-model', 'diffusion', diffusionModel)
    pushModelArg(
      ctx,
      args,
      '--high-noise-diffusion-model',
      'diffusion',
      firstString(body.highNoiseDiffusionModel, body.high_noise_diffusion_model)
    )
    pushModelArg(
      ctx,
      args,
      '--uncond-diffusion-model',
      'uncond_diffusion',
      firstString(body.uncondDiffusionModel, body.uncond_diffusion_model)
    )
  } else {
    pushModelArg(ctx, args, '-m', 'diffusion', diffusionModel)
  }

  // Companion weights — always wire whatever the UI selected (both load modes)
  const companions: Array<[string, string, string | undefined]> = [
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
  companions.forEach(([flag, subdir, file]) => pushModelArg(ctx, args, flag, subdir, file))
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

/**
 * Resolve ADetailer detector under models/adetailer and append --ad-* flags.
 * `requireEnabled` true for post-gen; false for standalone -M adetailer.
 */
export function addAdetailerArgs(
  ctx: AppContext,
  args: string[],
  body: JsonObject,
  options?: { requireEnabled?: boolean }
): void {
  const name = firstString(
    body.adetailerModel,
    body.ad_model,
    body.adModel,
    body.adetailerModelPath,
    body.ad_model_path
  )
  const resolved = name ? modelPath(ctx, 'adetailer', name) : undefined
  const bodyWithPath: JsonObject = resolved
    ? { ...body, adetailerModelPath: resolved, adetailerModel: resolved }
    : { ...body }
  addAdetailerArgsPure(args, bodyWithPath, options)
}

/** Collect LoRA base names from prompt tokens and body.loras (no extension). */
export function collectLoraNames(body: JsonObject, prompt = ''): string[] {
  const names = new Set<string>()
  for (const match of prompt.matchAll(/<lora:(?:\|high_noise\|)?([^:>]+):/gi)) {
    const name = normalizeLoraName(match[1] || '')
    if (name) names.add(name)
  }
  if (Array.isArray(body.loras)) {
    for (const entry of body.loras) {
      if (!entry || typeof entry !== 'object') continue
      const name = normalizeLoraName(String((entry as { path?: string }).path || ''))
      if (name) names.add(name)
    }
  }
  return [...names]
}

/**
 * Ensure each requested LoRA exists under the configured LoRA directory.
 * Throws a clear Error so the UI does not surface a vague write EPIPE.
 */
export function assertLoraFilesPresent(ctx: AppContext, body: JsonObject, prompt = ''): void {
  const names = collectLoraNames(body, prompt)
  if (!names.length) return

  const loraDir = path.resolve(modelDirectory(ctx, 'loras'))
  if (!fs.existsSync(loraDir)) {
    throw new Error(
      `LoRA directory missing: ${loraDir}. Choose or create the LoRA folder in Settings > Storage.`
    )
  }

  let onDisk: string[] = []
  try {
    onDisk = listLoraFiles(loraDir)
  } catch (error) {
    throw new Error(
      `Cannot read LoRA directory ${loraDir}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const basenames = loraLookupNames(onDisk)

  const missing = names.filter((name) => !basenames.has(name))
  if (!missing.length) return

  // Linux-friendly: hint if only case differs
  const lowerMap = new Map([...basenames].map((b) => [b.toLowerCase(), b] as const))
  const caseHints = missing
    .map((m) => {
      const alt = lowerMap.get(m.toLowerCase())
      return alt && alt !== m ? `"${m}" (found as "${alt}" — Linux is case-sensitive)` : null
    })
    .filter(Boolean)

  const detail = caseHints.length
    ? caseHints.join('; ')
    : `Missing: ${missing.join(', ')}. Files in ${loraDir}: ${onDisk.slice(0, 12).join(', ') || '(empty)'}`

  throw new Error(
    `LoRA file not found under ${loraDir}. ${detail}. Add the file to the configured LoRA folder and re-select it.`
  )
}

/** Ensure sd-cli / sd-server is executable (Linux/AppImage extracts sometimes drop +x). */
export function ensureBinaryExecutable(filePath: string): void {
  if (process.platform === 'win32') return
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
  } catch {
    try {
      fs.chmodSync(filePath, 0o755)
    } catch (error) {
      console.warn(
        '[Backend] Could not chmod binary:',
        filePath,
        error instanceof Error ? error.message : error
      )
    }
  }
}

export function addPromptModelExtras(
  ctx: AppContext,
  args: string[],
  body: JsonObject,
  prompt = ''
): void {
  const embeddingsDir = modelDirectory(ctx, 'embeddings')
  if (fs.existsSync(embeddingsDir)) args.push('--embd-dir', embeddingsDir)
  // Prompt tokens and/or explicit loras list both need the model dir (absolute for Linux)
  const hasLoraList = Array.isArray(body.loras) && body.loras.length > 0
  if (prompt.includes('<lora:') || hasLoraList) {
    args.push('--lora-model-dir', path.resolve(modelDirectory(ctx, 'loras')))
  }
  pushArg(args, '--type', body.quantizationType)
  pushArg(args, '--tensor-type-rules', body.tensorTypeRules)
}
