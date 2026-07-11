import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { createContext } from './context'
import { findAvailablePort, getLocalIP } from './utils'
import { registerCoreRoutes } from './routes/core'
import { registerGenerationRoutes } from './routes/generation'
import { registerMediaRoutes } from './routes/media'
import { registerBackendRoutes } from './routes/backend'
import {
  registerNetworkRoutes,
  startCloudflare,
  startNgrok,
  stopCloudflare,
  stopNgrok,
  updateLocalNetworkUrl
} from './routes/network'

const ctx = createContext()
const app = express()

app.use(cors())
app.use(express.json())
app.use('/output', express.static(ctx.paths.outputDir))

app.use(
  '/fontawesome',
  express.static(path.join(ctx.paths.root, 'node_modules', '@fortawesome', 'fontawesome-free'))
)
app.use(
  '/tailwindcss',
  express.static(path.join(ctx.paths.root, 'node_modules', 'tailwindcss', 'dist'))
)

let publicDir = path.join(ctx.paths.root, 'out', 'renderer')
if (!fs.existsSync(publicDir)) publicDir = path.join(ctx.paths.root, 'public')
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir))
  console.log('[Server] Web UI enabled from:', publicDir)
} else {
  app.get('/', (_req, res) => {
    res.json({
      message: 'Flaxeo Image API',
      status: 'running',
      endpoints: { status: '/api/status', models: '/api/models', gallery: '/api/gallery' }
    })
  })
}

registerCoreRoutes(app, ctx)
registerGenerationRoutes(app, ctx)
registerMediaRoutes(app, ctx)
registerBackendRoutes(app, ctx)
registerNetworkRoutes(app, ctx)

console.log('[Server] Initializing...')
const keepAlive = setInterval(() => undefined, 1000)

findAvailablePort(ctx.port)
  .then((port) => {
    ctx.state.server = app.listen(port, ctx.host, async () => {
      ctx.state.networkStatus.local.enabled =
        ctx.state.networkStatus.local.enabled || ctx.host === '0.0.0.0'
      updateLocalNetworkUrl(ctx)
      const localURL = `http://${getLocalIP()}:${port}`
      const localhostURL = `http://${ctx.host === '0.0.0.0' ? 'localhost' : ctx.host}:${port}`
      console.log(`Web UI: ${localhostURL}`)
      if (ctx.host === '0.0.0.0') console.log(`Local Network: ${localURL}`)
      console.log(`[Server] Running on port: ${port}`)

      if (ctx.hasFlag('--ngrok')) {
        const token = process.env.NGROK_AUTHTOKEN
        if (token) await startNgrok(ctx, port, token)
        else
          console.warn(
            '[Ngrok] No authtoken found in environment (NGROK_AUTHTOKEN). Tunnel not started.'
          )
      }
      if (ctx.hasFlag('--cloudflare')) await startCloudflare(ctx, port)
    })
  })
  .catch((error) => {
    clearInterval(keepAlive)
    console.error('Failed to find available port:', error)
    process.exit(1)
  })

async function cleanup(): Promise<void> {
  console.log('[Server] Cleanup...')
  try {
    await stopNgrok(ctx)
  } catch (error) {
    console.error('Error stopping ngrok:', error)
  }
  try {
    await stopCloudflare(ctx)
  } catch (error) {
    console.error('Error stopping cloudflare:', error)
  }
  if (ctx.state.cliProcess) ctx.state.cliProcess.kill()
  if (ctx.state.sdProcess) ctx.state.sdProcess.kill()
  process.exit()
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
