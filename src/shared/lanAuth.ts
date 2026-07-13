export function normalizeIpAddress(address: string | undefined): string {
  if (!address) return ''
  return address.replace(/^::ffff:/, '').replace(/^\[|\]$/g, '')
}

export function isLoopbackAddress(address: string | undefined): boolean {
  const normalized = normalizeIpAddress(address)
  if (normalized === '::1' || normalized === 'localhost') return true
  const octets = normalized.split('.').map(Number)
  return (
    octets.length === 4 &&
    octets[0] === 127 &&
    octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  )
}

export function hostMatchesAddress(hostHeader: string | undefined, address: string): boolean {
  if (!hostHeader) return false
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':')[0]
  return normalizeIpAddress(host) === normalizeIpAddress(address)
}

export function loopbackHostAllowed(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':')[0]
  return host === 'localhost' || isLoopbackAddress(host)
}

export function loopbackOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  if (origin === 'null') return false
  try {
    const parsed = new URL(origin)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      isLoopbackAddress(parsed.hostname)
    )
  } catch {
    return false
  }
}
