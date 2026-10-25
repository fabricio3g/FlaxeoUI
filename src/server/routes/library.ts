/**
 * Library routes: workflows, style kits, Create sessions, image uploads and the
 * desktop user's display name. Workflow runs live in routes/workflows.ts.
 */
import fs from 'fs'
import multer from 'multer'
import type { Express, Response } from 'express'
import type { AppContext, JsonObject } from '../types'
import { errorMessage } from '../utils'
import { requestOwner } from '../members'
import {
  deleteItem,
  isCollection,
  listItems,
  listSessionSummaries,
  readItem,
  saveItem
} from '../library'
import { cleanMemberName, cleanText, isLibraryId } from '../../shared/library'
import { MAX_SESSION_ROWS, sanitizeSession, type Session } from '../../shared/sessions'
import { storeUploadedImages } from '../imageOps'

const MAX_UPLOAD_IMAGES = 16

function sendError(res: Response, error: unknown, status = 400): void {
  res.status(status).json({ message: errorMessage(error) || 'Request failed' })
}

function idParam(value: unknown): string {
  if (!isLibraryId(value)) throw new Error('Invalid id')
  return value
}

/** Only the desktop app (loopback) may change its own settings. */
function isDesktopRequest(res: Response): boolean {
  return !res.locals.lanSession
}

function emptySession(id: string): Session {
  const now = Date.now()
  return { id, title: '', createdAt: now, updatedAt: now, rows: [] }
}

export function registerLibraryRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/library', (_req, res) => {
    try {
      const lanName = (res.locals.lanSession as { name?: string } | undefined)?.name
      res.json({
        memberName: isDesktopRequest(res)
          ? cleanMemberName(ctx.state.backendConfig.memberName)
          : cleanMemberName(lanName),
        workflows: listItems(ctx, 'workflows'),
        styleKits: listItems(ctx, 'style-kits')
      })
    } catch (error) {
      sendError(res, error, 500)
    }
  })

  /** Desktop only: the name shown on your generations. */
  app.post('/api/library/settings', (req, res) => {
    if (!isDesktopRequest(res)) return res.status(403).json({ message: 'Desktop only' })
    const body = (req.body || {}) as JsonObject
    ctx.state.backendConfig.memberName = cleanMemberName(body.memberName)
    ctx.saveBackendConfig()
    res.json({ memberName: ctx.state.backendConfig.memberName })
  })

  app.post('/api/library/save', (req, res) => {
    try {
      const body = (req.body || {}) as JsonObject
      if (body.collection !== 'workflows' && body.collection !== 'style-kits')
        throw new Error('Unknown collection')
      res.json({ item: saveItem(ctx, body.collection, body.item, requestOwner(ctx, res)) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.post('/api/library/delete', (req, res) => {
    try {
      const body = (req.body || {}) as JsonObject
      if (!isCollection(body.collection) || body.collection === 'sessions')
        throw new Error('Unknown collection')
      deleteItem(ctx, body.collection, idParam(body.id))
      res.json({ ok: true })
    } catch (error) {
      sendError(res, error)
    }
  })

  /* ----------------------------- Sessions ----------------------------- */

  app.get('/api/sessions', (_req, res) => {
    try {
      res.json({ sessions: listSessionSummaries(ctx) })
    } catch (error) {
      sendError(res, error, 500)
    }
  })

  app.get('/api/sessions/:id', (req, res) => {
    try {
      const session = readItem(ctx, 'sessions', idParam(req.params.id))
      if (!session) return res.status(404).json({ message: 'Session not found' })
      res.json({ session })
    } catch (error) {
      sendError(res, error)
    }
  })

  /** Rename (creates the session when it does not exist yet). */
  app.post('/api/sessions/:id', (req, res) => {
    try {
      const id = idParam(req.params.id)
      const session = readItem(ctx, 'sessions', id) || emptySession(id)
      session.title = cleanText((req.body as JsonObject)?.title, 120).trim()
      res.json({ session: saveItem(ctx, 'sessions', session, requestOwner(ctx, res)) })
    } catch (error) {
      sendError(res, error)
    }
  })

  /**
   * Add or update one row. Row-level so two devices generating into the same session never
   * overwrite each other's rows (Node handles one request at a time; reads/writes are sync).
   */
  app.post('/api/sessions/:id/rows', (req, res) => {
    try {
      const id = idParam(req.params.id)
      const session = readItem(ctx, 'sessions', id) || emptySession(id)
      const probe = sanitizeSession({ ...emptySession(id), rows: [(req.body as JsonObject)?.row] })
      const row = probe?.rows[0]
      if (!row) throw new Error('Invalid row')
      const existing = session.rows.findIndex((r) => r.id === row.id)
      if (existing >= 0) session.rows[existing] = { ...row, by: session.rows[existing].by }
      else session.rows.push({ ...row, by: requestOwner(ctx, res) })
      session.rows = session.rows.slice(-MAX_SESSION_ROWS)
      saveItem(ctx, 'sessions', session, '')
      res.json({ row: session.rows.find((r) => r.id === row.id) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.delete('/api/sessions/:id/rows/:rowId', (req, res) => {
    try {
      const session = readItem(ctx, 'sessions', idParam(req.params.id))
      if (!session) return res.status(404).json({ message: 'Session not found' })
      const rowId = idParam(req.params.rowId)
      session.rows = session.rows.filter((row) => row.id !== rowId)
      saveItem(ctx, 'sessions', session, '')
      res.json({ ok: true })
    } catch (error) {
      sendError(res, error)
    }
  })

  /** Removes the session record only; its images stay in Assets. */
  app.delete('/api/sessions/:id', (req, res) => {
    try {
      deleteItem(ctx, 'sessions', idParam(req.params.id))
      res.json({ ok: true })
    } catch (error) {
      sendError(res, error)
    }
  })

  /* ------------------------------ Uploads ----------------------------- */

  const upload = multer({
    limits: { fileSize: 50 * 1024 * 1024, files: MAX_UPLOAD_IMAGES },
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, ctx.paths.tempDir),
      filename: (_req, _file, cb) =>
        cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    })
  })

  /** Store attached images as PNGs in the output folder; returns their names. */
  app.post('/api/uploads', (req, res) => {
    upload.array('images', MAX_UPLOAD_IMAGES)(req, res, async (uploadError) => {
      const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[]
      try {
        if (uploadError) throw uploadError
        if (!files.length) throw new Error('Choose at least one image.')
        res.json({ filenames: await storeUploadedImages(ctx, files) })
      } catch (error) {
        sendError(res, error)
      } finally {
        for (const file of files) fs.rmSync(file.path, { force: true })
      }
    })
  })
}
