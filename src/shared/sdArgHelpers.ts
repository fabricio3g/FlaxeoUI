/**
 * Pure CLI argument helpers (no filesystem) — unit-tested without spawning sd-cli.
 */

export function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1
}

export function pushArg(args: string[], flag: string, value: unknown): void {
  if (value) args.push(flag, String(value))
}

export function pushNumericArg(
  args: string[],
  flag: string,
  value: unknown,
  predicate: (value: number) => boolean
): void {
  if (value === '' || value == null || value === false) return
  // Allow 0 and negatives when predicate accepts them (e.g. max-vram -1)
  if (value === 0 || value === '0') {
    const numberValue = 0
    if (predicate(numberValue)) args.push(flag, String(value))
    return
  }
  if (value === false) return
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return
  // Skip plain falsy non-numeric empties already handled; keep -1
  if (predicate(numberValue)) args.push(flag, String(value))
}

export function pushBoolArg(args: string[], flag: string, value: unknown): void {
  if (asBool(value)) args.push(flag)
}

export function roundTo(value: unknown, fallback: number, multiple: number): number {
  const parsed = Number(value)
  return Math.round((Number.isFinite(parsed) ? parsed : fallback) / multiple) * multiple
}

/**
 * Resolve denoise strength for inpaint / img2img stages.
 * Prefers `strength`, then `img2imgStrength`; defaults to sd-cli 0.75.
 */
export function resolveInpaintStrength(body: Record<string, unknown>, fallback = 0.75): number {
  const candidates = [body.strength, body.img2imgStrength]
  for (const candidate of candidates) {
    if (candidate === '' || candidate == null) continue
    const parsed = Number(candidate)
    if (Number.isFinite(parsed)) return Math.min(1, Math.max(0, parsed))
  }
  return fallback
}

export function addGenerationArgs(
  args: string[],
  body: Record<string, unknown>,
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

export function addOptionalArgs(args: string[], body: Record<string, unknown>): void {
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

/**
 * Build comma-separated --extra-ad-args from structured ADetailer fields.
 * Only emits non-default / meaningful values so CLI inherits the rest.
 */
export function buildExtraAdArgs(body: Record<string, unknown>): string | undefined {
  const parts: string[] = []

  const pushKv = (key: string, value: unknown, skip?: (n: number) => boolean): void => {
    if (value === '' || value == null || value === false) return
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) {
      const n = Number(value)
      if (Number.isFinite(n) && skip?.(n)) return
      parts.push(`${key}=${value}`)
      return
    }
    if (typeof value === 'string' && value.trim()) parts.push(`${key}=${value.trim()}`)
  }

  // Always pass the common knobs when present (UI supplies defaults)
  pushKv('confidence', body.adetailerConfidence ?? body.ad_confidence)
  pushKv('denoising_strength', body.adetailerDenoisingStrength ?? body.ad_denoising_strength)
  pushKv('inpaint_padding', body.adetailerInpaintPadding ?? body.ad_inpaint_padding)
  pushKv('mask_blur', body.adetailerMaskBlur ?? body.ad_mask_blur)
  pushKv('inpaint_width', body.adetailerInpaintWidth ?? body.ad_inpaint_width, (n) => n <= 0)
  pushKv('inpaint_height', body.adetailerInpaintHeight ?? body.ad_inpaint_height, (n) => n <= 0)
  pushKv('mask_k_largest', body.adetailerMaskKLargest ?? body.ad_mask_k_largest, (n) => n === 0)

  const maskMode = String(body.adetailerMaskMode ?? body.ad_mask_mode ?? '').trim()
  if (maskMode && maskMode !== 'none') parts.push(`mask_mode=${maskMode}`)

  const sortBy = String(body.adetailerSortBy ?? body.ad_sort_by ?? '').trim()
  if (sortBy && sortBy !== 'none') parts.push(`sort_by=${sortBy}`)

  const extra = String(body.adetailerExtraArgs ?? body.extra_ad_args ?? body.extraAdArgs ?? '').trim()
  if (extra) {
    // Allow free-form "k=v,k2=v2" tail without duplicating keys already set
    const existingKeys = new Set(parts.map((p) => p.split('=')[0]))
    for (const chunk of extra.split(',')) {
      const piece = chunk.trim()
      if (!piece) continue
      const eq = piece.indexOf('=')
      const key = eq === -1 ? piece : piece.slice(0, eq).trim()
      if (!key || existingKeys.has(key)) continue
      parts.push(piece.includes('=') ? `${key}=${piece.slice(eq + 1).trim()}` : piece)
      existingKeys.add(key)
    }
  }

  return parts.length ? parts.join(',') : undefined
}

/**
 * Append ADetailer flags when enabled and a detector model path (or filename) is provided.
 * Server should resolve filename → absolute path and pass `adetailerModelPath` or set
 * `adetailerModel` to the resolved path before calling this helper.
 *
 * When `requireEnabled` is false (standalone -M adetailer), only a model path is required.
 */
export function addAdetailerArgs(
  args: string[],
  body: Record<string, unknown>,
  options?: { requireEnabled?: boolean }
): void {
  const requireEnabled = options?.requireEnabled !== false
  const enabled = asBool(body.adetailerEnabled ?? body.ad_enabled)
  if (requireEnabled && !enabled) return

  const modelPath =
    firstNonEmpty(
      body.adetailerModelPath,
      body.ad_model_path,
      body.adetailerModel,
      body.ad_model,
      body.adModel
    ) || ''
  if (!modelPath) return

  args.push('--ad-model', modelPath)

  const adPrompt = body.adetailerPrompt ?? body.ad_prompt ?? body.adPrompt
  if (adPrompt != null && String(adPrompt).length > 0) {
    args.push('--ad-prompt', String(adPrompt))
  }

  const adNeg = body.adetailerNegativePrompt ?? body.ad_negative_prompt ?? body.adNegativePrompt
  if (adNeg != null && String(adNeg).length > 0) {
    args.push('--ad-negative-prompt', String(adNeg))
  }

  const extra = buildExtraAdArgs(body)
  if (extra) args.push('--extra-ad-args', extra)
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value == null || value === false) continue
    const s = String(value).trim()
    if (s) return s
  }
  return undefined
}

export function addHardwareArgs(args: string[], body: Record<string, unknown>, prompt = ''): void {
  // Flash attention stays enabled with LoRA (critical for Anima/Vulkan iGPU).
  // Default true when UI leaves diffusionFa unset.
  const diffusionFa = body.diffusionFa === undefined || body.diffusionFa === null || body.diffusionFa === ''
    ? true
    : body.diffusionFa
  pushBoolArg(args, '--diffusion-fa', diffusionFa)
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
  // --split-mode is llama.cpp-only; do not pass to sd-cli
  pushNumericArg(args, '--threads', body.threads, (value) => value > 0)
  pushNumericArg(args, '--max-vram', body.maxVram, (value) => value !== 0)
  pushNumericArg(args, '--chroma-t5-mask-pad', body.chromaT5MaskPad, (value) => value > 0)
  void prompt
}
