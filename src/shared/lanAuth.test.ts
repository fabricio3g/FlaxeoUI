import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hostMatchesAddress,
  isLoopbackAddress,
  loopbackHostAllowed,
  loopbackOriginAllowed
} from './lanAuth.ts'

describe('LAN request validation', () => {
  it('recognizes loopback without trusting lookalike hosts', () => {
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
    assert.equal(loopbackHostAllowed('localhost:3000'), true)
    assert.equal(loopbackHostAllowed('127.0.0.1:3000'), true)
    assert.equal(loopbackHostAllowed('localhost.attacker.test'), false)
    assert.equal(isLoopbackAddress('127.255.255.255'), true)
    assert.equal(isLoopbackAddress('127.0.0.999'), false)
  })

  it('matches only the selected LAN address', () => {
    assert.equal(hostMatchesAddress('192.168.1.20:3443', '192.168.1.20'), true)
    assert.equal(hostMatchesAddress('192.168.1.21:3443', '192.168.1.20'), false)
  })

  it('allows only loopback origins on the desktop listener', () => {
    assert.equal(loopbackOriginAllowed('null'), false)
    assert.equal(loopbackOriginAllowed('http://localhost:5173'), true)
    assert.equal(loopbackOriginAllowed('https://127.0.0.1:3000'), true)
    assert.equal(loopbackOriginAllowed('ftp://localhost'), false)
    assert.equal(loopbackOriginAllowed('http://localhost.attacker.test'), false)
    assert.equal(loopbackOriginAllowed('https://evil.example'), false)
  })
})
