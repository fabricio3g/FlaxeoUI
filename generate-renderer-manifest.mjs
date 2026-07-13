import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RENDERER_SNAPSHOT_MANIFEST = 'renderer-snapshot.json'
export const RENDERER_SNAPSHOT_VERSION = 1

const BUILD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const RESOURCE_ATTRIBUTES = new Map([
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

function fail(message) {
  throw new Error(`Renderer snapshot manifest: ${message}`)
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function assertAssetPath(assetPath) {
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
    fail(`unsafe asset path ${JSON.stringify(assetPath)}`)
  }
}

function readQuotedAttribute(tag, attribute) {
  const assignment = new RegExp(`\\s${attribute.replace(':', '\\:')}\\s*=`, 'i').exec(tag)
  if (!assignment) return null

  let cursor = assignment.index + assignment[0].length
  while (/\s/.test(tag[cursor] || '')) cursor += 1
  const quote = tag[cursor]
  if (quote !== '"' && quote !== "'") fail(`${attribute} asset reference must be quoted`)
  const end = tag.indexOf(quote, cursor + 1)
  if (end < 0) fail(`${attribute} asset reference has no closing quote`)
  return tag.slice(cursor + 1, end)
}

function referenceToAssetPath(reference) {
  if (!reference) fail('empty asset reference in index.html')
  if (reference.startsWith('#') || /^data:/i.test(reference)) return null
  if (reference.includes('\\') || reference.includes('\0'))
    fail(`malformed asset reference ${reference}`)

  let url
  try {
    url = new URL(reference, 'https://renderer.invalid/index.html')
  } catch {
    fail(`malformed asset reference ${reference}`)
  }
  if (url.origin !== 'https://renderer.invalid') {
    fail(`external asset reference cannot be included in the snapshot: ${reference}`)
  }

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    fail(`malformed URL encoding in asset reference ${reference}`)
  }
  const assetPath = pathname.replace(/^\/+/, '') || 'index.html'
  assertAssetPath(assetPath)
  return assetPath
}

function referencedAssets(indexHtml) {
  if (/<base\b/i.test(indexHtml)) fail('index.html must not contain a base element')

  const references = new Set()
  for (const match of indexHtml.matchAll(RESOURCE_TAG_PATTERN)) {
    const tagName = match[1].toLowerCase()
    for (const attribute of RESOURCE_ATTRIBUTES.get(tagName)) {
      const reference = readQuotedAttribute(match[0], attribute)
      if (reference === null) continue
      const assetPath = referenceToAssetPath(reference)
      if (assetPath) references.add(assetPath)
    }
  }
  return references
}

function collectFiles(root) {
  const files = []

  function visit(directory) {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const assetPath = path.relative(root, absolutePath).split(path.sep).join('/')

      if (entry.isSymbolicLink()) fail(`symbolic links are not allowed: ${assetPath}`)
      if (entry.isDirectory()) {
        assertAssetPath(assetPath)
        visit(absolutePath)
        continue
      }
      if (!entry.isFile()) fail(`non-regular renderer asset is not allowed: ${assetPath}`)
      if (assetPath === RENDERER_SNAPSHOT_MANIFEST) continue

      assertAssetPath(assetPath)
      const realPath = fs.realpathSync.native(absolutePath)
      if (!isInside(root, realPath)) fail(`asset resolves outside the renderer root: ${assetPath}`)
      files.push({ assetPath, absolutePath })
    }
  }

  visit(root)
  return files.sort((left, right) => left.assetPath.localeCompare(right.assetPath, 'en'))
}

function contentBuildId(assets) {
  const digest = createHash('sha256')
  for (const [assetPath, asset] of Object.entries(assets)) {
    digest.update(assetPath)
    digest.update('\0')
    digest.update(asset.sha256)
    digest.update('\0')
    digest.update(String(asset.size))
    digest.update('\n')
  }
  return `sha256-${digest.digest('hex')}`
}

export function generateRendererSnapshotManifest(
  rendererRoot = path.resolve('out', 'renderer'),
  buildId
) {
  const requestedRoot = path.resolve(rendererRoot)
  let rootStat
  try {
    rootStat = fs.statSync(requestedRoot)
  } catch {
    fail(`renderer root does not exist: ${requestedRoot}`)
  }
  if (!rootStat.isDirectory()) fail(`renderer root is not a directory: ${requestedRoot}`)

  const root = fs.realpathSync.native(requestedRoot)
  const manifestPath = path.join(root, RENDERER_SNAPSHOT_MANIFEST)
  if (fs.existsSync(manifestPath)) {
    const manifestStat = fs.lstatSync(manifestPath)
    if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
      fail(`${RENDERER_SNAPSHOT_MANIFEST} must be a regular file`)
    }
  }

  const assets = {}
  const contents = new Map()
  for (const { assetPath, absolutePath } of collectFiles(root)) {
    const body = fs.readFileSync(absolutePath)
    assets[assetPath] = {
      sha256: createHash('sha256').update(body).digest('hex'),
      size: body.length
    }
    contents.set(assetPath, body)
  }

  if (!Object.hasOwn(assets, 'index.html')) fail('index.html is missing')
  for (const reference of referencedAssets(contents.get('index.html').toString('utf8'))) {
    if (!Object.hasOwn(assets, reference)) fail(`index.html references missing asset: ${reference}`)
  }

  const selectedBuildId = buildId || process.env.FLAXEO_BUILD_ID || contentBuildId(assets)
  if (!BUILD_ID_PATTERN.test(selectedBuildId)) {
    fail('build id must be 1-128 ASCII letters, digits, dots, underscores, or hyphens')
  }

  const manifest = {
    version: RENDERER_SNAPSHOT_VERSION,
    buildId: selectedBuildId,
    entrypoint: 'index.html',
    assets
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8' })
  return manifest
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('out', 'renderer')
    const manifest = generateRendererSnapshotManifest(root, process.argv[3])
    console.log(
      `Generated ${path.join(root, RENDERER_SNAPSHOT_MANIFEST)} (${Object.keys(manifest.assets).length} assets, build ${manifest.buildId})`
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
