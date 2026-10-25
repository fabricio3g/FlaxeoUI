/**
 * Maps a generation payload (the body sd-cli runs are built from) onto sd-server's native
 * `POST /sdcpp/v1/img_gen` request, so a run on the kept-loaded model gets the same settings
 * as the same run through sd-cli. Pure: the server reads images and talks to sd-server.
 */

type Body = Record<string, unknown>

export interface ServerImages {
  /** base64 image data */
  init?: string
  mask?: string
  refs: string[]
}

export interface ServerLora {
  path: string
  multiplier: number
  is_high_noise?: boolean
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const num = (value: unknown): number | undefined => {
  if (value === '' || value == null || typeof value === 'boolean') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

const on = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1'

const LORA_TAG = /<lora:(\|high_noise\|)?([^:>]+)(?::([^>]*))?>/gi

/** Bare LoRA name: no folder, no extension. */
export function loraName(value: string): string {
  return (value.split(/[\\/]/).pop() || '').replace(/\.(safetensors|ckpt|pt|bin|gguf)$/i, '').trim()
}

/**
 * sd-server rejects `<lora:…>` prompt tags; the same LoRAs go in its structured list.
 * Tags win over the body list for strength (they are what sd-cli would apply).
 */
export function splitLoraTags(
  prompt: string,
  listed: unknown
): { prompt: string; loras: ServerLora[] } {
  const byName = new Map<string, ServerLora>()
  if (Array.isArray(listed)) {
    for (const entry of listed as Array<{ path?: string; strength?: unknown; target?: string }>) {
      const name = loraName(String(entry?.path || ''))
      if (!name) continue
      byName.set(name, {
        path: name,
        multiplier: num(entry.strength) ?? 1,
        ...(entry.target === 'high_noise' ? { is_high_noise: true } : {})
      })
    }
  }
  const stripped = prompt.replace(
    LORA_TAG,
    (_tag, highNoise: string | undefined, name: string, weight: string | undefined) => {
      const key = loraName(name)
      if (key)
        byName.set(key, {
          path: key,
          multiplier: num(weight) ?? 1,
          ...(highNoise ? { is_high_noise: true } : {})
        })
      return ''
    }
  )
  return {
    prompt: stripped
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.])/g, '$1')
      .trim(),
    loras: [...byName.values()]
  }
}

/** Why a run has to go through sd-cli, or '' when the loaded model can take it. */
export function cliOnlyReason(body: Body): string {
  if (on(body.videoMode)) return 'video'
  if (on(body.hiresEnabled ?? body.hires)) return 'hi-res fix'
  if (on(body.adetailerEnabled)) return 'face fix'
  if (text(body.photoMaker) || text(body.pulidWeights)) return 'identity reference'
  if (text(body.ipAdapterModel) && text(body.ipAdapterImage)) return 'style reference'
  if (text(body.controlNet)) return 'ControlNet'
  if (text(body.upscaleModel)) return 'upscale after generation'
  if ((num(body.qwenImageLayers) || 0) > 0) return 'image layers'
  if (text(body.extraSampleArgs) || text(body.extraTilingArgs) || on(body.temporalTiling))
    return 'extra sd.cpp arguments'
  let cli = body.cliOptions
  if (typeof cli === 'string') {
    try {
      cli = JSON.parse(cli)
    } catch {
      return 'extra sd.cpp options'
    }
  }
  if (cli && typeof cli === 'object' && Object.keys(cli).length) return 'extra sd.cpp options'
  return ''
}

function skipLayers(value: unknown): number[] | undefined {
  const layers = String(value ?? '')
    .replace(/[[\]\s]/g, '')
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)
  return layers.length ? layers : undefined
}

/** The native img_gen JSON for this payload. `loraIds` maps bare names to sd-server's ids. */
export function imgGenRequest(
  body: Body,
  images: ServerImages,
  loraIds: Map<string, string> = new Map()
): Record<string, unknown> {
  const { prompt, loras } = splitLoraTags(String(body.prompt || ''), body.loras)
  const clipSkip = num(body.clip_skip ?? body.clipSkip)
  const slgScale = num(body.slgScale)
  const sigmas = text(body.sigmas)
  return {
    prompt,
    negative_prompt: String(body.negative_prompt || ''),
    width: num(body.width) ?? 1024,
    height: num(body.height) ?? 1024,
    seed: num(body.seed) ?? -1,
    batch_count: Math.max(1, Math.min(16, num(body.batchCount ?? body.batch_count) ?? 1)),
    clip_skip: clipSkip && clipSkip !== -1 ? clipSkip : undefined,
    strength: images.init ? (num(body.strength ?? body.img2imgStrength) ?? 0.75) : undefined,
    init_image: images.init,
    mask_image: images.mask,
    ref_images: images.refs.length ? images.refs : undefined,
    ref_image_args: images.refs.length ? text(body.refImageArgs) : undefined,
    sample_params: {
      sample_method: text(body.samplingMethod),
      scheduler: text(body.scheduler),
      sample_steps: num(body.steps) ?? 20,
      eta: num(body.eta) || undefined,
      flow_shift: num(body.flowShift) || undefined,
      shifted_timestep: num(body.timestepShift) || undefined,
      custom_sigmas: sigmas ? sigmas.split(',').map(Number).filter(Number.isFinite) : undefined,
      guidance: {
        txt_cfg: num(body.cfg_scale) ?? 7,
        img_cfg: num(body.imgCfgScale) || undefined,
        distilled_guidance: num(body.guidance),
        slg: slgScale
          ? {
              layers: skipLayers(body.skipLayers),
              layer_start: num(body.skipLayerStart),
              layer_end: num(body.skipLayerEnd),
              scale: slgScale
            }
          : undefined
      }
    },
    lora: loras.length
      ? loras.map((l) => ({ ...l, path: loraIds.get(l.path) || l.path }))
      : undefined,
    cache_mode: text(body.cacheMode),
    cache_option: text(body.cacheOption),
    scm_mask: text(body.scmMask),
    scm_policy_dynamic: text(body.scmPolicy) ? body.scmPolicy === 'dynamic' : undefined,
    output_format: 'png'
  }
}
