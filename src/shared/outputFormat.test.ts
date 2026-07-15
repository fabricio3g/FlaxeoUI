import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOutputImageFormat } from './outputFormat.ts'

describe('normalizeOutputImageFormat', () => {
  it('defaults to png', () => {
    assert.equal(normalizeOutputImageFormat(undefined), 'png')
    assert.equal(normalizeOutputImageFormat(null), 'png')
    assert.equal(normalizeOutputImageFormat('PNG'), 'png')
    assert.equal(normalizeOutputImageFormat('jpeg'), 'png')
  })

  it('accepts avif', () => {
    assert.equal(normalizeOutputImageFormat('avif'), 'avif')
  })
})
