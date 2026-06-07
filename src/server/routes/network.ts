import { spawn } from 'child_process'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { getLocalIP } from '../utils'

let ngrok: any
try {
  ngrok = require('@ngrok/ngrok')
} catch (error: any) {
  console.warn('[Server] Failed to load @ngrok/ngrok:', error.message)
}

let cloudflared: any
try {
  cloudflared = require('cloudflared')
} catch (error: any) {
  console.warn('[Server] Failed to load cloudflared:', error.message)
}

function currentPort(ctx: AppContext): number {
  const address = ctx.state.server?.address()
  return typeof address === 'object' && address ? address.port : ctx.port
}

export function updateLocalNetworkUrl(ctx: AppContext): void {
  const url = `http://${getLocalIP()}:${currentPort(ctx)}`
  ctx.state.networkStatus.local.url = ctx.state.networkStatus.local.enabled ? url : null
}

export async function startNgrok(ctx: AppContext, port: number, authToken?: string): Promise<string> {
  if (!ngrok) throw new Error('Ngrok package not installed')
  try {
    if (authToken) await ngrok.authtoken(authToken)
    ctx.state.ngrokListener = await ngrok.forward({ addr: port, authtoken: authToken })
    ctx.state.networkStatus.ngrok.enabled = true
    ctx.state.networkStatus.ngrok.url = ctx.state.ngrokListener.url()
    ctx.state.networkStatus.ngrok.error = null
    console.log(`[Ngrok] Tunnel active: ${ctx.state.networkStatus.ngrok.url}`)
    return ctx.state.networkStatus.ngrok.url || ''
  } catch (error: any) {
    ctx.state.networkStatus.ngrok.enabled = false
    ctx.state.networkStatus.ngrok.url = null
    ctx.state.networkStatus.ngrok.error = error.message
    throw error
  }
}

export async function stopNgrok(ctx: AppContext): Promise<void> {
  if (ctx.state.ngrokListener) {
    await ctx.state.ngrokListener.close()
    ctx.state.ngrokListener = null
  }
  ctx.state.networkStatus.ngrok.enabled = false
  ctx.state.networkStatus.ngrok.url = null
}

export async function startCloudflare(ctx: AppContext, port: number): Promise<void> {
  if (!cloudflared) throw new Error('cloudflared module not loaded')
  const cloudflaredBin = cloudflared.bin
  ctx.state.cloudflareTunnel = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${port}`], { shell: process.platform === 'win32' })
  ctx.state.networkStatus.cloudflare.enabled = true
  ctx.state.cloudflareTunnel.stderr?.on('data', (data) => {
    const output = data.toString()
    console.log('[Cloudflare]', output)
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
    if (match) {
      ctx.state.networkStatus.cloudflare.url = match[0]
      ctx.state.networkStatus.cloudflare.enabled = true
      ctx.state.networkStatus.cloudflare.error = null
      console.log(`[Cloudflare] Tunnel active: ${ctx.state.networkStatus.cloudflare.url}`)
    }
  })
  ctx.state.cloudflareTunnel.on('error', (error) => {
    ctx.state.networkStatus.cloudflare.error = error.message
  })
}

export async function stopCloudflare(ctx: AppContext): Promise<void> {
  if (ctx.state.cloudflareTunnel) {
    ctx.state.cloudflareTunnel.kill()
    ctx.state.cloudflareTunnel = null
  }
  ctx.state.networkStatus.cloudflare.enabled = false
  ctx.state.networkStatus.cloudflare.url = null
}

export function registerNetworkRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/network/status', (_req, res) => {
    updateLocalNetworkUrl(ctx)
    res.json(ctx.state.networkStatus)
  })

  app.post('/api/network/local', (req, res) => {
    ctx.state.networkStatus.local.enabled = !!req.body?.enabled
    updateLocalNetworkUrl(ctx)
    res.json({ success: true, enabled: ctx.state.networkStatus.local.enabled, url: ctx.state.networkStatus.local.url })
  })

  app.post('/api/network/ngrok', async (req, res) => {
    try {
      if (req.body?.enabled) {
        const url = await startNgrok(ctx, currentPort(ctx), req.body.token || process.env.NGROK_AUTHTOKEN)
        res.json({ success: true, url })
      } else {
        await stopNgrok(ctx)
        res.json({ success: true })
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  })

  app.post('/api/network/cloudflare', async (req, res) => {
    try {
      if (req.body?.enabled) {
        await startCloudflare(ctx, currentPort(ctx))
        setTimeout(() => res.json({ success: true, url: ctx.state.networkStatus.cloudflare.url }), 3000)
      } else {
        await stopCloudflare(ctx)
        res.json({ success: true })
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  })
}
