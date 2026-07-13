import type { Express } from 'express'
import type { AppContext } from '../types'

export function updateLocalNetworkUrl(ctx: AppContext): void {
  const address = ctx.state.server?.address()
  const port = typeof address === 'object' && address ? address.port : ctx.port
  ctx.state.networkStatus.local.url = `http://127.0.0.1:${port}`
}

export function registerNetworkRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/network/status', (_req, res) => {
    updateLocalNetworkUrl(ctx)
    res.json(ctx.state.networkStatus)
  })
}
