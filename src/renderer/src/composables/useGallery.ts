import { ref } from 'vue'
import { apiGet, apiPost } from '@/services/api'

/**
 * useGallery() - Composable for gallery/output management
 * 
 * Provides reactive access to generated images and deletion functionality.
 * 
 * @returns {Object} Gallery state and methods
 */
export function useGallery() {
    const images = ref<string[]>([])
    const isLoading = ref(false)

    /**
     * fetchGallery() - Fetches list of generated images from /api/gallery
     * Returns filenames sorted by modification time (newest first)
     */
    async function fetchGallery(): Promise<void> {
        isLoading.value = true
        try {
            const data = await apiGet<string[]>('/api/gallery')
            images.value = data
        } catch (e) {
            console.error('Failed to fetch gallery:', e)
        } finally {
            isLoading.value = false
        }
    }

    /**
     * deleteImage() - Deletes an image from the output directory
     * @param filename - The filename to delete
     */
    async function deleteImage(filename: string): Promise<void> {
        try {
            await apiPost('/api/delete', { filename })
            // Remove from local list
            images.value = images.value.filter(img => img !== filename)
        } catch (e) {
            console.error('Failed to delete image:', e)
        }
    }

    return {
        images,
        isLoading,
        fetchGallery,
        deleteImage
    }
}
