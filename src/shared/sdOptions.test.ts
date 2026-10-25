import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { findOption, parseSdHelp } from './sdHelp.ts'
import {
  OPTION_CATALOG,
  appendCliOptions,
  checkArgValues,
  extraHelpOptions,
  optionChoices
} from './sdOptionCatalog.ts'
import { DEFAULT_SETUP, SETUP_KEYS } from './modelSetup.ts'
import {
  applyFamily,
  applyRecommendations,
  familyById,
  familyRecommendations
} from './modelFamilies.ts'

const helpText = fs.readFileSync(path.join(import.meta.dirname, '../../sd-cli-help.txt'), 'utf8')
const help = parseSdHelp(helpText)

describe('parseSdHelp', () => {
  it('reads every option with its section, type and aliases', () => {
    assert.ok(help.options.length > 150)
    const width = findOption(help, '-W')!
    assert.equal(width.flag, '--width')
    assert.equal(width.type, 'int')
    assert.equal(width.section, 'Generation')
    assert.equal(findOption(help, '--cfg-scale')!.type, 'float')
    assert.equal(findOption(help, '--fa')!.type, 'bool')
    assert.equal(findOption(help, '--vae')!.type, 'string')
  })

  it('reads enums, including lists that wrap across lines', () => {
    const sampler = findOption(help, '--sampling-method')!
    assert.equal(sampler.type, 'enum')
    assert.ok(sampler.choices!.includes('euler_a'))
    assert.ok(sampler.choices!.includes('lms'))
    assert.ok(findOption(help, '--scheduler')!.choices!.includes('beta'))
    assert.deepEqual(findOption(help, '--rng')!.choices, ['std_default', 'cuda', 'cpu'])
  })

  it('treats typeless value options as text and reads defaults', () => {
    assert.equal(findOption(help, '--sigmas')!.type, 'string')
    assert.equal(findOption(help, '--skip-layers')!.type, 'string')
    assert.equal(findOption(help, '--steps')!.defaultValue, '20')
    assert.equal(findOption(help, '--ref-image')!.repeatable, true)
  })
})

describe('option catalog', () => {
  it('only names setup keys and flags the captured sd-cli has', () => {
    for (const option of OPTION_CATALOG) {
      assert.ok(SETUP_KEYS.includes(option.key), `${option.key} is a setup key`)
      // --tokenizer is newer than the captured help; everything else must exist.
      if (option.flag && option.flag !== '--tokenizer') {
        assert.ok(findOption(help, option.flag), `${option.flag} exists in sd-cli --help`)
      }
    }
  })

  it('gets select choices from the help when the catalog has none', () => {
    const scheduler = OPTION_CATALOG.find((option) => option.key === 'scheduler')!
    assert.ok(optionChoices(scheduler, help).some((choice) => choice.value === 'karras'))
  })

  it('offers uncatalogued flags but never paths, outputs or app-managed flags', () => {
    const extra = extraHelpOptions(help).map((option) => option.flag)
    assert.ok(extra.includes('--hires-sigmas'))
    assert.ok(extra.includes('--increase-ref-index'))
    for (const flag of [
      '--output',
      '--mode',
      '--init-img',
      '--lora-model-dir',
      '--seed',
      '--vae'
    ]) {
      assert.ok(!extra.includes(flag), `${flag} is not offered`)
    }
  })
})

describe('appendCliOptions', () => {
  it('appends valid options and skips unset ones', () => {
    const args = ['-p', 'cat']
    appendCliOptions(
      args,
      { '--hires-sigmas': '0.85,0.5,0.0', '--increase-ref-index': true, '--upscale-repeats': '' },
      help
    )
    assert.deepEqual(args, ['-p', 'cat', '--hires-sigmas', '0.85,0.5,0.0', '--increase-ref-index'])
  })

  it('rejects flags the app manages and values with paths or the wrong type', () => {
    assert.throws(() => appendCliOptions([], { '--output': 'x.png' }, help), /not an option/)
    assert.throws(() => appendCliOptions([], { '--not-a-flag': 1 }, help), /not an option/)
    assert.throws(() => appendCliOptions([], { '--hires-sigmas': '../../etc' }, help), /paths/)
    assert.throws(
      () => appendCliOptions([], { '--high-noise-slg-scale': 'lots' }, help),
      /a number/
    )
  })
})

describe('checkArgValues', () => {
  it('accepts listed choices, aliases and numbers', () => {
    checkArgValues(['--sampling-method', 'euler_a', '--scheduler', 'normal', '--steps', '8'], help)
    checkArgValues(['-p', '--rng is not a flag here', '--cfg-scale', '3.5'], help)
  })

  it('names the flag and the choices when a value is wrong', () => {
    assert.throws(
      () => checkArgValues(['--scheduler', 'fancy'], help),
      /"fancy" for --scheduler.*karras/
    )
    assert.throws(() => checkArgValues(['--steps', 'many'], help), /number for --steps/)
  })
})

describe('family recommendations', () => {
  const installed = { diffusion: ['flux3-image-klein-Q4_K.gguf', 'sd_xl_base_1.0.safetensors'] }

  it('never overwrites values the user tuned', () => {
    const tuned = { ...DEFAULT_SETUP, steps: 33 }
    const next = applyFamily(tuned, familyById('flux3-klein')!, installed)
    assert.equal(next.steps, 33)
    assert.equal(next.cfgScale, 1)
    const advice = familyRecommendations(next, familyById('flux3-klein')!)
    assert.ok(advice.some((item) => item.key === 'steps'))
    assert.equal(applyRecommendations(next, familyById('flux3-klein')!).steps, 16)
  })
})
