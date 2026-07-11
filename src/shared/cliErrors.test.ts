import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatHumanizedError, humanizeCliError } from './cliErrors.ts'

describe('humanizeCliError', () => {
  it('maps missing model', () => {
    const result = humanizeCliError({ error: 'MODEL_REQUIRED', message: 'No model selected' })
    assert.equal(result.title, 'No model selected')
    assert.match(result.detail, /diffusion model/i)
  })

  it('maps OOM', () => {
    const result = humanizeCliError('CUDA out of memory while allocating buffer')
    assert.equal(result.title, 'Out of memory')
    assert.match(result.hint || '', /Low VRAM/i)
  })

  it('maps missing VAE', () => {
    const result = humanizeCliError('failed to load vae from models/vae/ae.sft')
    assert.equal(result.title, 'VAE missing or failed')
  })

  it('maps cancel', () => {
    const result = humanizeCliError('Cancelled by SIGTERM')
    assert.equal(result.title, 'Cancelled')
  })

  it('formats with hint', () => {
    const text = formatHumanizedError(humanizeCliError('MODEL_REQUIRED'))
    assert.match(text, /No model selected/)
    assert.match(text, /Model Hub|Models/i)
  })

  it('maps concurrent generation busy', () => {
    const result = humanizeCliError('GENERATION_BUSY: Another generation is already running')
    assert.equal(result.title, 'Already generating')
    assert.match(result.hint || '', /cancel/i)
  })

  it('maps OOM from CLI exit tail', () => {
    const result = humanizeCliError(
      'CLI exited with code 1\nloading model...\nCUDA out of memory while allocating buffer'
    )
    assert.equal(result.title, 'Out of memory')
  })
})
