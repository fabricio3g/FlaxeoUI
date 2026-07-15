/**
 * Client-side output preferences (archive format + auto-download).
 * Store format (PNG/AVIF in Image output) lives on the server config.
 */
import { ref, watch } from 'vue'

export type ArchiveImageFormat = 'png' | 'avif'

const SAVE_FORMAT_KEY = 'flaxeo-default-save-format'
const AUTO_DOWNLOAD_KEY = 'flaxeo-auto-download-generated'

function readSaveFormat(): ArchiveImageFormat {
  try {
    const raw = localStorage.getItem(SAVE_FORMAT_KEY)
    return raw === 'avif' ? 'avif' : 'png'
  } catch {
    return 'png'
  }
}

function readAutoDownload(): boolean {
  try {
    return localStorage.getItem(AUTO_DOWNLOAD_KEY) === '1'
  } catch {
    return false
  }
}

const defaultSaveFormat = ref<ArchiveImageFormat>(readSaveFormat())
const autoDownloadGenerated = ref(readAutoDownload())

watch(defaultSaveFormat, (value) => {
  try {
    localStorage.setItem(SAVE_FORMAT_KEY, value)
  } catch {
    /* ignore */
  }
})

watch(autoDownloadGenerated, (value) => {
  try {
    localStorage.setItem(AUTO_DOWNLOAD_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
})

export function useOutputPreferences() {
  function setDefaultSaveFormat(format: ArchiveImageFormat): void {
    defaultSaveFormat.value = format === 'avif' ? 'avif' : 'png'
  }

  function setAutoDownloadGenerated(enabled: boolean): void {
    autoDownloadGenerated.value = !!enabled
  }

  return {
    defaultSaveFormat,
    autoDownloadGenerated,
    setDefaultSaveFormat,
    setAutoDownloadGenerated
  }
}
