import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { hasHelpFlag, parseCliHelp } from './cliHelp.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const cliHelp = fs.readFileSync(path.join(repoRoot, 'sd-cli-help.txt'), 'utf8')

describe('parseCliHelp', () => {
  const info = parseCliHelp(cliHelp)

  it('finds flags the app already emits', () => {
    for (const flag of ['--cfg-scale', '--diffusion-model', '--control-net', '--ad-model']) {
      assert.ok(hasHelpFlag(info.flags, flag), `expected ${flag}`)
    }
  })

  it('finds flags the app does not emit yet', () => {
    for (const flag of ['--hires', '--model-args', '--pulid-weights', '--fa']) {
      assert.ok(hasHelpFlag(info.flags, flag), `expected ${flag}`)
    }
  })

  it('does not advertise the legacy chroma flags folded into --model-args', () => {
    for (const flag of ['--chroma-enable-t5-mask', '--chroma-disable-dit-mask']) {
      assert.equal(hasHelpFlag(info.flags, flag), false, `unexpected ${flag}`)
    }
  })

  it('collects generation modes', () => {
    for (const mode of ['img_gen', 'vid_gen', 'upscale', 'convert']) {
      assert.ok(info.modes.includes(mode), `expected mode ${mode}`)
    }
  })

  it('drops --help and -h', () => {
    assert.equal(hasHelpFlag(info.flags, '--help'), false)
    assert.equal(hasHelpFlag(info.flags, '-h'), false)
  })

  it('returns empty inventories for junk input', () => {
    const empty = parseCliHelp('')
    assert.deepEqual(empty.flags, [])
    assert.deepEqual(empty.modes, [])
  })
})

describe('hasHelpFlag', () => {
  it('matches exactly, never by prefix', () => {
    // --hires-width must not imply the hires feature itself
    assert.equal(hasHelpFlag(['--hires-width'], '--hires'), false)
    assert.equal(hasHelpFlag(['--hires', '--hires-width'], '--hires'), true)
  })

  it('accepts bare names', () => {
    assert.equal(hasHelpFlag(['--model-args'], 'model-args'), true)
  })

  it('handles empty input', () => {
    assert.equal(hasHelpFlag([], '--hires'), false)
    assert.equal(hasHelpFlag(['--hires'], ''), false)
  })
})
