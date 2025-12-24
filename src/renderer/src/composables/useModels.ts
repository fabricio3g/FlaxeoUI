import { ref } from 'vue'
import { apiGet } from '@/services/api'

export interface ModelCategories {
    diffusion: string[]
    loras: string[]
    vae: string[]
    llm: string[]
    t5xxl: string[]
    clip: string[]
    clipG: string[]
    clipVision: string[]
    controlnet: string[]
    photomaker: string[]
    upscale: string[]
    taesd: string[]
    embeddings: string[]
}

/**
 * useModels() - Composable for model file management
 * 
 * Provides reactive access to available model files across all categories:
 * diffusion, LoRAs, VAE, CLIP, T5XXL, LLM, ControlNet, etc.
 * 
 * @returns {Object} Model state and fetch method
 */
export function useModels() {
    const models = ref<ModelCategories>({
        diffusion: [],
        loras: [],
        vae: [],
        llm: [],
        t5xxl: [],
        clip: [],
        clipG: [],
        clipVision: [],
        controlnet: [],
        photomaker: [],
        upscale: [],
        taesd: [],
        embeddings: []
    })

    const isLoading = ref(false)

    /**
     * fetchModels() - Fetches available models from /api/models
     * Updates the reactive models ref with categorized file lists
     */
    async function fetchModels(): Promise<void> {
        isLoading.value = true
        try {
            const data = await apiGet<ModelCategories>('/api/models')
            models.value = data
        } catch (e) {
            console.error('Failed to fetch models:', e)
        } finally {
            isLoading.value = false
        }
    }

    return {
        models,
        isLoading,
        fetchModels
    }
}
