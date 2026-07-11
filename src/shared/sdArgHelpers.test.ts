import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addGenerationArgs, addHardwareArgs, addOptionalArgs } from './sdArgHelpers.ts'

describe('addGenerationArgs', () => {
  it('builds core generation flags', () => {
    const args: string[] = []
    addGenerationArgs(
      args,
      {
        prompt: 'a cat',
        negative_prompt: 'blurry',
        steps: 12,
        cfg_scale: 3.5,
        width: 768,
        height: 512,
        seed: 42
      },
      '/tmp/out.png',
      { width: 1024, height: 1024, cfg: 7, multiple: 64 }
    )

    assert.deepEqual(args.slice(0, 4), ['-p', 'a cat', '-n', 'blurry'])
    assert.ok(args.includes('--steps'))
    assert.ok(args.includes('12'))
    assert.ok(args.includes('--cfg-scale'))
    assert.ok(args.includes('3.5'))
    assert.ok(args.includes('-W'))
    assert.ok(args.includes('768'))
    assert.ok(args.includes('-H'))
    assert.ok(args.includes('512'))
    assert.ok(args.includes('-s'))
    assert.ok(args.includes('42'))
    assert.ok(args.includes('-o'))
    assert.ok(args.includes('/tmp/out.png'))
  })

  it('defaults seed to -1 when empty', () => {
    const args: string[] = []
    addGenerationArgs(args, { prompt: 'x', seed: '' }, 'out.png', {
      width: 512,
      height: 512,
      cfg: 7,
      multiple: 64
    })
    const seedIdx = args.indexOf('-s')
    assert.equal(args[seedIdx + 1], '-1')
  })
})

describe('addOptionalArgs', () => {
  it('passes cache mode and flow shift', () => {
    const args: string[] = []
    addOptionalArgs(args, {
      cacheMode: 'easycache',
      cacheOption: 'threshold=0.2',
      flowShift: 3,
      samplingMethod: 'euler',
      scheduler: 'discrete'
    })
    assert.ok(args.includes('--cache-mode'))
    assert.ok(args.includes('easycache'))
    assert.ok(args.includes('--cache-option'))
    assert.ok(args.includes('threshold=0.2'))
    assert.ok(args.includes('--flow-shift'))
    assert.ok(args.includes('3'))
    assert.ok(args.includes('--sampling-method'))
    assert.ok(args.includes('euler'))
  })

  it('skips default skip-layer endpoints', () => {
    const args: string[] = []
    addOptionalArgs(args, {
      skipLayerStart: 0.01,
      skipLayerEnd: 0.2
    })
    assert.equal(args.includes('--skip-layer-start'), false)
    assert.equal(args.includes('--skip-layer-end'), false)
  })
})

describe('addHardwareArgs', () => {
  it('applies low-vram style flags', () => {
    const args: string[] = []
    addHardwareArgs(args, {
      diffusionFa: true,
      offloadToCpu: true,
      streamLayers: true,
      maxVram: -1,
      clipOnCpu: true
    })
    assert.ok(args.includes('--diffusion-fa'))
    assert.ok(args.includes('--offload-to-cpu'))
    assert.ok(args.includes('--stream-layers'))
    assert.ok(args.includes('--max-vram'))
    assert.ok(args.includes('-1'))
    assert.ok(args.includes('--clip-on-cpu'))
  })

  it('disables flash attention when lora token present in prompt', () => {
    const args: string[] = []
    addHardwareArgs(args, { diffusionFa: true }, 'a cat <lora:style:1>')
    assert.equal(args.includes('--diffusion-fa'), false)
  })

  it('skips backend assignment when autoFit is on', () => {
    const args: string[] = []
    addHardwareArgs(args, {
      autoFit: true,
      backendAssignment: 'cuda0',
      paramsBackendAssignment: 'cpu'
    })
    assert.ok(args.includes('--auto-fit'))
    assert.equal(args.includes('--backend'), false)
    assert.equal(args.includes('--params-backend'), false)
  })
})
