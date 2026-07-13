export const LAN_ACCESS_LEVELS = Object.freeze(['generation', 'gallery', 'control'] as const)

export type LanAccessLevel = (typeof LAN_ACCESS_LEVELS)[number]
export type LanEndpointClass = 'public' | LanAccessLevel

export interface LanPolicyRequest {
  method: string
  path: string
  paired: boolean
  accessLevel: LanAccessLevel
}

export type LanPolicyDenialReason = 'unknown-endpoint' | 'pairing-required' | 'insufficient-access'

export type LanPolicyDecision =
  | { allowed: true; endpointClass: LanEndpointClass }
  | {
      allowed: false
      endpointClass: LanEndpointClass | null
      reason: LanPolicyDenialReason
    }

// Opaque IDs are lowercase, URL-safe, bounded, and cannot resemble paths or dot segments.
export const LAN_MEDIA_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/

const STATIC_ENDPOINTS = new Map<string, LanEndpointClass>([
  ['GET /api/auth/status', 'public'],
  ['POST /api/auth/pair', 'public'],

  ['GET /api/models', 'generation'],
  ['GET /api/remote/status', 'generation'],
  ['POST /api/generate', 'generation'],
  ['POST /api/generate-cli', 'generation'],
  ['POST /api/inpaint', 'generation'],
  ['POST /api/generate-video', 'generation'],
  ['POST /api/upscale', 'generation'],
  ['POST /api/cancel', 'generation'],
  ['POST /api/cancel-cli', 'generation'],
  ['GET /api/preview-image', 'generation'],
  ['GET /api/generation/progress', 'generation'],
  ['POST /api/image/params', 'generation'],
  ['POST /api/auth/logout', 'generation'],

  ['GET /api/gallery', 'gallery'],

  ['GET /api/status', 'control'],
  ['POST /api/start', 'control'],
  ['POST /api/stop', 'control'],
  ['GET /api/logs', 'control'],
  ['GET /api/logs/stream', 'control'],
  ['POST /api/logs/clear', 'control']
])

const ACCESS_RANK: Readonly<Record<LanAccessLevel, number>> = {
  generation: 0,
  gallery: 1,
  control: 2
}

export function lanAccessIncludes(
  granted: LanAccessLevel | null | undefined,
  required: LanAccessLevel
): boolean {
  return granted !== null && granted !== undefined && ACCESS_RANK[granted] >= ACCESS_RANK[required]
}

function isCanonicalPath(path: string): boolean {
  return (
    path.length <= 256 &&
    /^\/[a-z0-9/_.-]+$/.test(path) &&
    !path.endsWith('/') &&
    !path.includes('//')
  )
}

export function isCanonicalLanMediaId(value: unknown): value is string {
  return typeof value === 'string' && LAN_MEDIA_ID_PATTERN.test(value)
}

/**
 * Classifies one canonical method/path pair. A null result must be denied.
 * Pass an already parsed pathname such as Express's request.path, never a URL.
 */
export function classifyLanEndpoint(method: unknown, path: unknown): LanEndpointClass | null {
  if (typeof method !== 'string' || typeof path !== 'string' || !isCanonicalPath(path)) return null

  const staticClass = STATIC_ENDPOINTS.get(`${method} ${path}`)
  if (staticClass) return staticClass

  const outputMatch = /^\/output\/([a-z0-9][a-z0-9._-]{0,127})$/.exec(path)
  if (outputMatch) {
    const filename = outputMatch[1]
    if (
      (method === 'GET' || method === 'HEAD') &&
      !filename.includes('..') &&
      /\.(?:png|jpe?g|webp|gif|mp4)$/i.test(filename)
    )
      return 'generation'
    return null
  }

  const mediaMatch = /^\/api\/media\/([^/]+)(?:\/(content|export))?$/.exec(path)
  if (!mediaMatch || !isCanonicalLanMediaId(mediaMatch[1])) return null

  if (method === 'GET' && mediaMatch[2]) return 'generation'
  if (method === 'DELETE' && mediaMatch[2] === undefined) return 'control'
  return null
}

/** Returns a middleware-friendly decision without throwing on unrecognized input. */
export function evaluateLanRequest(request: LanPolicyRequest): LanPolicyDecision {
  const endpointClass = classifyLanEndpoint(request.method, request.path)
  if (!endpointClass) return { allowed: false, endpointClass: null, reason: 'unknown-endpoint' }
  if (endpointClass === 'public') return { allowed: true, endpointClass }
  if (!request.paired) return { allowed: false, endpointClass, reason: 'pairing-required' }

  if (!lanAccessIncludes(request.accessLevel, endpointClass)) {
    return { allowed: false, endpointClass, reason: 'insufficient-access' }
  }
  return { allowed: true, endpointClass }
}

export function isLanRequestAllowed(request: LanPolicyRequest): boolean {
  return evaluateLanRequest(request).allowed
}
