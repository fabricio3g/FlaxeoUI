import { computed, ref } from 'vue'

export type HistoryStatus = 'success' | 'failed' | 'cancelled'

export interface GenerationHistoryEntry {
  id: string
  timestamp: number
  surface: 'text2image' | 'edit' | 'video' | 'upscale'
  status: HistoryStatus
  prompt: string
  negativePrompt?: string
  seed?: number
  width?: number
  height?: number
  filename?: string
  error?: string
  /** Wall-clock duration of the job in ms (when known) */
  durationMs?: number
  /** Compact config for Re-run */
  configSnapshot?: Record<string, unknown>
}

const STORAGE_KEY = 'flaxeo-generation-history'
const MAX_ENTRIES = 50

const entries = ref<GenerationHistoryEntry[]>(loadEntries())

function cloneSnapshot(value?: Record<string, unknown>): Record<string, unknown> | undefined {
  return value ? JSON.parse(JSON.stringify(value)) : undefined
}

function loadEntries(): GenerationHistoryEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.timestamp === 'number')
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value.slice(0, MAX_ENTRIES)))
}

function createId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * useGenerationHistory() - Lightweight local generation history
 */
export function useGenerationHistory() {
  const recent = computed(() => entries.value)

  function addEntry(
    partial: Omit<GenerationHistoryEntry, 'id' | 'timestamp'> & { timestamp?: number }
  ): GenerationHistoryEntry {
    const entry: GenerationHistoryEntry = {
      id: createId(),
      timestamp: partial.timestamp ?? Date.now(),
      surface: partial.surface,
      status: partial.status,
      prompt: partial.prompt || '',
      negativePrompt: partial.negativePrompt,
      seed: partial.seed,
      width: partial.width,
      height: partial.height,
      filename: partial.filename,
      error: partial.error,
      durationMs: partial.durationMs,
      configSnapshot: cloneSnapshot(partial.configSnapshot)
    }
    entries.value = [entry, ...entries.value].slice(0, MAX_ENTRIES)
    persist()
    return entry
  }

  function clearHistory(): void {
    entries.value = []
    persist()
  }

  function removeEntry(id: string): void {
    entries.value = entries.value.filter((entry) => entry.id !== id)
    persist()
  }

  return {
    entries: recent,
    addEntry,
    clearHistory,
    removeEntry
  }
}
