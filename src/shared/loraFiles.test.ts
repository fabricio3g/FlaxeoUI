import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { listLoraFiles, loraLookupNames, normalizeLoraName } from './loraFiles.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flaxeo-loras-'))
fs.mkdirSync(path.join(root, 'characters'), { recursive: true })
fs.writeFileSync(path.join(root, 'flat.safetensors'), '')
fs.writeFileSync(path.join(root, 'characters', 'hero.gguf'), '')
fs.writeFileSync(path.join(root, 'characters', 'notes.txt'), '')

after(() => fs.rmSync(root, { recursive: true, force: true }))

describe('LoRA file discovery', () => {
  it('lists supported files recursively', () => {
    const files = listLoraFiles(root).map((file) => file.replace(/\\/g, '/'))
    assert.deepEqual(files, ['characters/hero.gguf', 'flat.safetensors'])
  })

  it('matches relative paths and prompt basenames', () => {
    const names = loraLookupNames(listLoraFiles(root))
    assert.equal(names.has('characters/hero'), true)
    assert.equal(names.has('hero'), true)
    assert.equal(names.has('flat'), true)
  })

  it('normalizes separators and extensions', () => {
    assert.equal(normalizeLoraName('characters\\hero.SAFETENSORS'), 'characters/hero')
  })
})
