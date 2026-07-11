import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearFinishedJobs,
  clearPendingJobs,
  countPending,
  listPending,
  movePendingJob,
  removePendingJob,
  truncateLabel,
  type QueueJobBase
} from './jobQueueHelpers.ts'

function job(id: string, status: QueueJobBase['status']): QueueJobBase {
  return { id, status }
}

describe('jobQueueHelpers', () => {
  it('lists and counts pending', () => {
    const jobs = [job('a', 'pending'), job('b', 'running'), job('c', 'pending')]
    assert.equal(countPending(jobs), 2)
    assert.deepEqual(
      listPending(jobs).map((j) => j.id),
      ['a', 'c']
    )
  })

  it('removes only pending by id', () => {
    const jobs = [job('a', 'pending'), job('b', 'running'), job('c', 'pending')]
    const next = removePendingJob(jobs, 'c')
    assert.equal(countPending(next), 1)
    assert.ok(next.find((j) => j.id === 'b' && j.status === 'running'))
    // cannot remove running via removePending
    assert.equal(removePendingJob(jobs, 'b').length, 3)
  })

  it('reorders pending among non-pending', () => {
    const jobs = [
      job('done', 'success'),
      job('a', 'pending'),
      job('b', 'pending'),
      job('c', 'pending')
    ]
    const next = movePendingJob(jobs, 'c', 0)
    assert.deepEqual(
      listPending(next).map((j) => j.id),
      ['c', 'a', 'b']
    )
    assert.equal(next[0].id, 'done')
  })

  it('clears pending only', () => {
    const jobs = [job('a', 'pending'), job('b', 'success'), job('c', 'pending')]
    const next = clearPendingJobs(jobs)
    assert.equal(next.length, 1)
    assert.equal(next[0].id, 'b')
  })

  it('clears finished only (success, failed, cancelled)', () => {
    const jobs = [
      job('a', 'pending'),
      job('b', 'running'),
      job('c', 'success'),
      job('d', 'failed'),
      job('e', 'cancelled')
    ]
    const next = clearFinishedJobs(jobs)
    assert.deepEqual(
      next.map((j) => j.id),
      ['a', 'b']
    )
  })

  it('truncates labels', () => {
    assert.equal(truncateLabel('short'), 'short')
    assert.ok(truncateLabel('x'.repeat(100)).endsWith('…'))
  })
})
