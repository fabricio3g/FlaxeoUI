/**
 * Pure job-queue list operations (unit-tested).
 */

export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'

export interface QueueJobBase {
  id: string
  status: JobStatus
}

export function createJobId(): string {
  return `qjob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Pending jobs only, in list order */
export function listPending<T extends QueueJobBase>(jobs: T[]): T[] {
  return jobs.filter((j) => j.status === 'pending')
}

export function listRunning<T extends QueueJobBase>(jobs: T[]): T | undefined {
  return jobs.find((j) => j.status === 'running')
}

/** Remove a pending job by id. Returns new array. */
export function removePendingJob<T extends QueueJobBase>(jobs: T[], id: string): T[] {
  return jobs.filter((j) => !(j.id === id && j.status === 'pending'))
}

/**
 * Move a pending job to a new index among pending jobs.
 * `toPendingIndex` is 0-based within the pending subset.
 */
export function movePendingJob<T extends QueueJobBase>(
  jobs: T[],
  id: string,
  toPendingIndex: number
): T[] {
  const pending = listPending(jobs)
  const from = pending.findIndex((j) => j.id === id)
  if (from < 0) return jobs

  const clamped = Math.max(0, Math.min(pending.length - 1, toPendingIndex))
  if (from === clamped) return jobs

  const reordered = [...pending]
  const [item] = reordered.splice(from, 1)
  reordered.splice(clamped, 0, item)

  // Rebuild full list: non-pending keep relative order; pending replaced in order
  let p = 0
  return jobs.map((j) => {
    if (j.status !== 'pending') return j
    return reordered[p++]
  })
}

export function clearPendingJobs<T extends QueueJobBase>(jobs: T[]): T[] {
  return jobs.filter((j) => j.status !== 'pending')
}

/** Drop finished jobs (success / failed / cancelled). Keeps pending and running. */
export function clearFinishedJobs<T extends QueueJobBase>(jobs: T[]): T[] {
  return jobs.filter((j) => j.status === 'pending' || j.status === 'running')
}

export function countPending<T extends QueueJobBase>(jobs: T[]): number {
  return listPending(jobs).length
}

export function truncateLabel(text: string, max = 48): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t || 'Job'
  return `${t.slice(0, max - 1)}…`
}
