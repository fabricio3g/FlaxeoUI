import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * GenerationConfig - All parameters for image generation
 * Matches the sd-cli command line arguments
 */
export interface GenerationConfig {
    // Backend mode
    backendMode: 'server' | 'cli'

    // Model loading mode
    loadMode: 'standard' | 'split'

    // Standard mode model
    standardModel: string

    // Split mode models
    diffusionModel: string
    t5xxlModel: string
    llmModel: string
    clipModel: string
    clipGModel: string
    clipVisionModel: string

    // Common models
    vaeModel: string
    vaeTileSize: number
    controlNetModel: string
    photoMakerModel: string
    upscaleModel: string
    taesdModel: string

    // LoRAs (array of { path, strength })
    loras: Array<{ path: string; strength: number }>
    loraApplyMode: 'auto' | 'immediately' | 'at_runtime'

    // Embeddings
    embeddings: string[]

    // Sampling
    scheduler: string
    sampler: string
    rngType: string
    batchCount: number

    // Generation parameters
    steps: number
    cfgScale: number
    guidance: number
    clipSkip: number
    seed: number
    width: number
    height: number

    // Hardware options
    flashAttention: boolean
    vaeTiling: boolean
    clipOnCpu: boolean
    cpuOffload: boolean
    diffusionConvDirect: boolean
    vaeConvDirect: boolean
    forceSDXLVaeConvScale: boolean
    quantizationType: string

    // Live preview
    livePreviewMethod: string

    // ControlNet settings
    controlNetStrength: number
    applyCanny: boolean
    controlImagePath: string

    // PhotoMaker settings
    photoMakerImages: string[]
    photoMakerStyleStrength: number
    photoMakerIdEmbedsPath: string

    // Kontext (Flux image editing)
    kontextRefImage: string

    // Video mode
    videoMode: boolean
}

/**
 * useConfigStore - Pinia store for generation configuration
 * Centralizes all settings from the sidebar
 */
export const useConfigStore = defineStore('config', () => {
    // Default configuration matching original app
    const config = ref<GenerationConfig>({
        backendMode: 'cli',
        loadMode: 'standard',
        standardModel: '',
        diffusionModel: '',
        t5xxlModel: '',
        llmModel: '',
        clipModel: '',
        clipGModel: '',
        clipVisionModel: '',
        vaeModel: '',
        vaeTileSize: 0,
        controlNetModel: '',
        photoMakerModel: '',
        upscaleModel: '',
        taesdModel: '',
        loras: [],
        loraApplyMode: 'auto',
        embeddings: [],
        scheduler: 'discrete',
        sampler: 'euler',
        rngType: '',
        batchCount: 1,
        steps: 20,
        cfgScale: 3.5,
        guidance: 3.5,
        clipSkip: -1,
        seed: -1,
        width: 1024,
        height: 1024,
        flashAttention: false,
        vaeTiling: false,
        clipOnCpu: false,
        cpuOffload: false,
        diffusionConvDirect: false,
        vaeConvDirect: false,
        forceSDXLVaeConvScale: false,
        quantizationType: '',
        livePreviewMethod: '',
        controlNetStrength: 0.9,
        applyCanny: false,
        controlImagePath: '',
        photoMakerImages: [],
        photoMakerStyleStrength: 20,
        photoMakerIdEmbedsPath: '',
        kontextRefImage: '',
        videoMode: false
    })

    /**
     * updateConfig() - Partially update configuration
     */
    function updateConfig(partial: Partial<GenerationConfig>): void {
        config.value = { ...config.value, ...partial }
    }

    /**
     * addLora() - Add a LoRA to the list
     */
    function addLora(path: string, strength: number = 1.0): void {
        config.value.loras.push({ path, strength })
    }

    /**
     * removeLora() - Remove a LoRA by index
     */
    function removeLora(index: number): void {
        config.value.loras.splice(index, 1)
    }

    /**
     * addEmbedding() - Add an embedding
     */
    function addEmbedding(path: string): void {
        if (!config.value.embeddings.includes(path)) {
            config.value.embeddings.push(path)
        }
    }

    /**
     * removeEmbedding() - Remove an embedding
     */
    function removeEmbedding(path: string): void {
        config.value.embeddings = config.value.embeddings.filter(e => e !== path)
    }

    /**
     * setDimensions() - Set width/height with preset support
     */
    function setDimensions(width: number, height: number): void {
        config.value.width = width
        config.value.height = height
    }

    /**
     * getSelectedModel() - Get the appropriate model based on load mode
     */
    const selectedModel = computed(() => {
        if (config.value.loadMode === 'standard') {
            return config.value.standardModel
        }
        return config.value.diffusionModel
    })

    return {
        config,
        updateConfig,
        addLora,
        removeLora,
        addEmbedding,
        removeEmbedding,
        setDimensions,
        selectedModel
    }
})
