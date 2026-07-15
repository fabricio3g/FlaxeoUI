import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildLanPairingUrl, extractLanPairingCode, isPrivateIpv4 } from './lan.ts'

describe('isPrivateIpv4', () => {
  it('accepts RFC1918 addresses', () => {
    assert.equal(isPrivateIpv4('10.1.2.3'), true)
    assert.equal(isPrivateIpv4('172.16.0.1'), true)
    assert.equal(isPrivateIpv4('172.31.255.254'), true)
    assert.equal(isPrivateIpv4('192.168.1.2'), true)
  })

  it('rejects public, loopback, and malformed addresses', () => {
    assert.equal(isPrivateIpv4('8.8.8.8'), false)
    assert.equal(isPrivateIpv4('127.0.0.1'), false)
    assert.equal(isPrivateIpv4('172.32.0.1'), false)
    assert.equal(isPrivateIpv4('not-an-ip'), false)
  })
})

describe('buildLanPairingUrl', () => {
  it('emits a hash-router-safe text2image pairing link', () => {
    assert.equal(
      buildLanPairingUrl('https://192.168.1.20:3456/', 'abc+def'),
      'https://192.168.1.20:3456/#/text2image?pair=abc%2Bdef'
    )
  })
})

describe('extractLanPairingCode', () => {
  it('reads preferred hash query, legacy hash, and search params', () => {
    assert.equal(
      extractLanPairingCode({ hash: '#/text2image?pair=from-hash-route' }),
      'from-hash-route'
    )
    assert.equal(extractLanPairingCode({ hash: '#pair=legacy-code' }), 'legacy-code')
    assert.equal(extractLanPairingCode({ search: '?pair=from-search' }), 'from-search')
    assert.equal(extractLanPairingCode({ hash: '#/gallery' }), null)
    assert.equal(extractLanPairingCode({}), null)
  })

  it('prefers search over hash when both are present', () => {
    assert.equal(
      extractLanPairingCode({ search: '?pair=search-wins', hash: '#/text2image?pair=hash' }),
      'search-wins'
    )
  })
})
