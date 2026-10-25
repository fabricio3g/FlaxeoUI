import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiGet, apiPost } from '@/services/api'
import type { StyleKit } from '../../../shared/library'
import { GRAPH_EXAMPLES, type WorkflowGraph } from '../../../shared/workflowGraph'

interface LibraryResponse {
  memberName: string
  workflows: WorkflowGraph[]
  styleKits: StyleKit[]
}

const ACTIVE_KIT_KEY = 'flaxeo-active-style-kit'

function readActiveKit(): string {
  try {
    // Older builds stored "local:<id>"
    return (localStorage.getItem(ACTIVE_KIT_KEY) || '').replace(/^(local|shared):/, '')
  } catch {
    return ''
  }
}

/** Saved workflows, style kits and the name shown on your generations. */
export const useLibraryStore = defineStore('library', () => {
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')
  const memberName = ref('')
  const workflows = ref<WorkflowGraph[]>([])
  const styleKits = ref<StyleKit[]>([])
  const activeKitId = ref(readActiveKit())

  const examples = computed(() => GRAPH_EXAMPLES)
  const activeKit = computed(() => styleKits.value.find((k) => k.id === activeKitId.value) || null)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const data = await apiGet<LibraryResponse>('/api/library')
      memberName.value = data.memberName || ''
      workflows.value = data.workflows || []
      styleKits.value = data.styleKits || []
      error.value = ''
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Library unavailable'
    } finally {
      loading.value = false
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value && !loading.value) await refresh()
  }

  function setActiveKit(id: string): void {
    activeKitId.value = id
    try {
      if (id) localStorage.setItem(ACTIVE_KIT_KEY, id)
      else localStorage.removeItem(ACTIVE_KIT_KEY)
    } catch {
      /* per-device convenience only */
    }
  }

  async function save<T extends WorkflowGraph | StyleKit>(
    collection: 'workflows' | 'style-kits',
    item: T
  ): Promise<T> {
    const result = await apiPost<{ item: T }>('/api/library/save', {
      collection,
      item: item as unknown as Record<string, unknown>
    })
    await refresh()
    return result.item
  }

  const saveWorkflow = (workflow: WorkflowGraph): Promise<WorkflowGraph> =>
    save('workflows', workflow)
  const saveStyleKit = (kit: StyleKit): Promise<StyleKit> => save('style-kits', kit)

  async function deleteItem(collection: 'workflows' | 'style-kits', id: string): Promise<void> {
    await apiPost('/api/library/delete', { collection, id })
    if (collection === 'style-kits' && id === activeKitId.value) setActiveKit('')
    await refresh()
  }

  async function saveMemberName(name: string): Promise<void> {
    await apiPost('/api/library/settings', { memberName: name })
    await refresh()
  }

  return {
    loaded,
    loading,
    error,
    memberName,
    workflows,
    styleKits,
    examples,
    activeKitId,
    activeKit,
    refresh,
    ensureLoaded,
    setActiveKit,
    saveWorkflow,
    saveStyleKit,
    deleteItem,
    saveMemberName
  }
})
