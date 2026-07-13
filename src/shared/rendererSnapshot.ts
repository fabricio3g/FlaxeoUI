import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'

export const RENDERER_SNAPSHOT_MANIFEST = 'renderer-snapshot.json'
export const RENDERER_SNAPSHOT_VERSION = 1 as const

const BUILD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024
const RESOURCE_ATTRIBUTES = new Map<string, string[]>([
  ['audio', ['src']],
  ['embed', ['src']],
  ['image', ['href', 'xlink:href']],
  ['img', ['src']],
  ['input', ['src']],
  ['link', ['href']],
  ['object', ['data']],
  ['script', ['src']],
  ['source', ['src']],
  ['track', ['src']],
  ['use', ['href', 'xlink:href']],
  ['video', ['src', 'poster']]
])
const RESOURCE_TAG_PATTERN = new RegExp(
  `<(${[...RESOURCE_ATTRIBUTES.keys()].join('|')})\\b[^>]*>`,
  'gi'
)

export type RendererSnapshotErrorCode =
  | 'INVALID_ROOT'
  | 'MISSING_MANIFEST'
  | 'MALFORMED_MANIFEST'
  | 'BUILD_ID_MISMATCH'
  | 'UNSAFE_ASSET_PATH'
  | 'UNSAFE_FILE_TYPE'
  | 'MISSING_ASSET'
  | 'UNMANIFESTED_ASSET'
  | 'ASSET_MISMATCH'
  | 'INVALID_REFERENCE'

export class RendererSnapshotError extends Error {
  readonly code: RendererSnapshotErrorCode

  constructor(code: RendererSnapshotErrorCode, message: string) {
    super(message)
    this.name = 'RendererSnapshotError'
    this.code = code
  }
}

export interface RendererSnapshotAsset {
  readonly sha256: string
  readonly size: number
}

export interface RendererSnapshotManifest {
  readonly version: typeof RENDERER_SNAPSHOT_VERSION
  readonly buildId: string
  readonly entrypoint: 'index.html'
  readonly assets: Readonly<Record<string, RendererSnapshotAsset>>
}

export interface ValidatedRendererSnapshot extends RendererSnapshotManifest {
  readonly root: string
}

export interface RendererSnapshotValidationOptions {
  expectedBuildId?: string
}

const validatedContents = new WeakMap<ValidatedRendererSnapshot, ReadonlyMap<string, Buffer>>()

function fail(code: RendererSnapshotErrorCode, message: string): never {
  throw new RendererSnapshotError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function assertAssetPath(assetPath: string): void {
  const segments = assetPath.split('/')
  if (
    !assetPath ||
    assetPath.length > 1024 ||
    assetPath.includes('\\') ||
    assetPath.includes(':') ||
    hasControlCharacters(assetPath) ||
    path.posix.isAbsolute(assetPath) ||
    path.win32.isAbsolute(assetPath) ||
    path.posix.normalize(assetPath) !== assetPath ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ')
    )
  ) {
    fail('UNSAFE_ASSET_PATH', `Unsafe renderer asset path: ${JSON.stringify(assetPath)}`)
  }
}

function readQuotedAttribute(tag: string, attribute: string): string | null {
  const assignment = new RegExp(`\\s${attribute.replace(':', '\\:')}\\s*=`, 'i').exec(tag)
  if (!assignment) return null

  let cursor = assignment.index + assignment[0].length
  while (/\s/.test(tag[cursor] || '')) cursor += 1
  const quote = tag[cursor]
  if (quote !== '"' && quote !== "'") {
    fail('INVALID_REFERENCE', `${attribute} asset reference must be quoted`)
  }
  const end = tag.indexOf(quote, cursor + 1)
  if (end < 0) fail('INVALID_REFERENCE', `${attribute} asset reference has no closing quote`)
  return tag.slice(cursor + 1, end)
}

function referenceToAssetPath(reference: string): string | null {
  if (!reference) fail('INVALID_REFERENCE', 'Empty asset reference in index.html')
  if (reference.startsWith('#') || /^data:/i.test(reference)) return null
  if (reference.includes('\\') || reference.includes('\0')) {
    fail('INVALID_REFERENCE', `Malformed asset reference: ${reference}`)
  }

  let url: URL
  try {
    url = new URL(reference, 'https://renderer.invalid/index.html')
  } catch {
    fail('INVALID_REFERENCE', `Malformed asset reference: ${reference}`)
  }
  if (url.origin !== 'https://renderer.invalid') {
    fail('INVALID_REFERENCE', `External asset is not part of the renderer snapshot: ${reference}`)
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    fail('INVALID_REFERENCE', `Malformed URL encoding in asset reference: ${reference}`)
  }
  const assetPath = pathname.replace(/^\/+/, '') || 'index.html'
  try {
    assertAssetPath(assetPath)
  } catch (error) {
    if (error instanceof RendererSnapshotError) {
      fail('INVALID_REFERENCE', `Unsafe asset reference: ${reference}`)
    }
    throw error
  }
  return assetPath
}

function referencedAssets(indexHtml: string): Set<string> {
  if (/<base\b/i.test(indexHtml)) {
    fail('INVALID_REFERENCE', 'index.html must not contain a base element')
  }

  const references = new Set<string>()
  for (const match of indexHtml.matchAll(RESOURCE_TAG_PATTERN)) {
    const tagName = match[1].toLowerCase()
    for (const attribute of RESOURCE_ATTRIBUTES.get(tagName) || []) {
      const reference = readQuotedAttribute(match[0], attribute)
      if (reference === null) continue
      const assetPath = referenceToAssetPath(reference)
      if (assetPath) references.add(assetPath)
    }
  }
  return references
}

function collectFiles(root: string): string[] {
  const files: string[] = []

  function visit(directory: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      fail('INVALID_ROOT', `Cannot read renderer directory: ${directory}`)
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const assetPath = path.relative(root, absolutePath).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        fail('UNSAFE_FILE_TYPE', `Renderer snapshot contains a symbolic link: ${assetPath}`)
      }
      if (entry.isDirectory()) {
        assertAssetPath(assetPath)
        visit(absolutePath)
        continue
      }
      if (!entry.isFile()) {
        fail('UNSAFE_FILE_TYPE', `Renderer snapshot contains a non-regular file: ${assetPath}`)
      }
      if (assetPath === RENDERER_SNAPSHOT_MANIFEST) continue
      assertAssetPath(assetPath)

      let realPath: string
      try {
        realPath = fs.realpathSync.native(absolutePath)
      } catch {
        fail('MISSING_ASSET', `Cannot resolve renderer asset: ${assetPath}`)
      }
      if (!isInside(root, realPath)) {
        fail('UNSAFE_ASSET_PATH', `Renderer asset resolves outside its root: ${assetPath}`)
      }
      files.push(assetPath)
    }
  }

  visit(root)
  return files.sort((left, right) => left.localeCompare(right, 'en'))
}

function parseManifest(root: string): RendererSnapshotManifest {
  const manifestPath = path.join(root, RENDERER_SNAPSHOT_MANIFEST)
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(manifestPath)
  } catch {
    fail('MISSING_MANIFEST', `Missing ${RENDERER_SNAPSHOT_MANIFEST}`)
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('MALFORMED_MANIFEST', `${RENDERER_SNAPSHOT_MANIFEST} must be a regular file`)
  }
  if (stat.size > MAX_MANIFEST_BYTES) {
    fail('MALFORMED_MANIFEST', `${RENDERER_SNAPSHOT_MANIFEST} is too large`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    fail('MALFORMED_MANIFEST', `${RENDERER_SNAPSHOT_MANIFEST} is not valid JSON`)
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['assets', 'buildId', 'entrypoint', 'version'])) {
    fail('MALFORMED_MANIFEST', 'Renderer snapshot manifest has an invalid shape')
  }
  if (parsed.version !== RENDERER_SNAPSHOT_VERSION) {
    fail('MALFORMED_MANIFEST', `Unsupported renderer snapshot version: ${String(parsed.version)}`)
  }
  if (typeof parsed.buildId !== 'string' || !BUILD_ID_PATTERN.test(parsed.buildId)) {
    fail('MALFORMED_MANIFEST', 'Renderer snapshot build id is invalid')
  }
  if (parsed.entrypoint !== 'index.html' || !isRecord(parsed.assets)) {
    fail('MALFORMED_MANIFEST', 'Renderer snapshot entrypoint or assets are invalid')
  }

  const assets: Record<string, RendererSnapshotAsset> = Object.create(null)
  for (const [assetPath, rawAsset] of Object.entries(parsed.assets)) {
    assertAssetPath(assetPath)
    if (
      assetPath === RENDERER_SNAPSHOT_MANIFEST ||
      !isRecord(rawAsset) ||
      !hasExactKeys(rawAsset, ['sha256', 'size']) ||
      typeof rawAsset.sha256 !== 'string' ||
      !HASH_PATTERN.test(rawAsset.sha256) ||
      typeof rawAsset.size !== 'number' ||
      !Number.isSafeInteger(rawAsset.size) ||
      rawAsset.size < 0
    ) {
      fail('MALFORMED_MANIFEST', `Invalid manifest entry for renderer asset: ${assetPath}`)
    }
    assets[assetPath] = Object.freeze({ sha256: rawAsset.sha256, size: rawAsset.size })
  }
  if (!Object.hasOwn(assets, 'index.html')) {
    fail('MALFORMED_MANIFEST', 'Renderer snapshot does not contain index.html')
  }

  return Object.freeze({
    version: RENDERER_SNAPSHOT_VERSION,
    buildId: parsed.buildId,
    entrypoint: 'index.html',
    assets: Object.freeze(assets)
  })
}

export function validateRendererSnapshot(
  rendererRoot: string,
  options: RendererSnapshotValidationOptions = {}
): ValidatedRendererSnapshot {
  const requestedRoot = path.resolve(rendererRoot)
  let root: string
  try {
    if (!fs.statSync(requestedRoot).isDirectory()) {
      fail('INVALID_ROOT', `Renderer root is not a directory: ${requestedRoot}`)
    }
    root = fs.realpathSync.native(requestedRoot)
  } catch (error) {
    if (error instanceof RendererSnapshotError) throw error
    fail('INVALID_ROOT', `Renderer root does not exist or cannot be read: ${requestedRoot}`)
  }

  const manifest = parseManifest(root)
  if (options.expectedBuildId !== undefined && manifest.buildId !== options.expectedBuildId) {
    fail(
      'BUILD_ID_MISMATCH',
      `Renderer build id ${manifest.buildId} does not match ${options.expectedBuildId}`
    )
  }

  const actualFiles = collectFiles(root)
  const actualSet = new Set(actualFiles)
  for (const assetPath of Object.keys(manifest.assets)) {
    if (!actualSet.has(assetPath)) fail('MISSING_ASSET', `Missing renderer asset: ${assetPath}`)
  }
  for (const assetPath of actualFiles) {
    if (!Object.hasOwn(manifest.assets, assetPath)) {
      fail('UNMANIFESTED_ASSET', `Unmanifested renderer asset: ${assetPath}`)
    }
  }

  const contents = new Map<string, Buffer>()
  for (const assetPath of Object.keys(manifest.assets)) {
    const absolutePath = path.join(root, ...assetPath.split('/'))
    let body: Buffer
    try {
      body = fs.readFileSync(absolutePath)
    } catch {
      fail('MISSING_ASSET', `Cannot read renderer asset: ${assetPath}`)
    }
    const expected = manifest.assets[assetPath]
    const hash = createHash('sha256').update(body).digest('hex')
    if (body.length !== expected.size || hash !== expected.sha256) {
      fail('ASSET_MISMATCH', `Renderer asset does not match its manifest: ${assetPath}`)
    }
    contents.set(assetPath, body)
  }

  let indexHtml: string
  try {
    indexHtml = new TextDecoder('utf-8', { fatal: true }).decode(contents.get('index.html'))
  } catch {
    fail('INVALID_REFERENCE', 'index.html is not valid UTF-8')
  }
  for (const reference of referencedAssets(indexHtml)) {
    if (!Object.hasOwn(manifest.assets, reference)) {
      fail('INVALID_REFERENCE', `index.html references missing asset: ${reference}`)
    }
  }

  const snapshot = Object.freeze({ ...manifest, root })
  validatedContents.set(snapshot, contents)
  return snapshot
}

export function readRendererSnapshotAsset(
  snapshot: ValidatedRendererSnapshot,
  requestPath: string
): Buffer {
  const contents = validatedContents.get(snapshot)
  if (!contents) fail('MALFORMED_MANIFEST', 'Renderer snapshot was not created by the validator')

  let assetPath = requestPath === '' || requestPath === '/' ? snapshot.entrypoint : requestPath
  if (assetPath.startsWith('/')) assetPath = assetPath.slice(1)
  if (assetPath.includes('?') || assetPath.includes('#')) {
    fail('UNSAFE_ASSET_PATH', `Asset request must contain a path only: ${requestPath}`)
  }
  try {
    assetPath = decodeURIComponent(assetPath)
  } catch {
    fail('UNSAFE_ASSET_PATH', `Asset request has malformed URL encoding: ${requestPath}`)
  }
  assertAssetPath(assetPath)

  const body = contents.get(assetPath)
  if (!body) fail('MISSING_ASSET', `Renderer snapshot has no asset: ${assetPath}`)
  return Buffer.from(body)
}
