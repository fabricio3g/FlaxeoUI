/**
 * Shared client → API payload for generation modes.
 * Keeps Text2Image / Edit / Video field names aligned with server arg builders.
 */

import type { GenerationConfig } from '@/stores/config'
import { appendLoraPromptTokens } from '@/lib/promptTokens'
import { resolveRefImageArgsForConfig } from '../../../shared/refImageArgs'

export type GenerationPayload = Record<string, string | number | boolean | object | undefined>

export interface BuildGenerationPayloadOptions {
  prompt: string
  negativePrompt?: string
  /** Override width/height (e.g. inpaint/img2img use source size; Ref Edit uses config; video uses video dims) */
  width?: number
  height?: number
  /** Extra fields merged last (video frames, high-noise, etc.) */
  extra?: GenerationPayload
  /** Skip appending LoRA tokens to prompt (caller already did) */
  skipLoraTokens?: boolean
  /** Skip embedding tokens in prompt */
  skipEmbeddingTokens?: boolean
}

/**
 * Build a flat params object suitable for JSON POST or FormData append.
 */
export function buildGenerationPayload(
  config: GenerationConfig,
  options: BuildGenerationPayloadOptions
): GenerationPayload {
  const c = config
  let finalPrompt = options.prompt

  if (!options.skipEmbeddingTokens && c.embeddings?.length) {
    const embeddingTokens = c.embeddings.map((path) => {
      const filename = path.split(/[\\/]/).pop() || ''
      return '<' + filename.replace(/\.[^/.]+$/, '') + '>'
    })
    finalPrompt = `${finalPrompt} ${embeddingTokens.join(' ')}`.trim()
  }

  if (!options.skipLoraTokens) {
    finalPrompt = appendLoraPromptTokens(finalPrompt, c.loras)
  }

  const diffusionModel = c.loadMode === 'standard' ? c.standardModel : c.diffusionModel

  const params: GenerationPayload = {
    prompt: finalPrompt,
    negative_prompt: options.negativePrompt || '',
    steps: c.steps,
    cfg_scale: c.cfgScale,
    width: options.width ?? c.width,
    height: options.height ?? c.height,
    seed: c.seed,
    samplingMethod: c.sampler,
    scheduler: c.scheduler,
    loadMode: c.loadMode,
    batchCount: c.batchCount,
    clipSkip: c.clipSkip,
    livePreviewMethod: c.livePreviewMethod || undefined,
    vaeTiling: c.vaeTiling,

    photoMaker: c.photoMakerModel || undefined,
    photoMakerImages: c.photoMakerImages?.length ? c.photoMakerImages : undefined,
    pmStyleStrength: c.photoMakerStyleStrength,
    pmIdEmbedsPath: c.photoMakerIdEmbedsPath || undefined,

    controlNet: c.controlNetModel || undefined,
    controlImage: c.controlImagePath || undefined,
    controlStrength: c.controlNetStrength,
    applyCanny: c.applyCanny,

    initImagePath: c.initImagePath || undefined,
    img2imgStrength: c.img2imgStrength,
    kontextRefPath: c.kontextRefImage || undefined,
    // User-selected ref preset (client strips when binary lacks the flag)
    refImagePreset: c.refImagePreset || 'auto',
    refImageArgs:
      resolveRefImageArgsForConfig(c.refImagePreset || 'auto', {
        diffusionModel,
        uncondDiffusionModel: c.uncondDiffusionModel
      }) || undefined,

    diffusionModel,
    diffusion_model: diffusionModel,
    highNoiseDiffusionModel: c.highNoiseDiffusionModel || undefined,
    uncondDiffusionModel: c.uncondDiffusionModel || undefined,
    vae: c.vaeModel || undefined,
    vaeFormat: c.vaeFormat || undefined,
    audioVae: c.audioVaeModel || undefined,
    t5xxl: c.t5xxlModel || undefined,
    llm: c.llmModel || undefined,
    llmVision: c.llmVisionModel || undefined,
    embeddingsConnectors: c.embeddingsConnectorsModel || undefined,
    clipL: c.clipModel || undefined,
    clipG: c.clipGModel || undefined,
    clipVision: c.clipVisionModel || undefined,

    flashAttention: c.flashAttention,
    clipOnCpu: c.clipOnCpu,
    vaeOnCpu: c.vaeOnCpu,
    controlNetOnCpu: c.controlNetOnCpu,
    offloadToCpu: c.cpuOffload,
    diffusionFa: c.flashAttention,
    diffusionConvDirect: c.diffusionConvDirect,
    vaeConvDirect: c.vaeConvDirect,
    forceSDXLVaeConvScale: c.forceSDXLVaeConvScale,
    backendAssignment: c.backendAssignment || undefined,
    paramsBackendAssignment: c.paramsBackendAssignment || undefined,
    autoFit: c.autoFit,
    splitMode: c.splitMode,
    threads: c.threads,
    maxVram: c.maxVram,
    streamLayers: c.streamLayers,
    mmap: c.mmap,
    circular: c.circular,
    circularX: c.circularX,
    circularY: c.circularY,
    qwenImageZeroCondT: c.qwenImageZeroCondT,
    chromaEnableT5Mask: c.chromaEnableT5Mask,
    chromaDisableDitMask: c.chromaDisableDitMask,
    chromaT5MaskPad: c.chromaT5MaskPad,
    disableImageMetadata: c.disableImageMetadata,

    loraApplyMode: c.loraApplyMode,
    rngType: c.rngType || undefined,
    samplerRngType: c.samplerRngType || undefined,
    quantizationType: c.quantizationType || undefined,
    tensorTypeRules: c.tensorTypeRules || undefined,
    predictionType: c.predictionType || undefined,
    cacheMode: c.cacheMode || undefined,
    cacheOption: c.cacheOption || undefined,
    scmMask: c.scmMask || undefined,
    scmPolicy: c.scmPolicy || undefined,
    flowShift: c.flowShift,
    eta: c.eta,
    slgScale: c.slgScale,
    skipLayerStart: c.skipLayerStart,
    skipLayerEnd: c.skipLayerEnd,
    skipLayers: c.skipLayers || undefined,
    sigmas: c.sigmas || undefined,
    imgCfgScale: c.imgCfgScale,
    extraSampleArgs: c.extraSampleArgs || undefined,
    extraTilingArgs: c.extraTilingArgs || undefined,
    upscaleModel: c.upscaleModel || undefined,
    taesdModel: c.taesdModel || undefined,
    guidance: c.guidance || undefined,
    videoMode: c.videoMode || undefined,
    motionModule: c.motionModule || undefined
  }

  if (c.adetailerEnabled && c.adetailerModel) {
    params.adetailerEnabled = true
    params.adetailerModel = c.adetailerModel
    if (c.adetailerPrompt) params.adetailerPrompt = c.adetailerPrompt
    if (c.adetailerNegativePrompt) params.adetailerNegativePrompt = c.adetailerNegativePrompt
    params.adetailerConfidence = c.adetailerConfidence
    params.adetailerDenoisingStrength = c.adetailerDenoisingStrength
    params.adetailerInpaintPadding = c.adetailerInpaintPadding
    params.adetailerMaskBlur = c.adetailerMaskBlur
    params.adetailerInpaintWidth = c.adetailerInpaintWidth
    params.adetailerInpaintHeight = c.adetailerInpaintHeight
    params.adetailerMaskKLargest = c.adetailerMaskKLargest
    if (c.adetailerMaskMode && c.adetailerMaskMode !== 'none') {
      params.adetailerMaskMode = c.adetailerMaskMode
    }
    if (c.adetailerSortBy && c.adetailerSortBy !== 'none') {
      params.adetailerSortBy = c.adetailerSortBy
    }
    if (c.adetailerExtraArgs) params.adetailerExtraArgs = c.adetailerExtraArgs
  }

  if (c.loras.length > 0) {
    params.loras = c.loras.map((l) => ({
      path: l.path,
      strength: l.strength,
      target: l.target
    }))
  }

  if (options.extra) {
    Object.assign(params, options.extra)
  }

  return params
}

/**
 * Append scalar payload fields to FormData (skips undefined/null/empty objects).
 */
export function appendPayloadToFormData(formData: FormData, payload: GenerationPayload): void {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value))
      continue
    }
    if (value === '' && key !== 'prompt' && key !== 'negative_prompt') continue
    formData.append(key, String(value))
  }
}

/**
 * True if any generation surface is busy (client-side).
 */
export function anySurfaceBusy(surfaces: Record<string, { value: boolean }>): boolean {
  return Object.values(surfaces).some((s) => s.value)
}
