import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPrivateIpv4 } from './lan.ts'

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
