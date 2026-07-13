import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LAN_ACCESS_LEVELS,
  classifyLanEndpoint,
  evaluateLanRequest,
  isCanonicalLanMediaId,
  isLanRequestAllowed,
  lanAccessIncludes,
  type LanAccessLevel,
  type LanEndpointClass
} from './lanPolicy.ts'

function expectClass(
  endpointClass: LanEndpointClass,
  endpoints: ReadonlyArray<readonly [string, string]>
): void {
  for (const [method, path] of endpoints) {
    assert.equal(classifyLanEndpoint(method, path), endpointClass, `${method} ${path}`)
  }
}

describe('LAN endpoint policy', () => {
  it('defines the access-level hierarchy', () => {
    assert.deepEqual(LAN_ACCESS_LEVELS, ['generation', 'gallery', 'control'])
    assert.equal(lanAccessIncludes('generation', 'generation'), true)
    assert.equal(lanAccessIncludes('generation', 'gallery'), false)
    assert.equal(lanAccessIncludes('gallery', 'generation'), true)
    assert.equal(lanAccessIncludes('gallery', 'control'), false)
    assert.equal(lanAccessIncludes('control', 'gallery'), true)
    assert.equal(lanAccessIncludes(null, 'generation'), false)
  })

  it('makes only the exact authentication pairs public', () => {
    expectClass('public', [
      ['GET', '/api/auth/status'],
      ['POST', '/api/auth/pair']
    ])

    assert.equal(classifyLanEndpoint('POST', '/api/auth/status'), null)
    assert.equal(classifyLanEndpoint('GET', '/api/auth/pair'), null)
    assert.equal(classifyLanEndpoint('GET', '/api/auth/logout'), null)
  })

  it('classifies the paired generation allowlist', () => {
    expectClass('generation', [
      ['GET', '/api/models'],
      ['GET', '/api/remote/status'],
      ['POST', '/api/generate'],
      ['POST', '/api/generate-cli'],
      ['POST', '/api/inpaint'],
      ['POST', '/api/generate-video'],
      ['POST', '/api/upscale'],
      ['POST', '/api/cancel'],
      ['POST', '/api/cancel-cli'],
      ['GET', '/api/preview-image'],
      ['GET', '/api/generation/progress'],
      ['POST', '/api/image/params'],
      ['POST', '/api/auth/logout'],
      ['GET', '/output/gen_123.png'],
      ['HEAD', '/output/video_123.mp4'],
      ['GET', '/api/media/123e4567-e89b-12d3-a456-426614174000/content'],
      ['GET', '/api/media/media_01/export']
    ])
  })

  it('adds gallery listing only at gallery level', () => {
    expectClass('gallery', [['GET', '/api/gallery']])
    assert.equal(classifyLanEndpoint('POST', '/api/gallery'), null)
  })

  it('classifies only ID-based deletion and explicit control routes as control', () => {
    expectClass('control', [
      ['DELETE', '/api/media/media_01'],
      ['GET', '/api/status'],
      ['POST', '/api/start'],
      ['POST', '/api/stop'],
      ['GET', '/api/logs'],
      ['GET', '/api/logs/stream'],
      ['POST', '/api/logs/clear']
    ])

    assert.equal(classifyLanEndpoint('POST', '/api/media/media_01'), null)
    assert.equal(classifyLanEndpoint('DELETE', '/api/media/media_01/content'), null)
    assert.equal(classifyLanEndpoint('POST', '/api/delete'), null)
  })

  it('uses strict canonical media IDs', () => {
    const valid = [
      'a',
      'media_01',
      'a-b_c-9',
      '123e4567-e89b-12d3-a456-426614174000',
      'a'.repeat(64)
    ]
    const invalid = [
      '',
      'Media_01',
      '-media',
      'media-',
      '_media',
      'media_',
      'a'.repeat(65),
      '.',
      '..',
      'a.b',
      'a/b',
      'a%2fb',
      'a b',
      'caf\u00e9'
    ]

    for (const id of valid) assert.equal(isCanonicalLanMediaId(id), true, id)
    for (const id of invalid) assert.equal(isCanonicalLanMediaId(id), false, id)
  })

  it('rejects non-canonical and malformed method/path variants', () => {
    const rejected: ReadonlyArray<readonly [string, string]> = [
      ['get', '/api/models'],
      ['Get', '/api/models'],
      ['GET', '/API/models'],
      ['GET', '/api/Models'],
      ['GET', '/api/models/'],
      ['GET', '/api//models'],
      ['GET', '//api/models'],
      ['GET', '/api%2fmodels'],
      ['GET', '/api%2Fmodels'],
      ['GET', '/api%5cmodels'],
      ['GET', '/api\\models'],
      ['GET', '/api/./models'],
      ['GET', '/api/x/../models'],
      ['GET', '/api/models?refresh=1'],
      ['GET', 'api/models'],
      ['GET ', '/api/models'],
      ['HEAD', '/api/models'],
      ['OPTIONS', '/api/models']
    ]

    for (const [method, path] of rejected) {
      assert.equal(classifyLanEndpoint(method, path), null, `${method} ${path}`)
    }
    assert.equal(classifyLanEndpoint('GET', '/api/models\0'), null)
    assert.equal(classifyLanEndpoint(undefined, '/api/models'), null)
    assert.equal(classifyLanEndpoint('GET', undefined), null)
  })

  it('never classifies sensitive desktop and internal routes', () => {
    const forbidden: ReadonlyArray<readonly [string, string]> = [
      ['GET', '/api/backend/capabilities'],
      ['GET', '/api/backend/releases'],
      ['POST', '/api/backend/config'],
      ['POST', '/api/backend/download'],
      ['POST', '/api/models/download'],
      ['GET', '/api/downloads'],
      ['POST', '/api/downloads/task_1/cancel'],
      ['POST', '/api/downloads/clear-completed'],
      ['POST', '/api/convert'],
      ['GET', '/api/file'],
      ['POST', '/api/open-folder'],
      ['GET', '/api/network/status'],
      ['GET', '/api/internal/lan'],
      ['POST', '/api/internal/lan/rotate'],
      ['GET', '/output/../image.png'],
      ['GET', '/api/unknown']
    ]

    for (const [method, path] of forbidden) {
      assert.equal(classifyLanEndpoint(method, path), null, `${method} ${path}`)
    }
  })

  it('requires pairing and enforces cumulative access levels', () => {
    const allowedAt = (
      accessLevel: LanAccessLevel,
      method: string,
      path: string,
      paired = true
    ): boolean => isLanRequestAllowed({ method, path, paired, accessLevel })

    assert.equal(allowedAt('generation', 'GET', '/api/auth/status', false), true)
    assert.equal(allowedAt('generation', 'POST', '/api/auth/pair', false), true)
    assert.equal(allowedAt('generation', 'GET', '/api/models', false), false)
    assert.equal(allowedAt('generation', 'GET', '/api/models'), true)
    assert.equal(allowedAt('generation', 'GET', '/api/gallery'), false)
    assert.equal(allowedAt('gallery', 'GET', '/api/models'), true)
    assert.equal(allowedAt('gallery', 'GET', '/api/gallery'), true)
    assert.equal(allowedAt('gallery', 'POST', '/api/start'), false)
    assert.equal(allowedAt('control', 'GET', '/api/gallery'), true)
    assert.equal(allowedAt('control', 'POST', '/api/start'), true)
    assert.equal(allowedAt('control', 'GET', '/api/backend/config'), false)
  })

  it('returns actionable deny decisions for middleware', () => {
    assert.deepEqual(
      evaluateLanRequest({
        method: 'GET',
        path: '/api/unknown',
        paired: true,
        accessLevel: 'control'
      }),
      { allowed: false, endpointClass: null, reason: 'unknown-endpoint' }
    )
    assert.deepEqual(
      evaluateLanRequest({
        method: 'GET',
        path: '/api/gallery',
        paired: false,
        accessLevel: 'gallery'
      }),
      { allowed: false, endpointClass: 'gallery', reason: 'pairing-required' }
    )
    assert.deepEqual(
      evaluateLanRequest({
        method: 'POST',
        path: '/api/start',
        paired: true,
        accessLevel: 'gallery'
      }),
      { allowed: false, endpointClass: 'control', reason: 'insufficient-access' }
    )
  })
})
