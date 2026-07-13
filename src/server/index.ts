import express from 'express'
import path from 'path'
import { createContext } from './context'
import { findAvailablePort } from './utils'
import { registerCoreRoutes } from './routes/core'
import { registerGenerationRoutes } from './routes/generation'
import { registerMediaRoutes } from './routes/media'
import { registerBackendRoutes } from './routes/backend'
import { registerNetworkRoutes, updateLocalNetworkUrl } from './routes/network'
import { createLanSecurity } from './lanSecurity'
import {
  readRendererSnapshotAsset,
  validateRendererSnapshot,
  type ValidatedRendererSnapshot
} from '../shared/rendererSnapshot'

const ctx = createContext()
const app = express()

app.set('case sensitive routing', true)
app.set('strict routing', true)
const lanSecurity = createLanSecurity(app, ctx)
app.use(express.json({ limit: '2mb' }))
lanSecurity.installAuthorizationAndRoutes()
app.use('/output', express.static(ctx.paths.outputDir))

let rendererSnapshot: ValidatedRendererSnapshot | null = null
const rendererRoot = path.resolve(__dirname, '..', 'renderer')
try {
  rendererSnapshot = validateRendererSnapshot(rendererRoot)
  ctx.state.lanWebReady = true
  console.log(`[Server] Validated LAN renderer: ${rendererSnapshot.buildId}`)
} catch (error) {
  console.error('[Server] LAN renderer unavailable:', error)
}

registerCoreRoutes(app, ctx)
registerGenerationRoutes(app, ctx)
registerMediaRoutes(app, ctx)
registerBackendRoutes(app, ctx)
registerNetworkRoutes(app, ctx)

app.use((request, response, next) => {
  if (!rendererSnapshot || !['GET', 'HEAD'].includes(request.method)) return next()
  if (
    request.path.toLowerCase().startsWith('/api') ||
    request.path.toLowerCase().startsWith('/output')
  )
    return next()
  try {
    const body = readRendererSnapshotAsset(rendererSnapshot, request.path)
    response.type(path.extname(request.path === '/' ? 'index.html' : request.path))
    response.send(request.method === 'HEAD' ? undefined : body)
  } catch {
    next()
  }
})

console.log('[Server] Initializing...')
const keepAlive = setInterval(() => undefined, 1000)

findAvailablePort(ctx.port, ctx.host)
  .then((port) => {
    ctx.state.server = app.listen(port, ctx.host, async () => {
      updateLocalNetworkUrl(ctx)
      console.log(`Web UI: http://127.0.0.1:${port}`)
      console.log(`[Server] Running on port: ${port}`)
      if (process.env.FLAXEO_LAN_ENABLED === '1') {
        try {
          await lanSecurity.start({
            enabled: true,
            address: process.env.FLAXEO_LAN_ADDRESS,
            transport: process.env.FLAXEO_LAN_TRANSPORT === 'http' ? 'http' : 'https',
            accessLevel:
              process.env.FLAXEO_LAN_ACCESS_LEVEL === 'gallery' ||
              process.env.FLAXEO_LAN_ACCESS_LEVEL === 'control'
                ? process.env.FLAXEO_LAN_ACCESS_LEVEL
                : 'generation',
            keyPath: process.env.FLAXEO_LAN_KEY_PATH,
            certPath: process.env.FLAXEO_LAN_CERT_PATH
          })
        } catch (error) {
          console.error('[Server] Failed to start secure LAN listener:', error)
        }
      }
    })
  })
  .catch((error) => {
    clearInterval(keepAlive)
    console.error('Failed to find available port:', error)
    process.exit(1)
  })

async function cleanup(): Promise<void> {
  console.log('[Server] Cleanup...')
  await lanSecurity.stop()
  if (ctx.state.cliProcess) ctx.state.cliProcess.kill()
  if (ctx.state.sdProcess) ctx.state.sdProcess.kill()
  process.exit()
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
