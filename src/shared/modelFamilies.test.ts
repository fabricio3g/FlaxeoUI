import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MODEL_FAMILIES,
  applyFamily,
  familyById,
  familyMainFiles,
  familyReadiness,
  inferFamily,
  setupStatus,
  setupSummary
} from './modelFamilies.ts'
import {
  DEFAULT_SETUP,
  MACHINE_KEYS,
  RUN_KEYS,
  SETUP_KEYS,
  createSetup,
  matchSlotFile,
  pickMachine,
  pickSetup
} from './modelSetup.ts'
import { hubModels } from '../renderer/src/lib/starterPacks.ts'

describe('setup key groups', () => {
  it('never overlap, so machine settings cannot leak into shared workflows', () => {
    const setup = new Set<string>(SETUP_KEYS)
    for (const key of [...MACHINE_KEYS, ...RUN_KEYS]) assert.ok(!setup.has(key), key)
    const machine = new Set<string>(MACHINE_KEYS)
    for (const key of RUN_KEYS) assert.ok(!machine.has(key), key)
  })

  it('pickSetup keeps the declared shape and drops machine keys', () => {
    const picked = pickSetup({ steps: 30, cpuOffload: true, loras: 'nope', width: '512' })
    assert.equal(picked.steps, 30)
    assert.deepEqual(picked.loras, [])
    assert.equal(picked.width, DEFAULT_SETUP.width)
    assert.ok(!('cpuOffload' in picked))
    assert.equal(pickMachine({ cpuOffload: true }).cpuOffload, true)
  })
})

describe('family catalog', () => {
  it('has unique ids, complete entries and real pack ids', () => {
    const packIds = new Set(hubModels.map((pack) => pack.id))
    const ids = new Set<string>()
    for (const family of MODEL_FAMILIES) {
      assert.ok(!ids.has(family.id), `duplicate ${family.id}`)
      ids.add(family.id)
      assert.ok(family.docs.startsWith('https://'), family.id)
      assert.ok(family.main.match.length > 0, family.id)
      for (const id of family.packIds)
        assert.ok(packIds.has(id), `${family.id} → missing pack ${id}`)
      if (family.support === 'packs') assert.ok(family.packIds.length > 0, family.id)
    }
  })

  it('every hub pack belongs to a family', () => {
    const covered = new Set(MODEL_FAMILIES.flatMap((family) => family.packIds))
    for (const pack of hubModels) assert.ok(covered.has(pack.id), `pack ${pack.id} has no family`)
  })

  it('detects specific variants before their base family', () => {
    const cases: Array<[string, string]> = [
      ['flux1-kontext-dev-Q8_0.gguf', 'flux-kontext'],
      ['flux1-dev-q8_0.gguf', 'flux1-dev'],
      ['flux1-schnell-Q4.gguf', 'flux1-schnell'],
      ['flux3-image-klein-Q4_K.gguf', 'flux3-klein'],
      ['flux-3-image-klein-base.safetensors', 'flux3-klein-base'],
      ['flux2-dev-Q4_K_S.gguf', 'flux2-dev'],
      ['Chroma1-Radiance-v0.4-Q8_0.gguf', 'chroma-radiance'],
      ['Chroma1-HD-Q4_K_M.gguf', 'chroma'],
      ['Qwen_Image_Edit-Q8_0.gguf', 'qwen-image-edit'],
      ['qwen_image_2.1-Q4_K.gguf', 'qwen-image-21'],
      ['qwen-image-Q8_0.gguf', 'qwen-image'],
      ['z_image_turbo-Q4_0.gguf', 'z-image'],
      ['z_image_l2p_1k.safetensors', 'z-image-l2p'],
      ['Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf', 'wan22'],
      ['wan2.1_t2v_1.3B_fp16.safetensors', 'wan21'],
      ['ltx-2.3-22b-dev-UD-Q4_K_M.gguf', 'ltx23'],
      ['sd_xl_base_1.0.safetensors', 'sdxl'],
      ['v1-5-pruned-emaonly.safetensors', 'sd15'],
      ['sd3.5_large.safetensors', 'sd3'],
      ['mage_flow_edit_turbo_bf16.safetensors', 'mage-flow-edit'],
      ['boogu_image_base_bf16.safetensors', 'boogu-image'],
      ['ernie-image-turbo.safetensors', 'ernie-image-turbo']
    ]
    for (const [file, id] of cases) assert.equal(inferFamily(file)?.id, id, file)
  })
})

describe('applyFamily', () => {
  const installed = {
    diffusion: ['flux3-image-klein-Q4_K.gguf', 'sd_xl_base_1.0.safetensors', 'flux1-dev-q8_0.gguf'],
    llm: ['Qwen3VL-4B-Instruct-Q4_K_M.gguf', 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf'],
    vae: ['ae.safetensors', 'flux2_ae.safetensors'],
    clip: ['clip_l.safetensors'],
    t5xxl: ['t5xxl_fp16.safetensors']
  }

  it('fills the main model and every companion from installed files', () => {
    const next = applyFamily(createSetup(), familyById('flux3-klein')!, installed)
    assert.equal(next.modelFamily, 'flux3-klein')
    assert.equal(next.loadMode, 'split')
    assert.equal(next.diffusionModel, 'flux3-image-klein-Q4_K.gguf')
    assert.equal(next.llmModel, 'Qwen3VL-4B-Instruct-Q4_K_M.gguf')
    assert.equal(next.vaeModel, 'flux2_ae.safetensors')
    assert.equal(next.cfgScale, 1)
    assert.equal(next.steps, 16)
    assert.ok(setupStatus(next, installed).ready)
  })

  it('clears companions the new family does not use and keeps LoRAs', () => {
    const flux = applyFamily(createSetup(), familyById('flux1-dev')!, installed)
    assert.equal(flux.clipModel, 'clip_l.safetensors')
    flux.loras = [{ path: 'my_style', strength: 0.7 }]
    const sdxl = applyFamily(flux, familyById('sdxl')!, installed)
    assert.equal(sdxl.loadMode, 'standard')
    assert.equal(sdxl.standardModel, 'sd_xl_base_1.0.safetensors')
    assert.equal(sdxl.clipModel, '')
    assert.equal(sdxl.t5xxlModel, '')
    assert.deepEqual(sdxl.loras, [{ path: 'my_style', strength: 0.7 }])
  })

  it('keeps chosen files when re-applying the same family', () => {
    const first = applyFamily(createSetup(), familyById('flux2-dev')!, {
      ...installed,
      vae: ['flux2_ae.safetensors', 'flux2_ae_alt.safetensors']
    })
    first.vaeModel = 'flux2_ae_alt.safetensors'
    const again = applyFamily(first, familyById('flux2-dev')!, {
      ...installed,
      vae: ['flux2_ae.safetensors', 'flux2_ae_alt.safetensors']
    })
    assert.equal(again.vaeModel, 'flux2_ae_alt.safetensors')
  })

  it('reports missing and stale files', () => {
    const next = applyFamily(createSetup(), familyById('flux1-dev')!, {
      diffusion: ['flux1-dev-q8_0.gguf']
    })
    const status = setupStatus(next, { diffusion: ['flux1-dev-q8_0.gguf'] })
    assert.equal(status.ready, false)
    assert.deepEqual(
      status.missing.map((m) => m.key),
      ['clipModel', 't5xxlModel', 'vaeModel']
    )
    const stale = setupStatus({ ...next, diffusionModel: 'gone.gguf' }, { diffusion: [] })
    assert.equal(stale.stale[0].file, 'gone.gguf')
    assert.match(setupSummary(next), /FLUX\.1 Dev · flux1-dev-q8_0 · 28 steps/)
  })
})

describe('file matching', () => {
  it('honours pattern priority and current choice', () => {
    const files = ['vae.safetensors', 'sdxl_vae.safetensors']
    assert.equal(matchSlotFile(files, [/sdxl.*vae/i, /vae/i]), 'sdxl_vae.safetensors')
    assert.equal(matchSlotFile(files, [/sdxl.*vae/i], 'vae.safetensors'), 'vae.safetensors')
    assert.equal(matchSlotFile(files, [/nope/]), '')
  })

  it('splits main files into family matches and the rest', () => {
    const { matching, other } = familyMainFiles(familyById('sdxl'), {
      diffusion: ['sd_xl_base_1.0.safetensors', 'flux1-dev.gguf']
    })
    assert.deepEqual(matching, ['sd_xl_base_1.0.safetensors'])
    assert.deepEqual(other, ['flux1-dev.gguf'])
  })
})

describe('familyReadiness', () => {
  it('distinguishes ready, partial and not installed', () => {
    const flux3 = familyById('flux3-klein')!
    const full = {
      diffusion: ['flux3-image-klein-Q4_K.gguf'],
      llm: ['Qwen3VL-4B-Instruct-Q4_K_M.gguf'],
      vae: ['flux2_ae.safetensors']
    }
    assert.equal(familyReadiness(flux3, full), 'ready')
    assert.equal(familyReadiness(flux3, { ...full, vae: [] }), 'partial')
    assert.equal(familyReadiness(flux3, { diffusion: [] }), 'none')
  })
})
