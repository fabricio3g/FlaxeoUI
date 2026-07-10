import { ref, type Ref } from 'vue'
import { apiPost } from '@/services/api'
import type { GenerationConfig } from '@/stores/config'

export function useServerControls(
  config: Ref<GenerationConfig>,
  fetchRuntimeStatus: () => Promise<void>
) {
  const isBooting = ref(false)

  async function startServer(): Promise<void> {
    isBooting.value = true
    try {
      const payload = {
        loadMode: config.value.loadMode,
        diffusionModel:
          config.value.loadMode === 'standard'
            ? config.value.standardModel
            : config.value.diffusionModel,
        highNoiseDiffusionModel: config.value.highNoiseDiffusionModel,
        uncondDiffusionModel: config.value.uncondDiffusionModel,
        t5xxl: config.value.t5xxlModel,
        llm: config.value.llmModel,
        llmVision: config.value.llmVisionModel,
        clipL: config.value.clipModel,
        clipG: config.value.clipGModel,
        vae: config.value.vaeModel,
        vaeFormat: config.value.vaeFormat,
        audioVae: config.value.audioVaeModel,
        embeddingsConnectors: config.value.embeddingsConnectorsModel,
        controlNet: config.value.controlNetModel,
        photoMaker: config.value.photoMakerModel,
        scheduler: config.value.scheduler,
        samplingMethod: config.value.sampler,
        rngType: config.value.rngType,
        samplerRngType: config.value.samplerRngType,
        flashAttention: config.value.flashAttention,
        vaeTiling: config.value.vaeTiling,
        clipOnCpu: config.value.clipOnCpu,
        vaeOnCpu: config.value.vaeOnCpu,
        controlNetOnCpu: config.value.controlNetOnCpu,
        offloadToCpu: config.value.cpuOffload,
        diffusionConvDirect: config.value.diffusionConvDirect,
        vaeConvDirect: config.value.vaeConvDirect,
        forceSDXLVaeConvScale: config.value.forceSDXLVaeConvScale,
        backendAssignment: config.value.backendAssignment,
        paramsBackendAssignment: config.value.paramsBackendAssignment,
        autoFit: config.value.autoFit,
        splitMode: config.value.splitMode,
        threads: config.value.threads,
        maxVram: config.value.maxVram,
        streamLayers: config.value.streamLayers,
        mmap: config.value.mmap,
        circular: config.value.circular,
        circularX: config.value.circularX,
        circularY: config.value.circularY,
        qwenImageZeroCondT: config.value.qwenImageZeroCondT,
        chromaEnableT5Mask: config.value.chromaEnableT5Mask,
        chromaDisableDitMask: config.value.chromaDisableDitMask,
        chromaT5MaskPad: config.value.chromaT5MaskPad,
        quantType: config.value.quantizationType,
        quantizationType: config.value.quantizationType,
        tensorTypeRules: config.value.tensorTypeRules,
        predictionType: config.value.predictionType,
        cacheMode: config.value.cacheMode,
        cacheOption: config.value.cacheOption,
        scmMask: config.value.scmMask,
        scmPolicy: config.value.scmPolicy,
        flowShift: config.value.flowShift,
        eta: config.value.eta,
        slgScale: config.value.slgScale,
        skipLayerStart: config.value.skipLayerStart,
        skipLayerEnd: config.value.skipLayerEnd,
        skipLayers: config.value.skipLayers,
        sigmas: config.value.sigmas,
        imgCfgScale: config.value.imgCfgScale,
        extraSampleArgs: config.value.extraSampleArgs,
        extraTilingArgs: config.value.extraTilingArgs,
        disableImageMetadata: config.value.disableImageMetadata,
        vaeTileSize: config.value.vaeTileSize,
        loraDir: config.value.loras.length > 0,
        loraApplyMode: config.value.loraApplyMode,
        defaultSteps: config.value.steps,
        defaultCfg: config.value.cfgScale
      }

      await apiPost('/api/start', payload)
      window.setTimeout(() => {
        fetchRuntimeStatus()
      }, 1000)
    } catch (error) {
      console.error('Failed to start server:', error)
    } finally {
      isBooting.value = false
    }
  }

  async function stopServer(): Promise<void> {
    try {
      await apiPost('/api/stop', {})
      window.setTimeout(() => {
        fetchRuntimeStatus()
      }, 500)
    } catch (error) {
      console.error('Failed to stop server:', error)
    }
  }

  return { isBooting, startServer, stopServer }
}
