/**
 * Library on disk (app data):
 *
 *   <root>/library/workflows/<id>.json
 *   <root>/library/style-kits/<id>.json
 *   <root>/library/sessions/<id>.json
 *
 * Every read goes through the shared sanitizers; writes are atomic (temp + rename).
 */
import fs from 'fs'
import path from 'path'
import type { AppContext } from './types'
import { isLibraryId, sanitizeStyleKit, type StyleKit } from '../shared/library'
import { sanitizeGraph, type WorkflowGraph } from '../shared/workflowGraph'
import {
  sanitizeSession,
  summarizeSession,
  type Session,
  type SessionSummary
} from '../shared/sessions'

export type Collection = 'workflows' | 'style-kits' | 'sessions'

type ItemOf<C extends Collection> = C extends 'workflows'
  ? WorkflowGraph
  : C extends 'style-kits'
    ? StyleKit
    : Session

const MAX_LIBRARY_FILE_BYTES = 8 * 1024 * 1024

export function isCollection(value: unknown): value is Collection {
  return value === 'workflows' || value === 'style-kits' || value === 'sessions'
}

export function libraryDir(ctx: AppContext): string {
  return path.join(ctx.paths.root, 'library')
}

function collectionDir(ctx: AppContext, collection: Collection): string {
  const dir = path.join(libraryDir(ctx), collection)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sanitize<C extends Collection>(collection: C, raw: unknown): ItemOf<C> | null {
  if (collection === 'workflows') return sanitizeGraph(raw) as ItemOf<C> | null
  if (collection === 'style-kits') return sanitizeStyleKit(raw) as ItemOf<C> | null
  return sanitizeSession(raw) as ItemOf<C> | null
}

function readJson(file: string): unknown {
  const stat = fs.statSync(file)
  if (!stat.isFile() || stat.size > MAX_LIBRARY_FILE_BYTES) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value))
  fs.renameSync(tmp, file)
}

export function listItems<C extends Collection>(ctx: AppContext, collection: C): ItemOf<C>[] {
  const dir = collectionDir(ctx, collection)
  const out: ItemOf<C>[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    try {
      const item = sanitize(collection, readJson(path.join(dir, name)))
      if (item && `${item.id}.json` === name) out.push(item)
    } catch {
      /* skip unreadable or partial files */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function readItem<C extends Collection>(
  ctx: AppContext,
  collection: C,
  id: string
): ItemOf<C> | null {
  if (!isLibraryId(id)) return null
  const file = path.join(collectionDir(ctx, collection), `${id}.json`)
  if (!fs.existsSync(file)) return null
  try {
    return sanitize(collection, readJson(file))
  } catch {
    return null
  }
}

export function saveItem<C extends Collection>(
  ctx: AppContext,
  collection: C,
  raw: unknown,
  owner: string
): ItemOf<C> {
  const item = sanitize(collection, raw)
  if (!item) throw new Error('Invalid item')
  const saved = { ...item, updatedAt: Date.now() } as ItemOf<C>
  if (collection !== 'sessions') (saved as { updatedBy?: string }).updatedBy = owner
  writeJsonAtomic(path.join(collectionDir(ctx, collection), `${item.id}.json`), saved)
  return saved
}

export function deleteItem(ctx: AppContext, collection: Collection, id: string): void {
  if (!isLibraryId(id)) throw new Error('Invalid id')
  fs.rmSync(path.join(collectionDir(ctx, collection), `${id}.json`), { force: true })
}

export function listSessionSummaries(ctx: AppContext): SessionSummary[] {
  return listItems(ctx, 'sessions').map(summarizeSession)
}
