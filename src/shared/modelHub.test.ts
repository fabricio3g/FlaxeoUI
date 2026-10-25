import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  civitaiCategory,
  parseHfUrl,
  pickForTier,
  quantSiblings,
  guessCategory,
  isRepoId,
  pickFamilyRepo,
  quantOf,
  readmeImage
} from './modelHub.ts'

// Links as they appear in stable-diffusion.cpp docs/flux.md
const FLUX_DOC_LINKS = [
  'https://huggingface.co/leejet/FLUX.1-dev-gguf',
  'https://huggingface.co/leejet/FLUX.1-schnell-gguf',
  'https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/flux1-dev.safetensors',
  'https://huggingface.co/black-forest-labs/FLUX.1-schnell/blob/main/flux1-schnell.safetensors',
  'https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/ae.safetensors',
  'https://huggingface.co/comfyanonymous/flux_text_encoders/blob/main/clip_l.safetensors',
  'https://huggingface.co/XLabs-AI/flux-lora-collection/tree/main'
]

describe('model hub', () => {
  it('picks the official repo for each family sharing a doc', () => {
    assert.equal(
      pickFamilyRepo('FLUX.1 Dev', 'flux1-dev', FLUX_DOC_LINKS),
      'black-forest-labs/FLUX.1-dev'
    )
    assert.equal(
      pickFamilyRepo('FLUX.1 Schnell', 'flux1-schnell', FLUX_DOC_LINKS),
      'black-forest-labs/FLUX.1-schnell'
    )
    assert.equal(pickFamilyRepo('Anything', 'x', []), '')
  })

  it('finds the first real picture in a model card', () => {
    const card = [
      '![license](https://img.shields.io/badge/license-apache-blue)',
      '<img src="assets/logo.svg">',
      '![teaser](./assets/teaser.jpg)',
      '![later](https://example.com/b.png)'
    ].join('\n')
    assert.equal(
      readmeImage(card, 'org/model'),
      'https://huggingface.co/org/model/resolve/main/assets/teaser.jpg'
    )
    assert.equal(readmeImage('no pictures', 'org/model'), '')
  })

  it('guesses the models folder from a file name', () => {
    assert.equal(guessCategory('flux1-dev-Q4_K_S.gguf'), 'diffusion')
    assert.equal(guessCategory('split_files/vae/ae.safetensors'), 'vae')
    assert.equal(guessCategory('umt5-xxl-encoder-Q8_0.gguf'), 't5xxl')
    assert.equal(guessCategory('Qwen3-4B-Q4_K_M.gguf'), 'llm')
    assert.equal(guessCategory('mmproj-F16.gguf'), 'llm_vision')
    assert.equal(guessCategory('pixel_lora.safetensors'), 'loras')
    assert.equal(civitaiCategory('LORA'), 'loras')
    assert.equal(civitaiCategory('Checkpoint'), 'diffusion')
  })

  it('reads the quantization and checks repo ids', () => {
    assert.equal(quantOf('flux1-dev-Q4_K_S.gguf'), 'Q4_K_S')
    assert.equal(quantOf('wan2.2-Q8_0.gguf'), 'Q8_0')
    assert.equal(quantOf('model-bf16.safetensors'), 'BF16')
    assert.equal(quantOf('model.safetensors'), '')
    assert.equal(isRepoId('city96/FLUX.1-dev-gguf'), true)
    assert.equal(isRepoId('../etc/passwd'), false)
    assert.equal(isRepoId('a/b/c'), false)
  })
})

describe('quantized variants', () => {
  const repo = [
    'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q3_K_S.gguf',
    'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q4_0.gguf',
    'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q4_K_M.gguf',
    'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q6_K.gguf',
    'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf',
    'HighNoise/Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf',
    'LowNoise/Wan2.2-T2V-A14B-LowNoise-F16.gguf'
  ]

  it('finds the same file in other quantizations only', () => {
    const siblings = quantSiblings('LowNoise/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf', repo)
    assert.equal(siblings.length, 6)
    assert.ok(!siblings.some((s) => s.startsWith('HighNoise')))
    assert.equal(quantSiblings('vae/ae.safetensors', repo).length, 0)
  })

  it('picks a variant per tier', () => {
    const siblings = quantSiblings(repo[0], repo)
    assert.equal(pickForTier(siblings, 'small'), 'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q4_K_M.gguf')
    assert.equal(pickForTier(siblings, 'balanced'), 'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q6_K.gguf')
    assert.equal(pickForTier(siblings, 'quality'), 'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf')
  })

  it('reads Hugging Face download links', () => {
    assert.deepEqual(
      parseHfUrl(
        'https://huggingface.co/QuantStack/Wan2.2-T2V-A14B-GGUF/resolve/main/LowNoise/a%20b-Q8_0.gguf?download=true'
      ),
      { repo: 'QuantStack/Wan2.2-T2V-A14B-GGUF', path: 'LowNoise/a b-Q8_0.gguf' }
    )
    assert.equal(parseHfUrl('https://civitai.com/api/download/models/1'), null)
  })
})
