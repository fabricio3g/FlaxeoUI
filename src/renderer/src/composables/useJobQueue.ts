import { computed, ref } from 'vue'
import { apiPost, apiPostForm } from '@/services/api'
import {
  claimGeneration,
  releaseGeneration,
  type GenerationSurface
} from '@/composables/useGeneration'
import {
  clearFinishedJobs,
  clearPendingJobs,
  countPending,
  createJobId,
  listPending,
  listRunning,
  movePendingJob,
  removePendingJob,
  truncateLabel,
  type JobStatus
} from '../../../shared/jobQueueHelpers'

export type { JobStatus }

export interface GenApiResult {
  message?: string
  filename?: string
  filenames?: string[]
}

export type FormPart =
  | { name: string; type: 'text'; value: string }
  | { name: string; type: 'file'; file: File; filename?: string }

export interface QueueJob {
  id: string
  createdAt: number
  surface: GenerationSurface
  status: JobStatus
  label: string
  prompt?: string
  negativePrompt?: string
  seed?: number
  width?: number
  height?: number
  configSnapshot?: Record<string, unknown>
  kind: 'json' | 'form'
  endpoint: string
  jsonBody?: Record<string, unknown>
  formParts?: FormPart[]
  resultFilenames?: string[]
  error?: string
  startedAt?: number
  finishedAt?: number
  /** In-memory UI callbacks (not persisted) */
  onStart?: () => void
  onSuccess?: (result: GenApiResult) => void
  onError?: (message: string) => void
  onSettled?: () => void
}

export type QueueJobDraft = Omit<QueueJob, 'id' | 'createdAt' | 'status'>

const jobs = ref<QueueJob[]>([])
const paused = ref(false)
const loopActive = ref(false)
/** When true, cancel was requested for the running job */
const cancelRequested = ref(false)

const MAX_RECENT = 30

const pending = computed(() => listPending(jobs.value))
const current = computed(() => listRunning(jobs.value))
const pendingCount = computed(() => countPending(jobs.value))
const recentDone = computed(() =>
  jobs.value
    .filter((j) => j.status === 'success' || j.status === 'failed' || j.status === 'cancelled')
    .slice(-12)
    .reverse()
)

function pruneOld(): void {
  const active = jobs.value.filter(
    (j) => j.status === 'pending' || j.status === 'running'
  )
  const done = jobs.value.filter(
    (j) => j.status !== 'pending' && j.status !== 'running'
  )
  const keptDone = done.slice(-MAX_RECENT)
  jobs.value = [...keptDone, ...active]
}

function buildFormData(parts: FormPart[]): FormData {
  const fd = new FormData()
  for (const part of parts) {
    if (part.type === 'text') {
      fd.append(part.name, part.value)
    } else {
      fd.append(part.name, part.file, part.filename || part.file.name)
    }
  }
  return fd
}

async function executeJob(job: QueueJob): Promise<void> {
  cancelRequested.value = false
  job.status = 'running'
  job.startedAt = Date.now()
  job.onStart?.()

  if (!claimGeneration(job.surface)) {
    // Another surface claimed outside queue — re-pend and wait
    job.status = 'pending'
    job.startedAt = undefined
    return
  }

  try {
    let result: GenApiResult
    if (job.kind === 'form') {
      const fd = buildFormData(job.formParts || [])
      result = await apiPostForm<GenApiResult>(job.endpoint, fd)
    } else {
      result = await apiPost<GenApiResult>(job.endpoint, job.jsonBody || {})
    }

    if (cancelRequested.value || result.message === 'Cancelled') {
      job.status = 'cancelled'
      job.finishedAt = Date.now()
      job.onError?.('Cancelled')
      return
    }

    const names = result.filenames?.length
      ? result.filenames
      : result.filename
        ? [result.filename]
        : []
    job.resultFilenames = names
    job.status = 'success'
    job.finishedAt = Date.now()
    job.onSuccess?.(result)
  } catch (e) {
    if (cancelRequested.value) {
      job.status = 'cancelled'
      job.error = 'Cancelled'
      job.finishedAt = Date.now()
      job.onError?.('Cancelled')
    } else {
      const msg = e instanceof Error ? e.message : 'Job failed'
      job.status = 'failed'
      job.error = msg
      job.finishedAt = Date.now()
      job.onError?.(msg)
    }
  } finally {
    releaseGeneration(job.surface)
    job.onSettled?.()
    // Drop heavy file blobs after finish
    if (job.formParts) {
      job.formParts = job.formParts.map((p) =>
        p.type === 'file' ? { name: p.name, type: 'text' as const, value: '[file]' } : p
      )
    }
    pruneOld()
  }
}

async function processLoop(): Promise<void> {
  if (loopActive.value) return
  loopActive.value = true
  try {
    while (!paused.value) {
      const next = listPending(jobs.value)[0]
      if (!next) break
      await executeJob(next)
      // If claim failed and job re-pended, avoid tight spin
      if (next.status === 'pending') {
        await new Promise((r) => setTimeout(r, 400))
      }
    }
  } finally {
    loopActive.value = false
  }
}

function enqueue(draft: QueueJobDraft): string {
  const id = createJobId()
  const job: QueueJob = {
    ...draft,
    id,
    createdAt: Date.now(),
    status: 'pending',
    label: truncateLabel(draft.label || draft.prompt || draft.surface)
  }
  jobs.value = [...jobs.value, job]
  void processLoop()
  return id
}

function remove(id: string): void {
  jobs.value = removePendingJob(jobs.value, id)
}

function move(id: string, toPendingIndex: number): void {
  jobs.value = movePendingJob(jobs.value, id, toPendingIndex)
}

function clearPending(): void {
  jobs.value = clearPendingJobs(jobs.value)
}

/** Clear Recent: remove success / failed / cancelled. Keeps pending + running. */
function clearFinished(): void {
  jobs.value = clearFinishedJobs(jobs.value)
}

function pause(): void {
  paused.value = true
}

function resume(): void {
  paused.value = false
  void processLoop()
}

async function cancelCurrent(): Promise<void> {
  const running = listRunning(jobs.value)
  if (!running) return
  cancelRequested.value = true
  try {
    await apiPost('/api/cancel-cli', {})
  } catch (e) {
    console.error('Cancel failed:', e)
  }
}

export function useJobQueue() {
  return {
    jobs,
    pending,
    current,
    pendingCount,
    recentDone,
    paused,
    loopActive,
    enqueue,
    remove,
    move,
    clearPending,
    clearFinished,
    pause,
    resume,
    cancelCurrent
  }
}
