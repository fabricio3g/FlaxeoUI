import { ref } from 'vue'
import { apiPost } from '@/services/api'

export interface GenerationParams {
    prompt: string
    negative_prompt?: string
    steps?: number
    cfg_scale?: number
    width?: number
    height?: number
    seed?: number
    diffusionModel?: string
    vae?: string
    loadMode?: 'standard' | 'split'
    guidance?: number
    scheduler?: string
    samplingMethod?: string
}

/**
 * useGeneration() - Composable for image generation via sd-cli
 * 
 * Provides reactive state and methods for:
 * - Triggering image generation
 * - Tracking generation progress
 * - Cancelling in-progress generation
 * 
 * @returns {Object} Generation state and methods
 */
export function useGeneration() {
    const isGenerating = ref(false)
    const progress = ref(0)
    const previewImage = ref<string | null>(null)
    const generatedFiles = ref<string[]>([])
    const error = ref<string | null>(null)

    /**
     * generateImage() - Initiates image generation via /api/generate-cli
     * @param params - Generation parameters matching sd-cli arguments
     */
    async function generateImage(params: GenerationParams): Promise<void> {
        isGenerating.value = true
        error.value = null
        progress.value = 0

        try {
            const result = await apiPost<{ message: string; filenames?: string[] }>(
                '/api/generate-cli',
                params
            )

            if (result.filenames) {
                generatedFiles.value = result.filenames
            }
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Generation failed'
        } finally {
            isGenerating.value = false
            progress.value = 100
        }
    }

    /**
     * cancel() - Cancels the current generation process
     * Sends SIGTERM to the sd-cli process
     */
    async function cancel(): Promise<void> {
        try {
            await apiPost('/api/cancel-cli', {})
        } catch (e) {
            console.error('Cancel failed:', e)
        }
        isGenerating.value = false
    }

    return {
        isGenerating,
        progress,
        previewImage,
        generatedFiles,
        error,
        generateImage,
        cancel
    }
}
