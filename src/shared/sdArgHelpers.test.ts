import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  addAdetailerArgs,
  addGenerationArgs,
  addHardwareArgs,
  addOptionalArgs,
  buildExtraAdArgs
} from './sdArgHelpers.ts'

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

  it('keeps flash attention when lora token present in prompt', () => {
    const args: string[] = []
    addHardwareArgs(args, { diffusionFa: true }, 'a cat <lora:style:1>')
    assert.ok(args.includes('--diffusion-fa'))
  })

  it('defaults flash attention on when diffusionFa unset', () => {
    const args: string[] = []
    addHardwareArgs(args, {}, 'a cat <lora:style:1>')
    assert.ok(args.includes('--diffusion-fa'))
  })

  it('does not pass --split-mode to sd-cli', () => {
    const args: string[] = []
    addHardwareArgs(args, { splitMode: 'layer', diffusionFa: true }, '')
    assert.equal(args.includes('--split-mode'), false)
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

describe('buildExtraAdArgs / addAdetailerArgs', () => {
  it('serializes structured ADetailer knobs', () => {
    const extra = buildExtraAdArgs({
      adetailerConfidence: 0.3,
      adetailerDenoisingStrength: 0.4,
      adetailerInpaintPadding: 32,
      adetailerMaskBlur: 4,
      adetailerInpaintWidth: 512,
      adetailerInpaintHeight: 512,
      adetailerMaskKLargest: 1,
      adetailerMaskMode: 'merge',
      adetailerSortBy: 'area'
    })
    assert.ok(extra)
    assert.ok(extra!.includes('confidence=0.3'))
    assert.ok(extra!.includes('denoising_strength=0.4'))
    assert.ok(extra!.includes('inpaint_width=512'))
    assert.ok(extra!.includes('mask_k_largest=1'))
    assert.ok(extra!.includes('mask_mode=merge'))
    assert.ok(extra!.includes('sort_by=area'))
  })

  it('skips mask_k_largest when zero and mask_mode none', () => {
    const extra = buildExtraAdArgs({
      adetailerConfidence: 0.3,
      adetailerMaskKLargest: 0,
      adetailerMaskMode: 'none'
    })
    assert.ok(extra)
    assert.equal(extra!.includes('mask_k_largest'), false)
    assert.equal(extra!.includes('mask_mode'), false)
  })

  it('appends free-form extra without duplicating keys', () => {
    const extra = buildExtraAdArgs({
      adetailerConfidence: 0.5,
      adetailerExtraArgs: 'confidence=0.4,input_size=640'
    })
    assert.ok(extra)
    assert.equal((extra!.match(/confidence=/g) || []).length, 1)
    assert.ok(extra!.includes('input_size=640'))
  })

  it('adds --ad-model when enabled with path', () => {
    const args: string[] = []
    addAdetailerArgs(args, {
      adetailerEnabled: true,
      adetailerModelPath: '/models/adetailer/face_yolov8n.safetensors',
      adetailerPrompt: '[PROMPT], detailed face',
      adetailerConfidence: 0.3,
      adetailerDenoisingStrength: 0.4
    })
    assert.equal(args[0], '--ad-model')
    assert.equal(args[1], '/models/adetailer/face_yolov8n.safetensors')
    assert.ok(args.includes('--ad-prompt'))
    assert.ok(args.includes('[PROMPT], detailed face'))
    assert.ok(args.includes('--extra-ad-args'))
  })

  it('skips flags when disabled (post-gen path)', () => {
    const args: string[] = []
    addAdetailerArgs(args, {
      adetailerEnabled: false,
      adetailerModelPath: '/models/adetailer/face.safetensors'
    })
    assert.equal(args.length, 0)
  })

  it('allows standalone mode without enabled flag', () => {
    const args: string[] = []
    addAdetailerArgs(
      args,
      { adetailerModelPath: '/models/adetailer/face.safetensors' },
      { requireEnabled: false }
    )
    assert.equal(args[0], '--ad-model')
  })
})
