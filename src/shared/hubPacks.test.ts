import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hubModels } from '../renderer/src/lib/starterPacks.ts'
import { resolveModelDirectoryKey } from './storage.ts'

describe('hub pack file categories', () => {
  it('every category resolves to a real model directory', () => {
    const unresolved: string[] = []
    for (const pack of hubModels) {
      for (const file of pack.files) {
        if (!resolveModelDirectoryKey(file.category)) {
          unresolved.push(`${pack.id}: ${file.category}`)
        }
      }
    }
    // A category the server cannot resolve makes /api/models/download return 400
    assert.deepEqual(unresolved, [])
  })

  it('resolves the clipG aliases used by the SD3.5 pack', () => {
    assert.equal(resolveModelDirectoryKey('clipG'), 'clip')
    assert.equal(resolveModelDirectoryKey('clip_g'), 'clip')
  })

  it('rejects unknown categories', () => {
    assert.equal(resolveModelDirectoryKey('not_a_directory'), null)
    assert.equal(resolveModelDirectoryKey(''), null)
  })

  it('every pack downloads at least one required file', () => {
    for (const pack of hubModels) {
      assert.ok(
        pack.files.some((file) => file.required),
        `${pack.id} has no required file`
      )
    }
  })
})
