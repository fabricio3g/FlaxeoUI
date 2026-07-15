import type { LanAccessLevel } from './lanPolicy'

export type { LanAccessLevel } from './lanPolicy'

export type LanTransport = 'http' | 'https'

export interface LanSharingOptions {
  address?: string
  transport: LanTransport
  accessLevel: LanAccessLevel
}

export interface LanInterface {
  name: string
  address: string
}

export interface LanSharingStatus {
  enabled: boolean
  transport: LanTransport
  accessLevel: LanAccessLevel
  selectedAddress: string | null
  interfaces: LanInterface[]
  url: string | null
  pairingCode: string | null
  pairingExpiresAt: number | null
  certificateFingerprint: string | null
  sessionCount: number
  devices: LanPairedDevice[]
  error?: string
}

export interface LanPairedDevice {
  id: string
  address: string
  userAgent: string
  createdAt: number
  lastSeenAt: number
  expiresAt: number
  accessLevel: LanAccessLevel
}

export function isLanTransport(value: unknown): value is LanTransport {
  return value === 'http' || value === 'https'
}

export function isLanAccessLevel(value: unknown): value is LanAccessLevel {
  return value === 'generation' || value === 'gallery' || value === 'control'
}

export function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

/**
 * Build a Vue hash-router-safe pairing URL.
 * Prefer `#/text2image?pair=…` so the app boots on a real route.
 */
export function buildLanPairingUrl(baseUrl: string, pairingCode: string): string {
  const root = baseUrl.replace(/\/+$/, '')
  return `${root}/#/text2image?pair=${encodeURIComponent(pairingCode)}`
}

/**
 * Extract a one-time pairing code from a browser location-like object.
 * Supports:
 * - `#/text2image?pair=CODE` (preferred)
 * - `#pair=CODE` (legacy QR)
 * - `?pair=CODE` search params
 */
export function extractLanPairingCode(locationLike: {
  hash?: string
  search?: string
}): string | null {
  const search = typeof locationLike.search === 'string' ? locationLike.search : ''
  if (search) {
    const fromSearch = new URLSearchParams(
      search.startsWith('?') ? search.slice(1) : search
    ).get('pair')
    if (fromSearch?.trim()) return fromSearch.trim()
  }

  const hash = typeof locationLike.hash === 'string' ? locationLike.hash : ''
  if (!hash) return null
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null

  // Preferred: /text2image?pair=CODE or text2image?pair=CODE
  const queryIndex = raw.indexOf('?')
  if (queryIndex >= 0) {
    const fromHashQuery = new URLSearchParams(raw.slice(queryIndex + 1)).get('pair')
    if (fromHashQuery?.trim()) return fromHashQuery.trim()
  }

  // Legacy: pair=CODE (entire hash is query-like)
  if (raw.includes('=') && !raw.startsWith('/')) {
    const fromLegacy = new URLSearchParams(raw).get('pair')
    if (fromLegacy?.trim()) return fromLegacy.trim()
  }

  return null
}
