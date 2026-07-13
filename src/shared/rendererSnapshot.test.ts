import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { generateRendererSnapshotManifest } from '../../generate-renderer-manifest.mjs'
import {
  readRendererSnapshotAsset,
  RendererSnapshotError,
  RENDERER_SNAPSHOT_MANIFEST,
  validateRendererSnapshot
} from './rendererSnapshot.ts'

function createRenderer(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flaxeo-renderer-snapshot-'))
  fs.mkdirSync(path.join(root, 'assets'))
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script>'
  )
  fs.writeFileSync(path.join(root, 'assets', 'app.css'), 'body { color: #123; }')
  fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'console.log("snapshot")')
  return root
}

function expectSnapshotError(code: RendererSnapshotError['code']): (error: unknown) => boolean {
  return (error) => error instanceof RendererSnapshotError && error.code === code
}

describe('renderer snapshot manifests', () => {
  it('generates and validates a complete SHA-256 renderer snapshot', (t) => {
    const root = createRenderer()
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))

    const manifest = generateRendererSnapshotManifest(root, 'test-build-1')
    assert.equal(manifest.version, 1)
    assert.equal(manifest.buildId, 'test-build-1')
    assert.deepEqual(Object.keys(manifest.assets), [
      'assets/app.css',
      'assets/app.js',
      'index.html'
    ])
    for (const asset of Object.values(manifest.assets)) {
      assert.match(asset.sha256, /^[a-f0-9]{64}$/)
      assert.ok(asset.size > 0)
    }

    const snapshot = validateRendererSnapshot(root, { expectedBuildId: 'test-build-1' })
    assert.equal(snapshot.root, fs.realpathSync.native(root))
    assert.equal(
      readRendererSnapshotAsset(snapshot, '/').toString(),
      fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    )
    assert.equal(
      readRendererSnapshotAsset(snapshot, '/assets/app.js').toString(),
      'console.log("snapshot")'
    )
  })

  it('uses a deterministic content build id when none is supplied', (t) => {
    const root = createRenderer()
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))

    const first = generateRendererSnapshotManifest(root)
    const second = generateRendererSnapshotManifest(root)
    assert.match(first.buildId, /^sha256-[a-f0-9]{64}$/)
    assert.equal(second.buildId, first.buildId)
  })

  it('fails closed for changed, missing, and unmanifested assets', (t) => {
    const changedRoot = createRenderer()
    const missingRoot = createRenderer()
    const extraRoot = createRenderer()
    t.after(() => {
      for (const root of [changedRoot, missingRoot, extraRoot]) {
        fs.rmSync(root, { recursive: true, force: true })
      }
    })

    generateRendererSnapshotManifest(changedRoot, 'changed')
    fs.writeFileSync(path.join(changedRoot, 'assets', 'app.js'), 'console.log("tampered")')
    assert.throws(
      () => validateRendererSnapshot(changedRoot),
      expectSnapshotError('ASSET_MISMATCH')
    )

    generateRendererSnapshotManifest(missingRoot, 'missing')
    fs.rmSync(path.join(missingRoot, 'assets', 'app.css'))
    assert.throws(() => validateRendererSnapshot(missingRoot), expectSnapshotError('MISSING_ASSET'))

    generateRendererSnapshotManifest(extraRoot, 'extra')
    fs.writeFileSync(path.join(extraRoot, 'fallback.html'), 'not approved')
    assert.throws(
      () => validateRendererSnapshot(extraRoot),
      expectSnapshotError('UNMANIFESTED_ASSET')
    )
  })

  it('rejects malformed hashes, traversal paths, and build id mismatches', (t) => {
    const malformedRoot = createRenderer()
    const traversalRoot = createRenderer()
    const buildRoot = createRenderer()
    t.after(() => {
      for (const root of [malformedRoot, traversalRoot, buildRoot]) {
        fs.rmSync(root, { recursive: true, force: true })
      }
    })

    const malformed = generateRendererSnapshotManifest(malformedRoot, 'malformed')
    malformed.assets['assets/app.js'].sha256 = 'not-a-sha256'
    fs.writeFileSync(
      path.join(malformedRoot, RENDERER_SNAPSHOT_MANIFEST),
      JSON.stringify(malformed)
    )
    assert.throws(
      () => validateRendererSnapshot(malformedRoot),
      expectSnapshotError('MALFORMED_MANIFEST')
    )

    const traversal = generateRendererSnapshotManifest(traversalRoot, 'traversal')
    traversal.assets['../outside.js'] = traversal.assets['assets/app.js']
    fs.writeFileSync(
      path.join(traversalRoot, RENDERER_SNAPSHOT_MANIFEST),
      JSON.stringify(traversal)
    )
    assert.throws(
      () => validateRendererSnapshot(traversalRoot),
      expectSnapshotError('UNSAFE_ASSET_PATH')
    )

    generateRendererSnapshotManifest(buildRoot, 'actual-build')
    assert.throws(
      () => validateRendererSnapshot(buildRoot, { expectedBuildId: 'other-build' }),
      expectSnapshotError('BUILD_ID_MISMATCH')
    )
  })

  it('rejects missing, external, and malformed index asset references', (t) => {
    const missingRoot = createRenderer()
    const externalRoot = createRenderer()
    const malformedRoot = createRenderer()
    t.after(() => {
      for (const root of [missingRoot, externalRoot, malformedRoot]) {
        fs.rmSync(root, { recursive: true, force: true })
      }
    })

    fs.writeFileSync(
      path.join(missingRoot, 'index.html'),
      '<script src="/assets/missing.js"></script>'
    )
    assert.throws(
      () => generateRendererSnapshotManifest(missingRoot, 'missing-reference'),
      /references missing asset/
    )

    fs.writeFileSync(
      path.join(externalRoot, 'index.html'),
      '<script src="https://example.test/app.js"></script>'
    )
    assert.throws(
      () => generateRendererSnapshotManifest(externalRoot, 'external-reference'),
      /external asset reference/
    )

    fs.writeFileSync(path.join(malformedRoot, 'index.html'), '<script src=/assets/app.js></script>')
    assert.throws(
      () => generateRendererSnapshotManifest(malformedRoot, 'malformed-reference'),
      /must be quoted/
    )
  })

  it('serves validated bytes without rereading a subsequently writable tree', (t) => {
    const root = createRenderer()
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))

    generateRendererSnapshotManifest(root, 'memory-snapshot')
    const snapshot = validateRendererSnapshot(root)
    fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'console.log("changed after validation")')

    assert.equal(
      readRendererSnapshotAsset(snapshot, '/assets/app.js').toString(),
      'console.log("snapshot")'
    )
    assert.throws(
      () => readRendererSnapshotAsset(snapshot, '/../outside.js'),
      expectSnapshotError('UNSAFE_ASSET_PATH')
    )
    assert.throws(
      () => readRendererSnapshotAsset(snapshot, '/fallback.html'),
      expectSnapshotError('MISSING_ASSET')
    )
  })

  it('rejects renderer symlinks instead of following them outside the root', (t) => {
    const root = createRenderer()
    const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.js`)
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(outside, { force: true })
    })
    fs.writeFileSync(outside, 'private')

    try {
      fs.symlinkSync(outside, path.join(root, 'assets', 'outside.js'), 'file')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('Creating symlinks requires additional Windows privileges')
        return
      }
      throw error
    }
    assert.throws(() => generateRendererSnapshotManifest(root, 'symlink'), /symbolic links/)
  })
})
