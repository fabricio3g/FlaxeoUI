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
