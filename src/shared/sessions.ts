/**
 * Create sessions: a feed of generations kept on the server (library/sessions/<id>.json),
 * so the desktop and paired network devices see the same history and it survives restarts.
 * Files are names in the output folder; sanitizers drop anything that looks like a path.
 */
import { cleanText, clampNumber, cleanTimestamp, isLibraryId } from './library.ts'
import { pickSetup, type ModelSetup } from './modelSetup.ts'

export type CreateMode = 'image' | 'edit' | 'video'
export type RowStatus = 'running' | 'done' | 'failed' | 'cancelled'

/** What an attached image is for in a generation. */
export type InputRole = 'start' | 'reference' | 'end' | 'control' | 'identity' | 'style' | 'mask'

export interface RowInput {
  file: string
  role: InputRole
}

export interface SessionRow {
  id: string
  mode: CreateMode
  status: RowStatus
  prompt: string
  negativePrompt: string
  /** Model display name at the time ("FLUX.3 Klein · flux3-image-klein-Q4_K") */
  model: string
  width: number
  height: number
  seed: number
  count: number
  inputs: RowInput[]
  outputs: string[]
  error: string
  startedAt: number
  finishedAt: number
  /** Who ran it (member name on the network) */
  by: string
  /** Settings used, for "Reuse settings" */
  setup: ModelSetup | null
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  rows: SessionRow[]
}

export interface SessionSummary {
  id: string
  title: string
  updatedAt: number
  count: number
  cover: string
}

export const MAX_SESSION_ROWS = 400
export const INPUT_ROLES: InputRole[] = [
  'start',
  'reference',
  'end',
  'control',
  'identity',
  'style',
  'mask'
]

/** Output-folder file names only: no folders, no dot segments. */
const FILE_NAME = /^[\w][\w .()-]{0,180}\.(png|jpe?g|webp|avif|gif|mp4|webm|avi)$/i

export function isOutputName(value: unknown): value is string {
  return typeof value === 'string' && FILE_NAME.test(value) && !value.includes('..')
}

function sanitizeRow(raw: unknown): SessionRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isLibraryId(r.id)) return null
  const mode: CreateMode = r.mode === 'edit' || r.mode === 'video' ? r.mode : 'image'
  const status: RowStatus =
    r.status === 'running' || r.status === 'failed' || r.status === 'cancelled' ? r.status : 'done'
  const inputs = (Array.isArray(r.inputs) ? r.inputs : [])
    .map((entry) => {
      const input = (entry || {}) as Record<string, unknown>
      const role = INPUT_ROLES.includes(input.role as InputRole) ? (input.role as InputRole) : null
      return isOutputName(input.file) && role ? { file: input.file, role } : null
    })
    .filter((input): input is RowInput => !!input)
    .slice(0, 16)
  return {
    id: r.id,
    mode,
    status,
    prompt: cleanText(r.prompt, 4000),
    negativePrompt: cleanText(r.negativePrompt, 2000),
    model: cleanText(r.model, 160),
    width: Math.round(clampNumber(r.width, 0, 8192, 0)),
    height: Math.round(clampNumber(r.height, 0, 8192, 0)),
    seed: Math.round(clampNumber(r.seed, -1, Number.MAX_SAFE_INTEGER, -1)),
    count: Math.round(clampNumber(r.count, 1, 64, 1)),
    inputs,
    outputs: (Array.isArray(r.outputs) ? r.outputs : []).filter(isOutputName).slice(0, 64),
    error: cleanText(r.error, 2000),
    startedAt: cleanTimestamp(r.startedAt),
    finishedAt: Number(r.finishedAt) > 0 ? Math.floor(Number(r.finishedAt)) : 0,
    by: cleanText(r.by, 40),
    setup: r.setup && typeof r.setup === 'object' ? pickSetup(r.setup) : null
  }
}

export function sanitizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isLibraryId(r.id)) return null
  const rows = (Array.isArray(r.rows) ? r.rows : [])
    .map(sanitizeRow)
    .filter((row): row is SessionRow => !!row)
    .slice(-MAX_SESSION_ROWS)
  return {
    id: r.id,
    title: cleanText(r.title, 120).trim(),
    createdAt: cleanTimestamp(r.createdAt),
    updatedAt: cleanTimestamp(r.updatedAt),
    rows
  }
}

/** Title for lists: the session's own title, else its first prompt. */
export function sessionTitle(session: Pick<Session, 'title' | 'rows'>): string {
  if (session.title) return session.title
  const prompt = session.rows.find((row) => row.prompt.trim())?.prompt.trim() || ''
  return prompt ? prompt.slice(0, 60) : 'Untitled session'
}

export function summarizeSession(session: Session): SessionSummary {
  const cover = [...session.rows].reverse().find((row) => row.outputs.length)?.outputs[0] || ''
  return {
    id: session.id,
    title: sessionTitle(session),
    updatedAt: session.updatedAt,
    count: session.rows.length,
    cover
  }
}
