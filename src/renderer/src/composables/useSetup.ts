import { computed, ref } from 'vue'
import { useRuntimeStatus } from './useRuntimeStatus'
import { useModels } from './useModels'

const setupComplete = ref(false)
const skipped = ref(false)
const stateLoaded = ref(false)
const isDev = ref(false)

export function useSetup() {
  const { backendValid } = useRuntimeStatus()
  const { models } = useModels()

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

  return {
    setupComplete,
    skipped,
    isSetupNeeded,
    loadState,
    completeSetup,
    reopenSetup,
    skipForNow
  }
}
