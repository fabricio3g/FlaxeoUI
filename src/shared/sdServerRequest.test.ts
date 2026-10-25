import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cliOnlyReason, imgGenRequest, splitLoraTags } from './sdServerRequest.ts'
import { classifyLanEndpoint } from './lanPolicy.ts'

describe('sd-server request mapping', () => {
  it('turns prompt LoRA tags into the structured list', () => {
    const { prompt, loras } = splitLoraTags(
      'a cat <lora:pixel:0.8>, cozy <lora:|high_noise|wan_fast:1>',
      [
        { path: 'loras/pixel.safetensors', strength: 0.5 },
        { path: 'detail.safetensors', strength: 0.7 }
      ]
    )
    assert.equal(prompt, 'a cat, cozy')
    assert.deepEqual(loras, [
      { path: 'pixel', multiplier: 0.8 },
      { path: 'detail', multiplier: 0.7 },
      { path: 'wan_fast', multiplier: 1, is_high_noise: true }
    ])
  })

  it('sends the same sampling settings sd-cli gets', () => {
    const request = imgGenRequest(
      {
        prompt: 'a fox <lora:ink:1>',
        negative_prompt: 'blurry',
        steps: 8,
        cfg_scale: 1,
        guidance: 3.5,
        width: 768,
        height: 512,
        seed: 42,
        batchCount: 2,
        samplingMethod: 'euler',
        scheduler: 'simple',
        clipSkip: -1,
        flowShift: 3,
        slgScale: 2.5,
        skipLayers: '[7,8,9]'
      },
      { refs: [] },
      new Map([['ink', 'loras/ink.safetensors']])
    )
    assert.equal(request.prompt, 'a fox')
    assert.equal(request.negative_prompt, 'blurry')
    assert.equal(request.width, 768)
    assert.equal(request.seed, 42)
    assert.equal(request.batch_count, 2)
    assert.equal(request.clip_skip, undefined)
    assert.equal(request.strength, undefined)
    assert.deepEqual(request.lora, [{ path: 'loras/ink.safetensors', multiplier: 1 }])
    assert.deepEqual(request.sample_params, {
      sample_method: 'euler',
      scheduler: 'simple',
      sample_steps: 8,
      eta: undefined,
      flow_shift: 3,
      shifted_timestep: undefined,
      custom_sigmas: undefined,
      guidance: {
        txt_cfg: 1,
        img_cfg: undefined,
        distilled_guidance: 3.5,
        slg: { layers: [7, 8, 9], layer_start: undefined, layer_end: undefined, scale: 2.5 }
      }
    })
  })

  it('carries image inputs and strength for edits', () => {
    const request = imgGenRequest(
      { prompt: 'x', img2imgStrength: 0.6, refImageArgs: 'preset=edit' },
      { init: 'AAA', mask: 'BBB', refs: ['CCC'] }
    )
    assert.equal(request.init_image, 'AAA')
    assert.equal(request.mask_image, 'BBB')
    assert.deepEqual(request.ref_images, ['CCC'])
    assert.equal(request.ref_image_args, 'preset=edit')
    assert.equal(request.strength, 0.6)
  })

  it('keeps features sd-server lacks on sd-cli', () => {
    assert.equal(cliOnlyReason({ prompt: 'x' }), '')
    assert.equal(cliOnlyReason({ hiresEnabled: true }), 'hi-res fix')
    assert.equal(cliOnlyReason({ videoMode: 'true' }), 'video')
    assert.equal(cliOnlyReason({ controlNet: 'canny.safetensors' }), 'ControlNet')
    assert.equal(cliOnlyReason({ cliOptions: '{"--foo":1}' }), 'extra sd.cpp options')
    assert.equal(cliOnlyReason({ cliOptions: '{}' }), '')
  })

  it('keeps the keep-loaded switch desktop only', () => {
    assert.equal(classifyLanEndpoint('POST', '/api/loaded-model'), null)
    assert.equal(classifyLanEndpoint('POST', '/api/generate'), null)
  })
})
