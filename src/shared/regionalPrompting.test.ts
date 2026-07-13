import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_REGIONAL_PROMPTS,
  composeRegionalPrompt,
  normalizedRectToPixels,
  normalizeRegionalPromptRegions,
  type RegionalPromptRegion
} from './regionalPrompting.ts'

describe('normalizeRegionalPromptRegions', () => {
  it('rejects non-arrays and invalid regions', () => {
    assert.deepEqual(normalizeRegionalPromptRegions(null), [])
    assert.deepEqual(
      normalizeRegionalPromptRegions([
        null,
        { id: 'nan', x: Number.NaN, y: 0, width: 1, height: 1, prompt: 'ignored' },
        { id: 'tiny', x: 0, y: 0, width: 0.009, height: 1, prompt: 'ignored' }
      ]),
      []
    )
  })

  it('clamps regions to bounds and trims text', () => {
    assert.deepEqual(
      normalizeRegionalPromptRegions([
        { id: '  subject  ', x: -0.2, y: 0.25, width: 2, height: 0.9, prompt: '  red hat  ' }
      ]),
      [{ id: 'subject', x: 0, y: 0.25, width: 1, height: 0.75, prompt: 'red hat' }]
    )
  })

  it('creates stable unique ids and caps the result', () => {
    const input = Array.from({ length: 6 }, (_, index) => ({
      id: index < 2 ? 'same' : ' ',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      prompt: ` region ${index} `
    }))

    const regions = normalizeRegionalPromptRegions(input)
    assert.equal(regions.length, MAX_REGIONAL_PROMPTS)
    assert.deepEqual(
      regions.map((region) => region.id),
      ['same', 'same-2', 'region-3', 'region-4']
    )
    assert.deepEqual(regions, normalizeRegionalPromptRegions(input))
  })
})

describe('normalizedRectToPixels', () => {
  const region = (values: Partial<RegionalPromptRegion>): RegionalPromptRegion => ({
    id: 'region',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    prompt: '',
    ...values
  })

  it('converts normalized edges to bounded integer pixels', () => {
    assert.deepEqual(
      normalizedRectToPixels(region({ x: 0.25, y: 0.1, width: 0.5, height: 0.4 }), 100, 50),
      {
        x: 25,
        y: 5,
        width: 50,
        height: 20
      }
    )
  })

  it('keeps tiny and out-of-range rectangles inside the image', () => {
    assert.deepEqual(normalizedRectToPixels(region({ x: 2, y: -1, width: 2, height: 0 }), 10, 8), {
      x: 9,
      y: 0,
      width: 1,
      height: 1
    })
  })
})

describe('composeRegionalPrompt', () => {
  it('joins nonempty trimmed prompts with the main prompt first', () => {
    assert.equal(
      composeRegionalPrompt('  portrait photo ', ' blue eyes  '),
      'portrait photo, blue eyes'
    )
    assert.equal(composeRegionalPrompt('', ' blue eyes '), 'blue eyes')
    assert.equal(composeRegionalPrompt('portrait photo ', '   '), 'portrait photo')
  })
})
