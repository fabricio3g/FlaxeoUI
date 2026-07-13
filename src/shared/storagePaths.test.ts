import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { resolveModelStorage } from './storagePaths.ts'

describe('resolveModelStorage', () => {
  it('uses the default root when no override exists', () => {
    const resolved = resolveModelStorage(path.join('data', 'models'), {})
    assert.equal(resolved.modelsRootDir, path.join('data', 'models'))
    assert.equal(resolved.modelDirs.loras, path.join('data', 'models', 'loras'))
  })

  it('moves default categories under a custom models root', () => {
    const resolved = resolveModelStorage(path.join('data', 'models'), {
      modelsRootDir: path.join('library', 'models')
    })
    assert.equal(resolved.modelDirs.diffusion, path.join('library', 'models', 'diffusion'))
    assert.equal(resolved.modelDirs.loras, path.join('library', 'models', 'loras'))
  })

  it('keeps category overrides ahead of the models root', () => {
    const resolved = resolveModelStorage(path.join('data', 'models'), {
      modelsRootDir: path.join('library', 'models'),
      modelDirs: { loras: path.join('special', 'loras') }
    })
    assert.equal(resolved.modelDirs.diffusion, path.join('library', 'models', 'diffusion'))
    assert.equal(resolved.modelDirs.loras, path.join('special', 'loras'))
  })
})
