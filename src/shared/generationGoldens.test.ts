/**
 * Golden CLI arg vectors for multi-mode fixtures (no GPU / no filesystem model resolution).
 * Locks the pure arg builders used by image / inpaint / video / upscale routes.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  addGenerationArgs,
  addHardwareArgs,
  addOptionalArgs,
  pushArg,
  pushNumericArg
} from './sdArgHelpers.ts'

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx >= 0 ? args[idx + 1] : undefined
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

describe('golden: text2image core args', () => {
  it('matches stable snapshot for standard t2i body', () => {
    const args: string[] = []
    const body = {
      prompt: 'a red fox',
      negative_prompt: 'blur',
      steps: 8,
      cfg_scale: 1,
      width: 1024,
      height: 1024,
      seed: 123,
      samplingMethod: 'euler',
      scheduler: 'discrete',
      cacheMode: 'easycache',
      cacheOption: 'threshold=0.2',
      diffusionFa: true,
      streamLayers: true,
      maxVram: -1,
      threads: 8
    }

    addGenerationArgs(args, body, '/tmp/out/gen.png', {
      width: 1024,
      height: 1024,
      cfg: 7,
      multiple: 64
    })
    addOptionalArgs(args, body)
    addHardwareArgs(args, body, String(body.prompt))

    assert.equal(flagValue(args, '-p'), 'a red fox')
    assert.equal(flagValue(args, '-n'), 'blur')
    assert.equal(flagValue(args, '--steps'), '8')
    assert.equal(flagValue(args, '--cfg-scale'), '1')
    assert.equal(flagValue(args, '-W'), '1024')
    assert.equal(flagValue(args, '-H'), '1024')
    assert.equal(flagValue(args, '-s'), '123')
    assert.equal(flagValue(args, '-o'), '/tmp/out/gen.png')
    assert.equal(flagValue(args, '--sampling-method'), 'euler')
    assert.equal(flagValue(args, '--scheduler'), 'discrete')
    assert.equal(flagValue(args, '--cache-mode'), 'easycache')
    assert.equal(flagValue(args, '--cache-option'), 'threshold=0.2')
    assert.ok(hasFlag(args, '--diffusion-fa'))
    assert.ok(hasFlag(args, '--stream-layers'))
    assert.equal(flagValue(args, '--max-vram'), '-1')
    assert.equal(flagValue(args, '--threads'), '8')
  })
})

describe('golden: inpaint args', () => {
  it('includes strength and core generation flags', () => {
    const args: string[] = []
    const body = {
      prompt: 'fix wall',
      steps: 20,
      cfg_scale: 7,
      width: 768,
      height: 512,
      seed: 7,
      strength: 0.65,
      diffusionFa: true,
      offloadToCpu: true
    }

    args.push('-i', '/tmp/init.png')
    args.push('--mask', '/tmp/mask.png')
    const strength = Math.min(1, Math.max(0, Number(body.strength)))
    args.push('--strength', String(strength))
    addGenerationArgs(args, body, '/tmp/out/inpaint.png', {
      width: 1024,
      height: 1024,
      cfg: 7,
      multiple: 64
    })
    addOptionalArgs(args, body)
    addHardwareArgs(args, body, String(body.prompt))

    assert.equal(flagValue(args, '-i'), '/tmp/init.png')
    assert.equal(flagValue(args, '--mask'), '/tmp/mask.png')
    assert.equal(flagValue(args, '--strength'), '0.65')
    assert.equal(flagValue(args, '-W'), '768')
    assert.equal(flagValue(args, '-H'), '512')
    assert.ok(hasFlag(args, '--diffusion-fa'))
    assert.ok(hasFlag(args, '--offload-to-cpu'))
  })
})

describe('golden: video args', () => {
  it('builds vid_gen shape with frames, fps, flow-shift, high-noise', () => {
    const args: string[] = ['-M', 'vid_gen']
    const body = {
      prompt: 'camera pan over mountains',
      steps: 20,
      cfg_scale: 6,
      width: 832,
      height: 480,
      seed: 99,
      video_frames: 33,
      fps: 24,
      flow_shift: 3,
      highNoiseSteps: 10,
      highNoiseCfg: 3.5,
      highNoiseSampler: 'euler',
      moeBoundary: 0.875,
      vaceStrength: 1,
      diffusionFa: true
    }

    args.push('-i', '/tmp/start.png')
    args.push('--end-img', '/tmp/end.png')
    args.push('--control-video', '/tmp/frames')
    addGenerationArgs(args, body, '/tmp/out/video.mp4', {
      width: 832,
      height: 480,
      cfg: 6,
      multiple: 16
    })
    args.push('--video-frames', String(body.video_frames))
    args.push('--fps', String(body.fps))
    args.push('--flow-shift', String(body.flow_shift))
    pushNumericArg(args, '--vace-strength', body.vaceStrength, (v) => v > 0)
    pushNumericArg(args, '--moe-boundary', body.moeBoundary, (v) => v !== 0)
    pushArg(args, '--high-noise-cfg-scale', body.highNoiseCfg)
    pushArg(args, '--high-noise-steps', body.highNoiseSteps)
    pushArg(args, '--high-noise-sampling-method', body.highNoiseSampler)
    addOptionalArgs(args, body)
    addHardwareArgs(args, body, String(body.prompt))

    assert.equal(args[0], '-M')
    assert.equal(args[1], 'vid_gen')
    assert.equal(flagValue(args, '-i'), '/tmp/start.png')
    assert.equal(flagValue(args, '--end-img'), '/tmp/end.png')
    assert.equal(flagValue(args, '--control-video'), '/tmp/frames')
    assert.equal(flagValue(args, '--video-frames'), '33')
    assert.equal(flagValue(args, '--fps'), '24')
    assert.equal(flagValue(args, '--flow-shift'), '3')
    assert.equal(flagValue(args, '--high-noise-steps'), '10')
    assert.equal(flagValue(args, '--high-noise-cfg-scale'), '3.5')
    assert.equal(flagValue(args, '--high-noise-sampling-method'), 'euler')
    assert.equal(flagValue(args, '--moe-boundary'), '0.875')
    assert.equal(flagValue(args, '--vace-strength'), '1')
    assert.equal(flagValue(args, '-W'), '832')
    assert.equal(flagValue(args, '-H'), '480')
  })
})

describe('golden: upscale args', () => {
  it('builds -M upscale with model and hardware', () => {
    const args: string[] = [
      '-M',
      'upscale',
      '-i',
      '/tmp/src.png',
      '-o',
      '/tmp/out/upscale.png',
      '--upscale-model',
      '/models/upscale/4x.esrgon.pth'
    ]
    const body = {
      upscaleRepeats: 2,
      upscaleTileSize: 512,
      offloadToCpu: true,
      diffusionFa: true,
      streamLayers: true,
      maxVram: -1,
      threads: 4
    }

    const repeats = parseInt(String(body.upscaleRepeats), 10)
    if (Number.isFinite(repeats) && repeats > 1) args.push('--upscale-repeats', String(repeats))
    const tileSize = parseInt(String(body.upscaleTileSize), 10)
    if (Number.isFinite(tileSize) && tileSize > 0) args.push('--upscale-tile-size', String(tileSize))
    addHardwareArgs(args, body)

    assert.equal(args[0], '-M')
    assert.equal(args[1], 'upscale')
    assert.equal(flagValue(args, '--upscale-model'), '/models/upscale/4x.esrgon.pth')
    assert.equal(flagValue(args, '--upscale-repeats'), '2')
    assert.equal(flagValue(args, '--upscale-tile-size'), '512')
    assert.ok(hasFlag(args, '--offload-to-cpu'))
    assert.ok(hasFlag(args, '--stream-layers'))
    assert.equal(flagValue(args, '--max-vram'), '-1')
  })
})

describe('golden: hardware Low VRAM profile flags', () => {
  it('emits offload + stream + max-vram auto', () => {
    const args: string[] = []
    addHardwareArgs(args, {
      offloadToCpu: true,
      streamLayers: true,
      maxVram: -1,
      diffusionFa: true
    })
    assert.ok(hasFlag(args, '--offload-to-cpu'))
    assert.ok(hasFlag(args, '--stream-layers'))
    assert.equal(flagValue(args, '--max-vram'), '-1')
    assert.ok(hasFlag(args, '--diffusion-fa'))
  })

  it('skips diffusion-fa when prompt already has lora tokens', () => {
    const args: string[] = []
    addHardwareArgs(
      args,
      { diffusionFa: true },
      'portrait <lora:style:0.8>'
    )
    assert.equal(hasFlag(args, '--diffusion-fa'), false)
  })
})

