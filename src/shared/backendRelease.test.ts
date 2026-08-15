import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assetMatchesPlatform,
  backendPlatformMismatch,
  backendVariantLabel,
  detectBackendDirPlatform,
  pickBestBackendAsset
} from './backendRelease.ts'

const WINDOWS_DIR = ['sd-cli.exe', 'sd-server.exe', 'ggml.dll', 'ggml-vulkan.dll']
const LINUX_DIR = ['sd-cli', 'sd-server', 'libggml.so']

describe('detectBackendDirPlatform', () => {
  it('reads a Windows install from .exe / .dll', () => {
    assert.equal(detectBackendDirPlatform(WINDOWS_DIR), 'win32')
  })

  it('reads a posix install from extensionless binaries', () => {
    assert.equal(detectBackendDirPlatform(LINUX_DIR), 'posix')
  })

  it('prefers posix when a folder holds both', () => {
    assert.equal(detectBackendDirPlatform([...WINDOWS_DIR, ...LINUX_DIR]), 'posix')
  })

  it('returns null for an empty or unrelated folder', () => {
    assert.equal(detectBackendDirPlatform([]), null)
    assert.equal(detectBackendDirPlatform(['readme.txt', 'ggml.txt']), null)
  })
})

describe('backendPlatformMismatch', () => {
  it('flags Windows binaries on Linux', () => {
    assert.equal(backendPlatformMismatch(WINDOWS_DIR, 'linux'), true)
  })

  it('flags posix binaries on Windows', () => {
    assert.equal(backendPlatformMismatch(LINUX_DIR, 'win32'), true)
  })

  it('accepts matching installs', () => {
    assert.equal(backendPlatformMismatch(WINDOWS_DIR, 'win32'), false)
    assert.equal(backendPlatformMismatch(LINUX_DIR, 'linux'), false)
    assert.equal(backendPlatformMismatch(LINUX_DIR, 'darwin'), false)
  })

  it('stays quiet when it cannot tell', () => {
    assert.equal(backendPlatformMismatch([], 'linux'), false)
  })
})

describe('backendVariantLabel', () => {
  it('names OS and accelerator', () => {
    assert.equal(
      backendVariantLabel('sd-master-de298c2-bin-win-vulkan-x64.zip'),
      'Windows · Vulkan'
    )
    assert.equal(
      backendVariantLabel('sd-master-de298c2-bin-Linux-Ubuntu-24.04-x86_64-rocm-7.14.0.zip'),
      'Linux · ROCm'
    )
    assert.equal(
      backendVariantLabel('sd-master-bin-macos-arm64-metal.zip'),
      'macOS · Metal · ARM64'
    )
  })

  it('falls back to Other for an unrecognised name', () => {
    assert.equal(backendVariantLabel('weights.zip'), 'Other')
  })
})

describe('assetMatchesPlatform', () => {
  it('matches by OS token', () => {
    assert.equal(assetMatchesPlatform('sd-bin-win-vulkan-x64.zip', 'win32'), true)
    assert.equal(assetMatchesPlatform('sd-bin-win-vulkan-x64.zip', 'linux'), false)
    assert.equal(assetMatchesPlatform('sd-bin-Linux-Ubuntu-24.04.zip', 'linux'), true)
    assert.equal(assetMatchesPlatform('sd-bin-macos-arm64.zip', 'darwin'), true)
  })
})

describe('pickBestBackendAsset', () => {
  const assets = [
    { name: 'sd-bin-win-avx2-x64.zip' },
    { name: 'sd-bin-win-cuda12-x64.zip' },
    { name: 'sd-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip' }
  ]

  it('follows the detect hint', () => {
    assert.equal(
      pickBestBackendAsset(assets, 'win32', 'win-cuda12-x64'),
      'sd-bin-win-cuda12-x64.zip'
    )
  })

  it('falls back to an OS match without a hint', () => {
    assert.equal(
      pickBestBackendAsset(assets, 'linux', null),
      'sd-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip'
    )
  })

  it('returns undefined for an empty list', () => {
    assert.equal(pickBestBackendAsset([], 'linux', null), undefined)
  })
})
