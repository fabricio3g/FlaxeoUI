import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRefImagePreset,
  resolveRefImageArgs,
  resolveRefImageArgsForConfig,
  refImageArgsFromPreset
} from './refImageArgs.ts'

describe('resolveRefImagePreset', () => {
  it('maps Anima to cosmos_reference', () => {
    assert.equal(resolveRefImagePreset({ packId: 'anima' }), 'cosmos_reference')
    assert.equal(
      resolveRefImagePreset({ diffusionModel: 'anima-preview.safetensors' }),
      'cosmos_reference'
    )
    assert.equal(resolveRefImagePreset({ presetId: 'builtin-anima' }), 'cosmos_reference')
  })

  it('maps known edit families', () => {
    assert.equal(resolveRefImagePreset({ packId: 'flux-kontext' }), 'flux_kontext')
    assert.equal(
      resolveRefImagePreset({ diffusionModel: 'qwen_image_edit_2509.safetensors' }),
      'qwen'
    )
    assert.equal(resolveRefImagePreset({ packId: 'krea2' }), 'krea2_ostris_edit')
    assert.equal(resolveRefImagePreset({ diffusionModel: 'flux2-dev.gguf' }), 'flux2')
  })

  it('honors explicit preset', () => {
    assert.equal(resolveRefImagePreset({ packId: 'anima', explicitPreset: 'qwen' }), 'qwen')
  })
})

describe('resolveRefImageArgsForConfig', () => {
  const anima = { diffusionModel: 'anima-preview.safetensors' }

  it('off never emits args (legacy binary path)', () => {
    assert.equal(resolveRefImageArgsForConfig('off', anima), '')
  })

  it('auto infers from model', () => {
    assert.equal(resolveRefImageArgsForConfig('auto', anima), 'preset=cosmos_reference')
    assert.equal(resolveRefImageArgsForConfig('auto', { diffusionModel: 'sdxl.safetensors' }), '')
  })

  it('named preset forces args', () => {
    assert.equal(
      resolveRefImageArgsForConfig('flux_kontext', anima),
      'preset=flux_kontext'
    )
  })

  it('builds CLI args string helpers', () => {
    assert.equal(refImageArgsFromPreset('cosmos_reference'), 'preset=cosmos_reference')
    assert.equal(resolveRefImageArgs({ diffusionModel: 'models/diffusion/anima.gguf' }), 'preset=cosmos_reference')
    assert.equal(resolveRefImageArgs({ diffusionModel: 'sdxl.safetensors' }), '')
    assert.equal(resolveRefImageArgs({ explicitPreset: 'off', diffusionModel: 'anima.gguf' }), '')
  })
})
