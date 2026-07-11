import { spawn } from 'child_process'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { getLocalIP } from '../utils'

interface NgrokModule {
  authtoken: (token: string) => Promise<void>
  forward: (opts: { addr: number; authtoken?: string }) => Promise<{
    url: () => string
    close: () => Promise<void>
  }>
}

interface CloudflaredModule {
  bin: string
  tunnel?: (opts: { '--url': string }) => {
    url: Promise<string>
    child?: import('child_process').ChildProcess
  }
}

let ngrok: NgrokModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ngrok = require('@ngrok/ngrok') as NgrokModule
} catch (error: unknown) {
  console.warn(
    '[Server] Failed to load @ngrok/ngrok:',
    error instanceof Error ? error.message : String(error)
  )
}

let cloudflared: CloudflaredModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  cloudflared = require('cloudflared') as CloudflaredModule
} catch (error: unknown) {
  console.warn(
    '[Server] Failed to load cloudflared:',
    error instanceof Error ? error.message : String(error)
  )
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
  } catch (error: unknown) {
    ctx.state.networkStatus.ngrok.enabled = false
    ctx.state.networkStatus.ngrok.url = null
    ctx.state.networkStatus.ngrok.error = error instanceof Error ? error.message : String(error)
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

export async function startCloudflare(ctx: AppContext, port: number): Promise<string> {
  if (!cloudflared) throw new Error('cloudflared module not loaded')
  const cloudflaredBin = cloudflared.bin

  await stopCloudflare(ctx)

  return await new Promise((resolve, reject) => {
    const child = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${port}`], {
      shell: process.platform === 'win32'
    })
    ctx.state.cloudflareTunnel = child
    ctx.state.networkStatus.cloudflare.enabled = true
    ctx.state.networkStatus.cloudflare.url = null
    ctx.state.networkStatus.cloudflare.error = null

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      const message =
        'Cloudflare tunnel did not return a public URL within 15s. Local network share still works.'
      ctx.state.networkStatus.cloudflare.error = message
      ctx.state.networkStatus.cloudflare.enabled = false
      try {
        child.kill()
      } catch {
        // ignore
      }
      ctx.state.cloudflareTunnel = null
      reject(new Error(message))
    }, 15000)

    const onData = (data: Buffer): void => {
      const output = data.toString()
      console.log('[Cloudflare]', output)
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
      if (match && !settled) {
        settled = true
        clearTimeout(timeout)
        ctx.state.networkStatus.cloudflare.url = match[0]
        ctx.state.networkStatus.cloudflare.enabled = true
        ctx.state.networkStatus.cloudflare.error = null
        console.log(`[Cloudflare] Tunnel active: ${ctx.state.networkStatus.cloudflare.url}`)
        resolve(match[0])
      }
      if (/failed|error|unable/i.test(output) && !ctx.state.networkStatus.cloudflare.url) {
        ctx.state.networkStatus.cloudflare.error = output.trim().slice(0, 240)
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      ctx.state.networkStatus.cloudflare.error = error.message
      ctx.state.networkStatus.cloudflare.enabled = false
      reject(error)
    })
    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const message = `Cloudflare tunnel exited early (code ${code ?? 'unknown'})`
      ctx.state.networkStatus.cloudflare.error = message
      ctx.state.networkStatus.cloudflare.enabled = false
      ctx.state.cloudflareTunnel = null
      reject(new Error(message))
    })
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
    res.json({
      ...ctx.state.networkStatus,
      capabilities: {
        local: true,
        ngrok: Boolean(ngrok),
        cloudflare: Boolean(cloudflared),
        note:
          'Local network share is the supported default. Ngrok requires an auth token. Cloudflare quick tunnels are best-effort and may fail on some networks.'
      }
    })
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
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.post('/api/network/cloudflare', async (req, res) => {
    try {
      if (req.body?.enabled) {
        const url = await startCloudflare(ctx, currentPort(ctx))
        res.json({ success: true, url })
      } else {
        await stopCloudflare(ctx)
        res.json({ success: true })
      }
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })
}
