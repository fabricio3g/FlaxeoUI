import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyStyleKit,
  cleanMemberName,
  colorName,
  paletteText,
  sanitizeStyleKit,
  type StyleKit
} from './library.ts'

const kit: StyleKit = {
  id: 'kit-1',
  name: 'Acme',
  description: '',
  stylePrompt: 'flat vector, soft grain',
  negativePrompt: 'photo, text',
  palette: ['#ff5500', '#101850'],
  sizes: [],
  loras: [{ path: 'acme_style', strength: 0.8 }],
  createdAt: 1,
  updatedAt: 1,
  updatedBy: ''
}

describe('style kits', () => {
  it('describes the palette with color words, not hex codes', () => {
    assert.equal(colorName('#ff5500'), 'orange')
    assert.equal(colorName('#101850'), 'navy')
    assert.equal(paletteText(kit.palette), 'color palette of orange and navy')
  })

  it('appends style, palette, negatives and LoRAs exactly once', () => {
    const once = applyStyleKit(kit, { prompt: 'a fox', negativePrompt: 'blurry', loras: [] })
    assert.equal(once.prompt, 'a fox, flat vector, soft grain, color palette of orange and navy')
    assert.equal(once.negativePrompt, 'blurry, photo, text')
    assert.deepEqual(once.loras, [{ path: 'acme_style', strength: 0.8 }])
    assert.deepEqual(applyStyleKit(kit, once), once)
  })

  it('rejects LoRA paths and bad colors from imported kits', () => {
    const clean = sanitizeStyleKit({
      ...kit,
      palette: ['#ff5500', 'red', '#12'],
      loras: [
        { path: '../x', strength: 1 },
        { path: 'ok', strength: 9 }
      ]
    })!
    assert.deepEqual(clean.palette, ['#ff5500'])
    assert.deepEqual(clean.loras, [{ path: 'ok', strength: 4 }])
  })
})

describe('member names', () => {
  it('trims to one short line', () => {
    assert.equal(cleanMemberName('  Ana\n Lopez '), 'Ana Lopez')
    assert.equal(cleanMemberName('', 'Guest'), 'Guest')
  })
})
