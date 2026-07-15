/**
 * Live denoising preview via GET /api/preview-image (shared by Image + Edit).
 */
import { ref } from 'vue'
import { authenticatedFetch, getApiBase } from '@/services/api'

export function useLivePreview() {
  const previewImage = ref<string | null>(null)
  const previewObjectUrl = ref<string | null>(null)
  const isLivePreview = ref(false)

  let previewPollInterval: ReturnType<typeof setInterval> | null = null
  let previewEtag: string | null = null

  function getPreviewImageUrl(): string {
    return `${getApiBase()}/api/preview-image`
  }

  /**
   * Poll for live preview frames.
   * Hero stays empty of live frames until the first blob arrives (isLivePreview only then).
   */
  function startPreviewPolling(isActive: () => boolean): void {
    stopPreviewPolling({ clearFrame: false })
    isLivePreview.value = false
    previewEtag = null
    previewPollInterval = setInterval(async () => {
      if (!isActive()) {
        stopPreviewPolling({ clearFrame: true })
        return
      }
      try {
        const headers: HeadersInit = {}
        if (previewEtag) headers['If-None-Match'] = previewEtag
        const response = await authenticatedFetch(getPreviewImageUrl(), { headers })
        if (response.status === 304) return
        if (!response.ok) return
        const nextEtag = response.headers.get('ETag')
        if (nextEtag) previewEtag = nextEtag
        const blob = await response.blob()
        if (blob.size > 0) {
          const oldUrl = previewObjectUrl.value
          const newUrl = URL.createObjectURL(blob)
          previewObjectUrl.value = newUrl
          previewImage.value = newUrl
          isLivePreview.value = true
          if (oldUrl && oldUrl !== newUrl) URL.revokeObjectURL(oldUrl)
        }
      } catch {
        // Preview not available yet
      }
    }, 750)
  }

  /**
   * clearFrame: drop live blob from the hero (cancel / failed).
   * Leave the canvas alone when clearFrame is false (success already set a final file URL).
   */
  function stopPreviewPolling(opts?: { clearFrame?: boolean }): void {
    const clearFrame = opts?.clearFrame !== false
    if (previewPollInterval) {
      clearInterval(previewPollInterval)
      previewPollInterval = null
    }
    previewEtag = null
    const blobUrl = previewObjectUrl.value
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      previewObjectUrl.value = null
      if (clearFrame && previewImage.value === blobUrl) {
        previewImage.value = null
      }
    } else if (clearFrame && isLivePreview.value) {
      previewImage.value = null
    }
    isLivePreview.value = false
  }

  function discardLivePreview(): void {
    stopPreviewPolling({ clearFrame: true })
  }

  /** Show a final output URL (stops live flag; keeps polling stopped). */
  function setFinalPreview(url: string): void {
    stopPreviewPolling({ clearFrame: false })
    const blobUrl = previewObjectUrl.value
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      previewObjectUrl.value = null
    }
    previewImage.value = url
    isLivePreview.value = false
  }

  return {
    previewImage,
    previewObjectUrl,
    isLivePreview,
    startPreviewPolling,
    stopPreviewPolling,
    discardLivePreview,
    setFinalPreview
  }
}

export const LIVE_PREVIEW_METHOD_OPTIONS = [
  { label: 'None', value: '' },
  { label: 'Proj', value: 'proj' },
  { label: 'TAE', value: 'tae' },
  { label: 'VAE', value: 'vae' }
] as const
