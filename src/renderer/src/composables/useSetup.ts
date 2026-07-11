import { computed, ref } from 'vue'
import { useRuntimeStatus } from './useRuntimeStatus'
import { useModels } from './useModels'
import { useGenerationHistory } from './useGenerationHistory'

const setupComplete = ref(false)
const skipped = ref(false)
const stateLoaded = ref(false)
const isDev = ref(false)

const FIRST_IMAGE_KEY = 'flaxeo-first-image-done'

export function useSetup() {
  const { backendValid } = useRuntimeStatus()
  const { models } = useModels()
  const { entries } = useGenerationHistory()

  const hasAnyModel = computed(() => {
    const all = [
      ...models.value.diffusion,
      ...models.value.vae,
      ...models.value.clip,
      ...models.value.clipG,
      ...models.value.t5xxl,
      ...models.value.llm
    ]
    return all.length > 0
  })

  const hasFirstImage = computed(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(FIRST_IMAGE_KEY) === '1') {
      return true
    }
    return entries.value.some((e) => e.status === 'success' && e.filename)
  })

  /** Compact first-run checklist (backend → models → first image) */
  const checklist = computed(() => [
    { id: 'backend', label: 'Backend ready', done: backendValid.value },
    { id: 'models', label: 'Models installed', done: hasAnyModel.value },
    { id: 'firstImage', label: 'First image generated', done: hasFirstImage.value }
  ])

  const checklistComplete = computed(() => checklist.value.every((item) => item.done))

  const isSetupNeeded = computed(() => {
    if (!stateLoaded.value) return false
    if (skipped.value) return false
    if (isDev.value) return true
    if (!setupComplete.value) return true
    if (!backendValid.value) return true
    if (!hasAnyModel.value) return true
    return false
  })

  async function loadState(): Promise<void> {
    try {
      const state = await window.electronAPI?.getInitState()
      setupComplete.value = state?.setupComplete ?? false
      skipped.value = state?.skipped ?? false
      isDev.value = state?.isDev ?? false
    } catch {
      setupComplete.value = false
      skipped.value = false
      isDev.value = false
    } finally {
      stateLoaded.value = true
    }
  }

  async function completeSetup(): Promise<void> {
    setupComplete.value = true
    skipped.value = false
    try {
      await window.electronAPI?.setFirstRunComplete()
    } catch (e) {
      console.error('Failed to mark setup complete:', e)
    }
  }

  async function reopenSetup(): Promise<void> {
    setupComplete.value = false
    skipped.value = false
    try {
      await window.electronAPI?.reopenSetup()
    } catch (e) {
      console.error('Failed to reopen setup:', e)
    }
  }

  async function skipForNow(): Promise<void> {
    skipped.value = true
    try {
      await window.electronAPI?.setSetupSkipped()
    } catch (e) {
      console.error('Failed to persist setup skipped state:', e)
    }
  }

  function markFirstImageDone(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(FIRST_IMAGE_KEY, '1')
  }

  return {
    setupComplete,
    skipped,
    isSetupNeeded,
    hasAnyModel,
    hasFirstImage,
    checklist,
    checklistComplete,
    markFirstImageDone,
    loadState,
    completeSetup,
    reopenSetup,
    skipForNow
  }
}
