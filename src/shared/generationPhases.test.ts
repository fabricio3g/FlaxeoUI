import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { advancePhase, detectPhaseFromLine, phaseLabel } from './generationPhases.ts'

describe('detectPhaseFromLine', () => {
  it('detects text encoder load', () => {
    assert.equal(
      detectPhaseFromLine("[DEBUG] loading llm from 'models/llm/qwen.gguf'"),
      'loading_encoder'
    )
  })

  it('detects diffusion load', () => {
    assert.equal(
      detectPhaseFromLine("[DEBUG] loading diffusion model from 'models/diffusion/z.gguf'"),
      'loading_diffusion'
    )
  })

  it('detects VAE load', () => {
    assert.equal(detectPhaseFromLine("[DEBUG] loading vae from 'models/vae/ae.sft'"), 'loading_vae')
  })

  it('detects conditioning', () => {
    assert.equal(
      detectPhaseFromLine('[DEBUG] computing condition graph completed, taking 33316 ms'),
      'conditioning'
    )
  })

  it('detects sampling step lines', () => {
    assert.equal(detectPhaseFromLine('| 10/20 - 1.23it/s'), 'sampling')
  })

  it('detects generating image banner', () => {
    assert.equal(detectPhaseFromLine('[INFO ] generating image: 1/1 - seed 42'), 'sampling')
  })
})

describe('advancePhase', () => {
  it('does not go backwards', () => {
    assert.equal(advancePhase('sampling', 'loading_encoder'), 'sampling')
  })

  it('advances forward', () => {
    assert.equal(advancePhase('loading_encoder', 'conditioning'), 'conditioning')
  })

  it('labels are short', () => {
    assert.equal(phaseLabel('loading_encoder'), 'Loading text encoder')
  })
})
