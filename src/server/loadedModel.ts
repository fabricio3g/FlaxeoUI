import fs from 'fs'
import path from 'path'
import type { AppContext, JsonObject } from './types'
import { appendLog, errorMessage, firstString, modelDirectory, spawnLoggedProcess } from './utils'
import {
  addHardwareArgs,
  addModelArgs,
  ensureBinaryExecutable,
  getSdServerPath,
  pushArg
} from './sd'
import { addOptionalArgs } from '../shared/sdArgHelpers'
import { phaseLabel } from '../shared/generationPhases'
import { cliOnlyReason, imgGenRequest, loraName } from '../shared/sdServerRequest'

/**
 * "Keep the model loaded": image runs go to sd.cpp's sd-server, which keeps the weights in
 * memory between runs. The server decides per request, so the desktop and paired LAN devices
 * take the same path. sd-server loads lazily with the request's model stack and restarts when
 * a request needs another stack; anything sd-server cannot do runs through sd-cli as before.
 */

const PORT = 1234
const BASE = `http://127.0.0.1:${PORT}`
/** Loading a large model from disk can take minutes. */
const LOAD_TIMEOUT_MS = 10 * 60_000

/** sd-cli flags from addOptionalArgs that sd-server takes at start, not per request. */
const LOAD_TIME_FLAGS = new Set([
  '--lora-apply-mode',
  '--vae-tile-size',
  '--rng',
  '--sampler-rng',
  '--prediction',
  '--vae-format'
])

export interface LoadedModelState {
  /** Load-time argv (model files + hardware); a request with the same key reuses the process */
  key: string
  model: string
  status: 'loading' | 'ready' | 'failed'
  error: string
  loadedAt: number
}

let current: LoadedModelState | null = null
/** Set when the installed sd-server has no native /sdcpp/v1 API (older builds). */
let unsupportedVersion = ''

export function keepModelLoaded(ctx: AppContext): boolean {
  return ctx.state.backendConfig.keepModelLoaded === true
}

export function loadedModelStatus(ctx: AppContext): {
  enabled: boolean
  running: boolean
  status: LoadedModelState['status'] | 'idle'
  model: string
  error: string
  unsupported: boolean
} {
  const running = !!ctx.state.sdProcess
  return {
    enabled: keepModelLoaded(ctx),
    running,
    status: running && current ? current.status : current?.status === 'failed' ? 'failed' : 'idle',
    model: running ? current?.model || '' : '',
    error: current?.error || '',
    unsupported: unsupportedVersion === ctx.state.backendConfig.activeVersion
  }
}

function loadArgs(ctx: AppContext, body: JsonObject): string[] {
  const args: string[] = []
  addModelArgs(ctx, args, body)
  addHardwareArgs(args, body, String(body.prompt || ''))
  const optional: string[] = []
  addOptionalArgs(optional, body)
  for (let i = 0; i < optional.length; i++) {
    if (!LOAD_TIME_FLAGS.has(optional[i])) continue
    const value = optional[i + 1]
    args.push(optional[i])
    if (value !== undefined && !value.startsWith('--')) args.push(value)
  }
  const embeddings = modelDirectory(ctx, 'embeddings')
  if (fs.existsSync(embeddings)) args.push('--embd-dir', embeddings)
  args.push('--lora-model-dir', path.resolve(modelDirectory(ctx, 'loras')))
  pushArg(args, '--type', body.quantizationType)
  pushArg(args, '--tensor-type-rules', body.tensorTypeRules)
  return args
}

async function serverJson<T>(
  method: 'GET' | 'POST',
  route: string,
  body?: unknown
): Promise<{ status: number; data: T | null }> {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  let data: T | null = null
  try {
    data = text ? (JSON.parse(text) as T) : null
  } catch {
    /* plain-text error page */
  }
  if (!response.ok && response.status !== 404 && response.status !== 202)
    throw new Error(
      (data as { error?: { message?: string } } | null)?.error?.message ||
        text ||
        response.statusText
    )
  return { status: response.status, data }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function emitPhase(ctx: AppContext, label: string, phase: 'loading_diffusion' | 'sampling'): void {
  const now = Date.now()
  ctx.state.progress = {
    current: ctx.state.progress?.current ?? 0,
    total: ctx.state.progress?.total ?? 0,
    itPerSec: 0,
    label,
    startedAt: ctx.state.progress?.startedAt ?? now,
    updatedAt: now,
    phase,
    phaseLabel: phase === 'loading_diffusion' ? 'Loading model (kept loaded)' : phaseLabel(phase),
    owner: ctx.state.activeOwner ?? undefined
  }
  ctx.state.progressBus.emit('progress', ctx.state.progress)
}

export function stopLoadedModel(ctx: AppContext, reason: string): void {
  if (!ctx.state.sdProcess) return
  appendLog(ctx, `[Loaded model] unloading: ${reason}\n`)
  const child = ctx.state.sdProcess
  exiting = new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    child.once('close', () => resolve())
    // Never block a run on a process that ignores the signal
    setTimeout(resolve, 5000)
  })
  child.kill()
  ctx.state.sdProcess = null
  current = null
}

/** Resolves once the last unloaded sd-server has exited and freed its port and memory. */
let exiting: Promise<void> = Promise.resolve()

/** Start (or reuse) sd-server with this request's model stack and wait until it is ready. */
async function ensureLoaded(ctx: AppContext, body: JsonObject, label: string): Promise<boolean> {
  const args = loadArgs(ctx, body)
  const key = args.join('\u0000')
  if (ctx.state.sdProcess && current?.key === key && current.status === 'ready') return true
  // Same stack failed to load before: do not retry on every run.
  if (!ctx.state.sdProcess && current?.key === key && current.status === 'failed') return false

  stopLoadedModel(ctx, 'a run needs another model')
  // The old process must be gone, or it could answer the new one's ready check.
  await exiting
  const model = firstString(body.diffusionModel, body.diffusion_model) || 'model'
  current = { key, model, status: 'loading', error: '', loadedAt: 0 }
  const state = current
  const binary = getSdServerPath(ctx)
  ensureBinaryExecutable(binary)
  emitPhase(ctx, label, 'loading_diffusion')
  const child = spawnLoggedProcess(
    ctx,
    binary,
    ['--listen-port', String(PORT), ...args, '-v'],
    'SD-SERVER',
    {
      cwd: ctx.getActiveBackendPath()
    }
  )
  ctx.state.sdProcess = child
  let exited = false
  child.on('close', (code) => {
    exited = true
    if (ctx.state.sdProcess === child) ctx.state.sdProcess = null
    if (state.status !== 'ready') {
      state.status = 'failed'
      state.error ||= `sd-server stopped while loading (exit ${code})`
    }
    appendLog(ctx, `[Loaded model] sd-server exited: ${code}\n`)
  })

  const deadline = Date.now() + LOAD_TIMEOUT_MS
  while (Date.now() < deadline && !exited) {
    if (ctx.state.cliCancelRequested) {
      stopLoadedModel(ctx, 'cancelled while loading')
      return false
    }
    try {
      const { status, data } = await serverJson<{ state?: string; error?: unknown }>(
        'GET',
        '/sdcpp/v1/models/status'
      )
      if (status === 404) {
        // Older sd-server without the native API: remember it and use sd-cli.
        unsupportedVersion = ctx.state.backendConfig.activeVersion
        state.status = 'failed'
        state.error = 'This sd.cpp build is too old to keep models loaded. Update the engine.'
        stopLoadedModel(ctx, state.error)
        return false
      }
      if (data?.state === 'ready' || data?.state === undefined) {
        state.status = 'ready'
        state.loadedAt = Date.now()
        appendLog(ctx, `[Loaded model] ready: ${model}\n`)
        return true
      }
      if (data.state === 'error')
        throw new Error(errorMessage(data.error) || 'sd-server failed to load the model')
    } catch (error) {
      // Connection refused while it loads; real load errors end the wait.
      if (!/fetch failed|ECONNREFUSED|ECONNRESET/i.test(errorMessage(error))) {
        state.status = 'failed'
        state.error = errorMessage(error)
        stopLoadedModel(ctx, state.error)
        return false
      }
    }
    await sleep(500)
  }
  if (!exited) stopLoadedModel(ctx, 'timed out while loading')
  state.status = 'failed'
  state.error ||= 'sd-server did not finish loading the model in time.'
  return false
}

function imageData(file: string | undefined): string | undefined {
  if (!file || !fs.existsSync(file)) return undefined
  return fs.readFileSync(file).toString('base64')
}

/** LoRA catalog ids as sd-server knows them, keyed by bare name. */
async function loraCatalog(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const { data } = await serverJson<{ loras?: Array<{ path?: string; name?: string } | string> }>(
      'GET',
      '/sdcpp/v1/capabilities'
    )
    for (const entry of data?.loras || []) {
      const id = typeof entry === 'string' ? entry : entry.path || entry.name || ''
      if (id) map.set(loraName(id), id)
    }
  } catch {
    /* names pass through unchanged */
  }
  return map
}

interface JobResponse {
  id?: string
  status?: string
  error?: { message?: string } | null
  result?: { images?: Array<{ b64_json?: string }> }
  preview?: { step?: number; total_steps?: number; b64_json?: string } | null
}

/**
 * Run one image request on the loaded model. Returns null when it should go to sd-cli
 * instead (not enabled, unsupported options, or the model could not be loaded).
 */
export async function runOnLoadedModel(
  ctx: AppContext,
  body: JsonObject,
  inputs: { init?: string; mask?: string; refs: string[] },
  writeOutputs: (images: Buffer[]) => Promise<string[]>,
  label: string
): Promise<{ cancelled: boolean; filenames: string[] } | null> {
  if (!keepModelLoaded(ctx)) return null
  if (unsupportedVersion && unsupportedVersion === ctx.state.backendConfig.activeVersion)
    return null
  const reason = cliOnlyReason(body)
  if (reason) {
    appendLog(ctx, `[Loaded model] ${reason} runs through sd-cli\n`)
    return null
  }

  const startedAt = Date.now()
  ctx.state.progress = null
  ctx.state.progressBus.emit('start', {
    label,
    startedAt,
    owner: ctx.state.activeOwner ?? undefined
  })
  try {
    if (!(await ensureLoaded(ctx, body, label))) {
      if (ctx.state.cliCancelRequested) return { cancelled: true, filenames: [] }
      appendLog(ctx, `[Loaded model] ${current?.error || 'not available'}; using sd-cli\n`)
      return null
    }
    const request = imgGenRequest(
      body,
      {
        init: imageData(inputs.init),
        mask: imageData(inputs.mask),
        refs: inputs.refs.map(imageData).filter((x): x is string => !!x)
      },
      (Array.isArray(body.loras) && body.loras.length) ||
        String(body.prompt || '').includes('<lora:')
        ? await loraCatalog()
        : new Map()
    )
    const { data: job } = await serverJson<JobResponse>('POST', '/sdcpp/v1/img_gen', request)
    if (!job?.id) throw new Error('sd-server did not accept the job')
    emitPhase(ctx, label, 'sampling')

    let cancelSent = false
    for (;;) {
      await sleep(400)
      if (ctx.state.cliCancelRequested && !cancelSent) {
        cancelSent = true
        await serverJson('POST', `/sdcpp/v1/jobs/${job.id}/cancel`, {}).catch(() => undefined)
      }
      const { data } = await serverJson<JobResponse>('GET', `/sdcpp/v1/jobs/${job.id}`)
      if (!data) throw new Error('The sd-server job disappeared')
      if (data.preview?.total_steps) {
        ctx.state.progress = {
          current: data.preview.step || 0,
          total: data.preview.total_steps,
          itPerSec: 0,
          label,
          startedAt,
          updatedAt: Date.now(),
          phase: 'sampling',
          phaseLabel: phaseLabel('sampling'),
          owner: ctx.state.activeOwner ?? undefined
        }
        ctx.state.progressBus.emit('progress', ctx.state.progress)
      }
      if (data.preview?.b64_json) {
        ctx.state.previewImageBuffer = Buffer.from(data.preview.b64_json, 'base64')
        ctx.state.previewEtag = `"srv-${data.preview.step || 0}"`
      }
      if (data.status === 'cancelled') return { cancelled: true, filenames: [] }
      if (data.status === 'failed')
        throw new Error(data.error?.message || 'sd-server generation failed')
      if (data.status === 'completed') {
        const images: Buffer[] = (data.result?.images || [])
          .filter((image) => !!image.b64_json)
          .map((image) => Buffer.from(image.b64_json as string, 'base64'))
        if (!images.length) throw new Error('Generation failed - no output image')
        return { cancelled: false, filenames: await writeOutputs(images) }
      }
    }
  } catch (error) {
    // A dropped connection means sd-server died mid-run (usually out of memory).
    if (/fetch failed|ECONNREFUSED|ECONNRESET/i.test(errorMessage(error))) {
      const tail = ctx.state.serverLogs.slice(-12).join('').trim()
      stopLoadedModel(ctx, 'sd-server stopped during a run')
      throw new Error(`sd-server stopped during the run.\n${tail}`)
    }
    throw error
  } finally {
    ctx.state.progress = null
    ctx.state.previewImageBuffer = null
    ctx.state.progressBus.emit('end', {})
  }
}
