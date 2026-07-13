import crypto, { X509Certificate } from 'crypto'
import fs from 'fs'
import http from 'http'
import https from 'https'
import { TLSSocket } from 'tls'
import type { Express, NextFunction, Request, Response } from 'express'
import type { AppContext } from './types'
import { findAvailablePort } from './utils'
import {
  isLanAccessLevel,
  isLanTransport,
  isPrivateIpv4,
  type LanAccessLevel,
  type LanPairedDevice,
  type LanSharingStatus,
  type LanTransport
} from '../shared/lan'
import { evaluateLanRequest } from '../shared/lanPolicy'
import {
  hostMatchesAddress,
  isLoopbackAddress,
  loopbackHostAllowed,
  loopbackOriginAllowed,
  normalizeIpAddress
} from '../shared/lanAuth'

const PAIRING_LIFETIME_MS = 10 * 60 * 1000
const SECURE_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000
const QUICK_SESSION_LIFETIME_MS = 15 * 60 * 1000
const MAX_PAIR_ATTEMPTS_PER_MINUTE = 5
const SECURE_SESSION_COOKIE = '__Host-flaxeo'
const QUICK_SESSION_COOKIE = 'flaxeo-local'

interface LanConfig {
  enabled: boolean
  address?: string
  transport?: LanTransport
  accessLevel?: LanAccessLevel
  keyPath?: string
  certPath?: string
}

interface SessionRecord extends LanPairedDevice {
  tokenHash: string
}

function secureEqual(left: string, right: string): boolean {
  if (!left || !right) return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of String(request.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('base64url')
}

function securityHeaders(response: Response): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  )
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

export function createLanSecurity(app: Express, ctx: AppContext) {
  let lanServer: http.Server | https.Server | null = null
  let address: string | null = null
  let port: number | null = null
  let transport: LanTransport = 'https'
  let accessLevel: LanAccessLevel = 'generation'
  let certificateFingerprint: string | null = null
  let pairingCode = ''
  let pairingExpiresAt = 0
  const sessions = new Map<string, SessionRecord>()
  const pairingAttempts = new Map<string, number[]>()
  const controlToken = process.env.FLAXEO_CONTROL_TOKEN || ''
  const desktopToken = process.env.FLAXEO_DESKTOP_TOKEN || ''

  function rotatePairingCode(): void {
    pairingCode = crypto.randomBytes(16).toString('base64url')
    pairingExpiresAt = Date.now() + PAIRING_LIFETIME_MS
  }

  function clearExpiredSessions(): void {
    const now = Date.now()
    for (const [hash, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(hash)
    }
    for (const [remoteAddress, attempts] of pairingAttempts) {
      const active = attempts.filter((time) => now - time < 60_000)
      if (active.length) pairingAttempts.set(remoteAddress, active)
      else pairingAttempts.delete(remoteAddress)
    }
  }

  function status(): Omit<LanSharingStatus, 'interfaces'> {
    clearExpiredSessions()
    if (lanServer?.listening && pairingExpiresAt <= Date.now()) rotatePairingCode()
    return {
      enabled: Boolean(lanServer?.listening && address && port),
      transport,
      accessLevel,
      selectedAddress: address,
      url: address && port ? `${transport}://${address}:${port}` : null,
      pairingCode: lanServer?.listening ? pairingCode : null,
      pairingExpiresAt: lanServer?.listening ? pairingExpiresAt : null,
      certificateFingerprint,
      sessionCount: sessions.size,
      devices: [...sessions.values()]
        .map((session) => ({
          id: session.id,
          address: session.address,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
          accessLevel: session.accessLevel
        }))
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    }
  }

  async function stop(): Promise<void> {
    sessions.clear()
    pairingAttempts.clear()
    const current = lanServer
    lanServer = null
    address = null
    port = null
    certificateFingerprint = null
    if (current)
      await new Promise<void>((resolve) => {
        current.close(() => resolve())
        current.closeAllConnections()
      })
    ctx.state.networkStatus.lan = { enabled: false, url: null }
  }

  async function start(config: LanConfig): Promise<void> {
    if (!config.enabled) {
      await stop()
      return
    }
    if (!ctx.state.lanWebReady) throw new Error('LAN renderer is unavailable or failed validation')
    if (!config.address || !isPrivateIpv4(config.address))
      throw new Error('Invalid private LAN address')

    const nextTransport = isLanTransport(config.transport) ? config.transport : 'https'
    const requestedAccessLevel = isLanAccessLevel(config.accessLevel)
      ? config.accessLevel
      : 'generation'
    const nextAccessLevel = nextTransport === 'http' ? 'generation' : requestedAccessLevel
    let server: http.Server | https.Server
    let fingerprint: string | null = null
    if (nextTransport === 'https') {
      if (!config.keyPath || !config.certPath) throw new Error('LAN certificate is missing')
      const key = fs.readFileSync(config.keyPath)
      const cert = fs.readFileSync(config.certPath)
      server = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, app)
      fingerprint = new X509Certificate(cert).fingerprint256
    } else {
      server = http.createServer(app)
    }

    const selectedPort = await findAvailablePort(ctx.port + 1, config.address)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(selectedPort, config.address, () => {
        server.off('error', reject)
        resolve()
      })
    })
    const previous = lanServer
    lanServer = server
    address = config.address
    port = selectedPort
    transport = nextTransport
    accessLevel = nextAccessLevel
    certificateFingerprint = fingerprint
    rotatePairingCode()
    sessions.clear()
    pairingAttempts.clear()
    ctx.state.networkStatus.lan = {
      enabled: true,
      url: `${transport}://${address}:${port}`
    }
    console.log(
      `[Server] ${transport === 'https' ? 'Secure' : 'Quick'} LAN UI: ${transport}://${address}:${port}`
    )
    if (previous) {
      previous.close()
      previous.closeAllConnections()
    }
  }

  function isInternalRequest(request: Request): boolean {
    const authorization = String(request.headers.authorization || '')
    return (
      isLoopbackAddress(request.socket.localAddress) &&
      isLoopbackAddress(request.socket.remoteAddress) &&
      Boolean(controlToken) &&
      secureEqual(authorization, `Bearer ${controlToken}`)
    )
  }

  function isDesktopRequest(request: Request): boolean {
    const suppliedHeader = String(request.headers['x-flaxeo-desktop-token'] || '')
    const tokenizedStream =
      request.path === '/api/logs/stream' || request.path === '/api/generation/progress'
    const suppliedStreamToken =
      tokenizedStream && typeof request.query.desktopToken === 'string'
        ? request.query.desktopToken
        : ''
    return Boolean(
      desktopToken &&
      (secureEqual(suppliedHeader, desktopToken) || secureEqual(suppliedStreamToken, desktopToken))
    )
  }

  function sessionForRequest(request: Request): SessionRecord | null {
    clearExpiredSessions()
    for (const cookieName of [SECURE_SESSION_COOKIE, QUICK_SESSION_COOKIE]) {
      const token = cookieValue(request, cookieName)
      if (!token) continue
      const session = sessions.get(tokenHash(token))
      if (!session) continue
      session.lastSeenAt = Date.now()
      return session
    }
    return null
  }

  // Cheap socket/Host/Origin checks are installed before any body parser.
  function transportMiddleware(request: Request, response: Response, next: NextFunction): void {
    const localAddress = normalizeIpAddress(request.socket.localAddress)
    const loopback = isLoopbackAddress(localAddress)
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined

    if (loopback) {
      if (!loopbackHostAllowed(request.headers.host)) {
        response.status(403).json({ error: 'Origin or host not allowed' })
        return
      }
      if (request.method === 'OPTIONS') {
        if (origin !== 'null' && !loopbackOriginAllowed(origin)) {
          response.status(403).json({ error: 'Origin not allowed' })
          return
        }
        response.setHeader('Access-Control-Allow-Origin', origin || 'null')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Flaxeo-Desktop-Token')
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        response.setHeader('Access-Control-Allow-Credentials', 'true')
        response.setHeader('Vary', 'Origin')
        response.sendStatus(204)
        return
      }
      const allowedOrigin =
        !origin || (origin === 'null' ? isDesktopRequest(request) : loopbackOriginAllowed(origin))
      if (!allowedOrigin) {
        response.status(403).json({ error: 'Origin not allowed' })
        return
      }
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Access-Control-Allow-Credentials', 'true')
        response.setHeader('Vary', 'Origin')
      }
      next()
      return
    }

    const tlsMatches =
      transport === 'https'
        ? request.socket instanceof TLSSocket
        : !(request.socket instanceof TLSSocket)
    if (!address || localAddress !== address || !tlsMatches) {
      response.status(403).json({ error: 'LAN listener not available' })
      return
    }
    if (!hostMatchesAddress(request.headers.host, address)) {
      response.status(403).json({ error: 'Host not allowed' })
      return
    }

    securityHeaders(response)
    const expectedOrigin = `${transport}://${request.headers.host}`
    if (origin && origin !== expectedOrigin) {
      response.status(403).json({ error: 'Origin not allowed' })
      return
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && origin !== expectedOrigin) {
      response.status(403).json({ error: 'Origin required' })
      return
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Origin', expectedOrigin)
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
      response.setHeader('Access-Control-Allow-Credentials', 'true')
      response.setHeader('Vary', 'Origin')
      response.sendStatus(204)
      return
    }
    next()
  }

  app.use(transportMiddleware)

  function installAuthorizationAndRoutes(): void {
    app.use((request, response, next) => {
      if (isLoopbackAddress(request.socket.localAddress)) {
        next()
        return
      }

      const lowerPath = request.path.toLowerCase()
      if (!lowerPath.startsWith('/api') && !lowerPath.startsWith('/output')) {
        next()
        return
      }

      const session = sessionForRequest(request)
      const decision = evaluateLanRequest({
        method: request.method,
        path: request.path,
        paired: Boolean(session),
        accessLevel: session?.accessLevel || accessLevel
      })
      if (!decision.allowed) {
        response.status(decision.reason === 'pairing-required' ? 401 : 403).json({
          error:
            decision.reason === 'pairing-required'
              ? 'Pairing required'
              : decision.reason === 'insufficient-access'
                ? 'This paired device does not have permission for this action'
                : 'Remote endpoint not allowed'
        })
        return
      }
      if (session) response.locals.lanSession = session
      next()
    })

    app.get('/api/auth/status', (request, response) => {
      const loopback = isLoopbackAddress(request.socket.localAddress)
      const session = loopback ? null : sessionForRequest(request)
      response.json({
        paired: loopback || Boolean(session),
        transport,
        accessLevel: session?.accessLevel || accessLevel
      })
    })

    app.post('/api/auth/pair', (request, response) => {
      if (isLoopbackAddress(request.socket.localAddress)) {
        response.json({ paired: true, accessLevel: 'control' })
        return
      }
      const remoteAddress = normalizeIpAddress(request.socket.remoteAddress) || 'unknown'
      const now = Date.now()
      const attempts = (pairingAttempts.get(remoteAddress) || []).filter(
        (time) => now - time < 60_000
      )
      if (attempts.length >= MAX_PAIR_ATTEMPTS_PER_MINUTE) {
        response.status(429).json({ error: 'Too many pairing attempts. Try again shortly.' })
        return
      }
      attempts.push(now)
      pairingAttempts.set(remoteAddress, attempts)
      const suppliedCode = typeof request.body?.code === 'string' ? request.body.code : ''
      if (pairingExpiresAt <= now || !secureEqual(suppliedCode, pairingCode)) {
        response.status(401).json({ error: 'Pairing code is invalid or expired.' })
        return
      }

      const sessionToken = crypto.randomBytes(32).toString('base64url')
      const lifetime =
        transport === 'https' ? SECURE_SESSION_LIFETIME_MS : QUICK_SESSION_LIFETIME_MS
      const hash = tokenHash(sessionToken)
      sessions.set(hash, {
        id: crypto.randomUUID(),
        tokenHash: hash,
        address: remoteAddress,
        userAgent: String(request.headers['user-agent'] || 'Unknown browser').slice(0, 240),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + lifetime,
        accessLevel
      })
      rotatePairingCode()
      const cookieName = transport === 'https' ? SECURE_SESSION_COOKIE : QUICK_SESSION_COOKIE
      const secure = transport === 'https' ? '; Secure' : ''
      response.setHeader(
        'Set-Cookie',
        `${cookieName}=${sessionToken}; Path=/; Max-Age=${Math.floor(lifetime / 1000)}${secure}; HttpOnly; SameSite=Strict`
      )
      response.json({ paired: true, accessLevel })
    })

    app.post('/api/auth/logout', (request, response) => {
      const session = sessionForRequest(request)
      if (session) sessions.delete(session.tokenHash)
      response.setHeader('Set-Cookie', [
        `${SECURE_SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`,
        `${QUICK_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`
      ])
      response.json({ paired: false })
    })

    app.get('/api/internal/lan', (request, response) => {
      if (!isInternalRequest(request)) return response.status(403).json({ error: 'Access denied' })
      response.json(status())
    })

    app.post('/api/internal/lan', async (request, response) => {
      if (!isInternalRequest(request)) return response.status(403).json({ error: 'Access denied' })
      try {
        await start(request.body as LanConfig)
        response.json(status())
      } catch (error) {
        response.status(400).json({ error: error instanceof Error ? error.message : String(error) })
      }
    })

    app.post('/api/internal/lan/rotate', (request, response) => {
      if (!isInternalRequest(request)) return response.status(403).json({ error: 'Access denied' })
      rotatePairingCode()
      response.json(status())
    })

    app.post('/api/internal/lan/revoke', (request, response) => {
      if (!isInternalRequest(request)) return response.status(403).json({ error: 'Access denied' })
      const deviceId = typeof request.body?.deviceId === 'string' ? request.body.deviceId : ''
      if (deviceId) {
        for (const [hash, session] of sessions) {
          if (session.id === deviceId) sessions.delete(hash)
        }
      } else {
        sessions.clear()
      }
      rotatePairingCode()
      response.json(status())
    })
  }

  return { start, stop, status, installAuthorizationAndRoutes }
}
