/**
 * Model hub: pictures for the model families (from the official Hugging Face repo that
 * sd.cpp's docs link), and search on Hugging Face and Civitai. Only metadata passes through
 * here; pictures are loaded by the page straight from the source, and model files go
 * through the regular /api/models/download queue.
 */
import fs from 'fs'
import path from 'path'
import type { Express } from 'express'
import type { AppContext } from '../types'
import { errorMessage } from '../utils'
import { familyById } from '../../shared/modelFamilies'
import {
  CIVITAI_TYPES,
  MODEL_FILE,
  civitaiCategory,
  guessCategory,
  hfSocialThumbnail,
  isRepoId,
  pickFamilyRepo,
  readmeImage,
  type FamilyImage,
  type HubItem
} from '../../shared/modelHub'

const DOCS_RAW = 'https://raw.githubusercontent.com/leejet/stable-diffusion.cpp/master/docs/'
const CACHE_TTL_MS = 7 * 24 * 3600_000
const TIMEOUT_MS = 15_000

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': 'FlaxeoUI', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
}

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await get(url, headers)
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`)
  return (await response.json()) as T
}

/* ----------------------------- Family pictures ---------------------------- */

interface CacheFile {
  families: Record<string, FamilyImage & { at: number }>
}

function cachePath(ctx: AppContext): string {
  return path.join(path.dirname(ctx.paths.configFile), 'hub-cache.json')
}

function readCache(ctx: AppContext): CacheFile {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath(ctx), 'utf8')) as CacheFile
    return data && typeof data.families === 'object' ? data : { families: {} }
  } catch {
    return { families: {} }
  }
}

const inFlight = new Map<string, Promise<FamilyImage>>()

async function resolveFamilyImage(ctx: AppContext, familyId: string): Promise<FamilyImage> {
  const family = familyById(familyId)
  if (!family) throw new Error('Unknown model family')
  const doc = /\/docs\/([\w.-]+\.md)/.exec(family.docs)?.[1]
  let links: string[] = []
  if (doc) {
    const response = await get(DOCS_RAW + doc)
    if (response.ok)
      links = (await response.text()).match(/https:\/\/huggingface\.co\/[^\s)"'<>]+/g) || []
  }
  const repo = pickFamilyRepo(family.name, family.id, links)
  if (!repo) return { repo: '', page: family.docs, image: '' }
  let image = ''
  try {
    // Gated repos (FLUX dev, SD3.5…) refuse the raw card; their preview card still works.
    const card = await get(`https://huggingface.co/${repo}/raw/main/README.md`)
    if (card.ok) image = readmeImage(await card.text(), repo)
  } catch {
    /* fall back to the preview card */
  }
  const result = {
    repo,
    page: `https://huggingface.co/${repo}`,
    image: image || hfSocialThumbnail(repo)
  }
  const cache = readCache(ctx)
  cache.families[familyId] = { ...result, at: Date.now() }
  try {
    fs.writeFileSync(cachePath(ctx), JSON.stringify(cache))
  } catch {
    /* read-only data folder: resolve again next time */
  }
  return result
}

/* --------------------------------- Search --------------------------------- */

interface HfModel {
  id: string
  downloads?: number
  likes?: number
  tags?: string[]
  pipeline_tag?: string
}

async function searchHuggingFace(q: string): Promise<HubItem[]> {
  const params = new URLSearchParams({
    search: q,
    sort: 'downloads',
    direction: '-1',
    limit: '30',
    full: 'false'
  })
  // Only repos with weights sd.cpp reads: GGUF or diffusers-style single files.
  const [gguf, single] = await Promise.all([
    getJson<HfModel[]>(`https://huggingface.co/api/models?${params}&filter=gguf`),
    getJson<HfModel[]>(`https://huggingface.co/api/models?${params}&filter=diffusion-single-file`)
  ])
  const seen = new Set<string>()
  return [...gguf, ...single]
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .filter((m) => !m.pipeline_tag || /image|video/.test(m.pipeline_tag))
    .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
    .slice(0, 30)
    .map((m) => {
      const base = (m.tags || [])
        .map(
          (t) => /^base_model:(?:quantized:|finetune:|adapter:)?([\w.-]+\/[\w.-]+)$/.exec(t)?.[1]
        )
        .find(Boolean)
      return {
        source: 'huggingface',
        id: m.id,
        name: m.id.split('/')[1],
        author: m.id.split('/')[0],
        type: m.tags?.includes('gguf') ? 'GGUF' : 'Weights',
        // A quantized repo shows its base model's picture
        image: hfSocialThumbnail(base || m.id),
        page: `https://huggingface.co/${m.id}`,
        downloads: m.downloads || 0,
        versions: [],
        baseModel: base
      } satisfies HubItem
    })
}

interface CivitaiModel {
  id: number
  name: string
  type: string
  nsfw?: boolean
  creator?: { username?: string }
  stats?: { downloadCount?: number }
  modelVersions?: Array<{
    id: number
    name: string
    baseModel?: string
    files?: Array<{
      name: string
      sizeKB?: number
      downloadUrl: string
      type?: string
      metadata?: { format?: string }
    }>
    images?: Array<{ url: string; nsfwLevel?: number; type?: string }>
  }>
}

async function searchCivitai(q: string, type: string, token: string): Promise<HubItem[]> {
  const params = new URLSearchParams({ limit: '30', nsfw: 'false', sort: 'Most Downloaded' })
  if (q) params.set('query', q)
  if (CIVITAI_TYPES.some((t) => t.id === type)) params.set('types', type)
  const data = await getJson<{ items: CivitaiModel[] }>(
    `https://civitai.com/api/v1/models?${params}`,
    token ? { Authorization: `Bearer ${token}` } : {}
  )
  return (data.items || [])
    .filter((m) => !m.nsfw)
    .map((m) => {
      const versions = (m.modelVersions || []).slice(0, 6)
      const image =
        versions
          .flatMap((v) => v.images || [])
          .find((i) => (i.type || 'image') === 'image' && (i.nsfwLevel ?? 1) <= 1)?.url || ''
      return {
        source: 'civitai',
        id: String(m.id),
        name: m.name,
        author: m.creator?.username || '',
        type: m.type,
        // Civitai serves any size from the same path; ask for a card-sized one
        image: image.replace(/\/(original=true|width=\d+)\//, '/width=450/'),
        page: `https://civitai.com/models/${m.id}`,
        downloads: m.stats?.downloadCount || 0,
        versions: versions.map((v) => ({
          id: String(v.id),
          name: v.name,
          baseModel: v.baseModel || '',
          files: (v.files || [])
            .filter((f) => MODEL_FILE.test(f.name) && f.type !== 'Training Data')
            .map((f) => ({
              name: f.name,
              size: Math.round((f.sizeKB || 0) * 1024),
              url: f.downloadUrl,
              category: civitaiCategory(m.type)
            }))
        }))
      } satisfies HubItem
    })
}

export function registerHubRoutes(app: Express, ctx: AppContext): void {
  app.get('/api/hub/family/:id', async (req, res) => {
    const id = req.params.id
    if (!familyById(id)) return res.status(404).json({ error: 'Unknown model family' })
    const cached = readCache(ctx).families[id]
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return res.json(cached)
    try {
      if (!inFlight.has(id)) inFlight.set(id, resolveFamilyImage(ctx, id))
      res.json(await inFlight.get(id))
    } catch (error) {
      res.status(502).json({ error: errorMessage(error) })
    } finally {
      inFlight.delete(id)
    }
  })

  app.get('/api/hub/search', async (req, res) => {
    const source = req.query.source === 'civitai' ? 'civitai' : 'huggingface'
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
    const type = typeof req.query.type === 'string' ? req.query.type : ''
    if (source === 'huggingface' && !q) return res.json({ items: [] })
    try {
      const token = ctx.state.backendConfig.civitaiToken
      const items =
        source === 'civitai'
          ? await searchCivitai(q, type, typeof token === 'string' ? token : '')
          : await searchHuggingFace(q)
      res.json({ items })
    } catch (error) {
      res.status(502).json({
        error: `Could not search ${source === 'civitai' ? 'Civitai' : 'Hugging Face'}: ${errorMessage(error)}`
      })
    }
  })

  /** Model files in a Hugging Face repo, largest quant last. */
  app.get('/api/hub/hf-files', async (req, res) => {
    const repo = req.query.repo
    if (!isRepoId(repo)) return res.status(400).json({ error: 'Invalid repository' })
    try {
      const token = ctx.state.backendConfig.huggingFaceToken
      const tree = await getJson<
        Array<{ type: string; path: string; size?: number; lfs?: { size?: number } }>
      >(
        `https://huggingface.co/api/models/${repo}/tree/main?recursive=true`,
        typeof token === 'string' && token ? { Authorization: `Bearer ${token}` } : {}
      )
      const files = tree
        .filter((e) => e.type === 'file' && MODEL_FILE.test(e.path))
        .map((e) => ({
          name: e.path,
          size: e.lfs?.size || e.size || 0,
          url: `https://huggingface.co/${repo}/resolve/main/${e.path.split('/').map(encodeURIComponent).join('/')}`,
          category: guessCategory(e.path)
        }))
        .sort((a, b) => a.size - b.size)
      res.json({ files })
    } catch (error) {
      res.status(502).json({ error: `Could not list the files: ${errorMessage(error)}` })
    }
  })

  /** Desktop only: whether a Civitai API key is set (never returned). */
  app.get('/api/models/civitai-token', (_req, res) => {
    if (res.locals.lanSession) return res.status(403).json({ error: 'Desktop only' })
    const token = ctx.state.backendConfig.civitaiToken
    res.json({ configured: typeof token === 'string' && token.length > 0 })
  })

  app.post('/api/models/civitai-token', (req, res) => {
    if (res.locals.lanSession) return res.status(403).json({ error: 'Desktop only' })
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
    if (token && !/^[A-Za-z0-9]{16,128}$/.test(token))
      return res.status(400).json({ error: 'That does not look like a Civitai API key.' })
    ctx.state.backendConfig.civitaiToken = token || undefined
    ctx.saveBackendConfig()
    res.json({ configured: Boolean(token) })
  })
}
