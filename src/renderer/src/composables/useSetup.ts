import { computed, ref, watch } from 'vue'
import { useRuntimeStatus } from './useRuntimeStatus'
import { useModels } from './useModels'

const setupComplete = ref(false)
const skipped = ref(false)
const stateLoaded = ref(false)

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
    if (!setupComplete.value) return true
    if (!backendValid.value) return true
    if (!hasAnyModel.value && !skipped.value) return true
    return false
  })

  async function loadState(): Promise<void> {
    try {
      const state = await window.electronAPI?.getInitState()
      setupComplete.value = state?.setupComplete ?? false
    } catch {
      setupComplete.value = false
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

  function skipForNow(): void {
    skipped.value = true
  }

  watch(backendValid, (valid) => {
    if (!valid) skipped.value = false
  })

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
