/**
 * Ref Edit / Img2Img output size policy + on-add size prompt preference.
 * Inpaint always follows the source image (mask alignment).
 * `match_ref` means match first ref (Ref Edit) or match source/init (Img2Img).
 */
import { ref, watch } from 'vue'

export type RefEditSizeMode = 'studio' | 'match_ref'

const SIZE_MODE_KEY = 'flaxeo-ref-edit-size-mode'
const PROMPT_DISABLED_KEY = 'flaxeo-ref-size-prompt-disabled'

function readSizeMode(): RefEditSizeMode {
  try {
    const raw = localStorage.getItem(SIZE_MODE_KEY)
    return raw === 'match_ref' ? 'match_ref' : 'studio'
  } catch {
    return 'studio'
  }
}

function readPromptDisabled(): boolean {
  try {
    return localStorage.getItem(PROMPT_DISABLED_KEY) === '1'
  } catch {
    return false
  }
}

const refEditSizeMode = ref<RefEditSizeMode>(readSizeMode())
const refSizePromptDisabled = ref(readPromptDisabled())

watch(refEditSizeMode, (value) => {
  try {
    localStorage.setItem(SIZE_MODE_KEY, value)
  } catch {
    /* ignore */
  }
})

watch(refSizePromptDisabled, (value) => {
  try {
    localStorage.setItem(PROMPT_DISABLED_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
})

export function useRefEditSizePrefs() {
  function setRefEditSizeMode(mode: RefEditSizeMode): void {
    refEditSizeMode.value = mode === 'match_ref' ? 'match_ref' : 'studio'
  }

  function setRefSizePromptDisabled(disabled: boolean): void {
    refSizePromptDisabled.value = !!disabled
  }

  return {
    refEditSizeMode,
    refSizePromptDisabled,
    setRefEditSizeMode,
    setRefSizePromptDisabled
  }
}

/** Read natural pixel size of a File or image URL. */
export function readImageNaturalSize(
  source: File | string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    const revoke = typeof source !== 'string'
    const img = new Image()
    img.onload = () => {
      const width = img.naturalWidth || 0
      const height = img.naturalHeight || 0
      if (revoke) URL.revokeObjectURL(url)
      if (!width || !height) {
        reject(new Error('Could not read image dimensions'))
        return
      }
      resolve({ width, height })
    }
    img.onerror = () => {
      if (revoke) URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }
    img.src = url
  })
}
