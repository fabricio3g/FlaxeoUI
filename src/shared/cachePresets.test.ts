import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cachePresets, findCachePresetId } from '../renderer/src/lib/cachePresets.ts'

describe('cachePresets', () => {
  it('includes off and easycache balanced', () => {
    assert.ok(cachePresets.some((p) => p.id === 'off'))
    assert.ok(cachePresets.some((p) => p.id === 'easycache-balanced'))
  })

  it('finds matching preset id', () => {
    const balanced = cachePresets.find((p) => p.id === 'easycache-balanced')!
    assert.equal(findCachePresetId(balanced), 'easycache-balanced')
  })

  it('returns custom for manual fields', () => {
    assert.equal(
      findCachePresetId({
        cacheMode: 'easycache',
        cacheOption: 'threshold=9.9',
        scmPolicy: '',
        scmMask: ''
      }),
      'custom'
    )
  })
})
