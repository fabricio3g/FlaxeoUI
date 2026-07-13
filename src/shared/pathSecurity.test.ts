import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { resolveStoredPath } from './pathSecurity.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flaxeo-path-security-'))
const outputDir = path.join(root, 'output')
const tempDir = path.join(root, 'temp')
const modelDir = path.join(root, 'models')
const outsideDir = path.join(root, 'outside')
for (const directory of [outputDir, tempDir, modelDir, outsideDir]) {
  fs.mkdirSync(directory, { recursive: true })
}

const outputFile = path.join(outputDir, 'image one.png')
const tempFile = path.join(tempDir, 'upload.png')
const modelFile = path.join(modelDir, 'model.gguf')
const outsideFile = path.join(outsideDir, 'private.txt')
for (const file of [outputFile, tempFile, modelFile, outsideFile]) fs.writeFileSync(file, 'test')
fs.mkdirSync(path.join(outputDir, 'frames'))

after(() => fs.rmSync(root, { recursive: true, force: true }))

describe('resolveStoredPath', () => {
  const roots = [outputDir, tempDir, modelDir]

  it('accepts output filenames and output URLs', () => {
    assert.equal(resolveStoredPath('image one.png', outputDir, roots), fs.realpathSync(outputFile))
    assert.equal(
      resolveStoredPath('/output/image%20one.png', outputDir, roots),
      fs.realpathSync(outputFile)
    )
    assert.equal(
      resolveStoredPath('http://localhost:3000/output/image%20one.png?cache=1', outputDir, roots),
      fs.realpathSync(outputFile)
    )
  })

  it('accepts absolute files only inside approved roots', () => {
    assert.equal(resolveStoredPath(tempFile, outputDir, roots), fs.realpathSync(tempFile))
    assert.equal(resolveStoredPath(modelFile, outputDir, roots), fs.realpathSync(modelFile))
    assert.equal(resolveStoredPath(outsideFile, outputDir, roots), null)
  })

  it('rejects traversal, unsupported URLs, missing files, and wrong types', () => {
    assert.equal(resolveStoredPath('../outside/private.txt', outputDir, roots), null)
    assert.equal(resolveStoredPath('/output/%2e%2e/outside/private.txt', outputDir, roots), null)
    assert.equal(resolveStoredPath('file:///private.txt', outputDir, roots), null)
    assert.equal(resolveStoredPath('https://example.test/private.txt', outputDir, roots), null)
    assert.equal(resolveStoredPath('missing.png', outputDir, roots), null)
    assert.equal(resolveStoredPath('frames', outputDir, roots), null)
    assert.equal(resolveStoredPath('image\0.png', outputDir, roots), null)
  })

  it('uses separate file and directory policies', () => {
    assert.equal(
      resolveStoredPath('frames', outputDir, roots, 'directory'),
      fs.realpathSync(path.join(outputDir, 'frames'))
    )
    assert.equal(resolveStoredPath('image one.png', outputDir, roots, 'directory'), null)
    assert.equal(resolveStoredPath(tempFile, outputDir, [outputDir]), null)
  })

  it('rejects symlinks that escape approved roots', (t) => {
    const link = path.join(outputDir, 'outside-link.txt')
    try {
      fs.symlinkSync(outsideFile, link, 'file')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('Creating symlinks requires additional Windows privileges')
        return
      }
      throw error
    }
    assert.equal(resolveStoredPath(link, outputDir, [outputDir]), null)
  })
})
