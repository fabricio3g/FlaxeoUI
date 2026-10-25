import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiDelete, apiGet, apiPost } from '@/services/api'
import { createLibraryId } from '../../../shared/library'
import {
  sessionTitle,
  type Session,
  type SessionRow,
  type SessionSummary
} from '../../../shared/sessions'

const ACTIVE_KEY = 'flaxeo-active-session'

function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || ''
  } catch {
    return ''
  }
}

function writeActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* per-device convenience only */
  }
}

/**
 * Create sessions. The server owns the data (shared with paired devices); rows are
 * written one at a time so two devices generating into one session never clash.
 */
export const useSessionsStore = defineStore('sessions', () => {
  const summaries = ref<SessionSummary[]>([])
  const active = ref<Session | null>(null)
  const loading = ref(false)
  const error = ref('')

  const activeId = computed(() => active.value?.id || '')
  const title = computed(() => (active.value ? sessionTitle(active.value) : ''))

  async function refreshList(): Promise<void> {
    try {
      summaries.value = (await apiGet<{ sessions: SessionSummary[] }>('/api/sessions')).sessions
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sessions unavailable'
    }
  }

  function blank(): Session {
    const now = Date.now()
    return { id: createLibraryId('ses'), title: '', createdAt: now, updatedAt: now, rows: [] }
  }

  /** Open the last session on this device, else the newest, else a new empty one. */
  async function init(): Promise<void> {
    loading.value = true
    await refreshList()
    const wanted = readActiveId()
    const id = summaries.value.find((s) => s.id === wanted)?.id || summaries.value[0]?.id
    if (id) await open(id)
    else start()
    loading.value = false
  }

  async function open(id: string): Promise<void> {
    try {
      active.value = (await apiGet<{ session: Session }>(`/api/sessions/${id}`)).session
      writeActiveId(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not open the session'
    }
  }

  /** A new session exists locally until its first row is saved. */
  function start(): void {
    active.value = blank()
    writeActiveId(active.value.id)
  }

  /** Add or update a row locally and on the server. */
  async function saveRow(row: SessionRow): Promise<void> {
    if (!active.value) start()
    const session = active.value as Session
    const index = session.rows.findIndex((r) => r.id === row.id)
    if (index >= 0) session.rows[index] = row
    else session.rows.push(row)
    session.updatedAt = Date.now()
    try {
      await apiPost(`/api/sessions/${session.id}/rows`, { row })
      if (!summaries.value.some((s) => s.id === session.id) || row.status !== 'running') {
        void refreshList()
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not save to the session'
    }
  }

  async function removeRow(rowId: string): Promise<void> {
    const session = active.value
    if (!session) return
    session.rows = session.rows.filter((row) => row.id !== rowId)
    try {
      await apiDelete(`/api/sessions/${session.id}/rows/${rowId}`)
    } catch {
      /* a never-saved row is fine to drop locally */
    }
    void refreshList()
  }

  async function rename(name: string): Promise<void> {
    const session = active.value
    if (!session) return
    session.title = name.trim().slice(0, 120)
    await apiPost(`/api/sessions/${session.id}`, { title: session.title })
    await refreshList()
  }

  async function remove(id: string): Promise<void> {
    await apiDelete(`/api/sessions/${id}`)
    await refreshList()
    if (active.value?.id === id) {
      if (summaries.value[0]) await open(summaries.value[0].id)
      else start()
    }
  }

  return {
    summaries,
    active,
    activeId,
    title,
    loading,
    error,
    init,
    open,
    start,
    saveRow,
    removeRow,
    rename,
    remove,
    refreshList
  }
})
