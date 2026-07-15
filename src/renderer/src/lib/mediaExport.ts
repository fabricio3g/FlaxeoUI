/**
 * Gallery / viewer export helpers (clipboard + download naming).
 */
import { authenticatedFetch, getApiBase, getOutputUrl } from '@/services/api'
import type { ArchiveImageFormat } from '@/composables/useOutputPreferences'

/** Safe filename segment from prompt or basename */
export function slugFromPrompt(text: string, max = 40): string {
  const s = text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!s) return 'image'
  return s.slice(0, max).replace(/-+$/g, '') || 'image'
}

export function buildExportFilename(opts: {
  originalName?: string
  prompt?: string
  seed?: number | string
  width?: number
  height?: number
  /** Force download extension (e.g. archive as PNG/AVIF). */
  format?: ArchiveImageFormat
}): string {
  const ext = opts.format
    ? `.${opts.format}`
    : opts.originalName && /\.[a-z0-9]+$/i.test(opts.originalName)
      ? opts.originalName.match(/\.[a-z0-9]+$/i)![0]
      : '.png'
  const base = opts.originalName
    ? opts.originalName.replace(/\.[^.]+$/, '')
    : slugFromPrompt(opts.prompt || 'image')
  const parts = [base]
  if (opts.width && opts.height) parts.push(`${opts.width}x${opts.height}`)
  if (opts.seed != null && opts.seed !== '' && Number(opts.seed) >= 0) {
    parts.push(`s${opts.seed}`)
  }
  return `${parts.join('_')}${ext}`.replace(/[^\w.-]+/g, '_')
}

function exportImageUrl(filename: string, format: ArchiveImageFormat): string {
  const params = new URLSearchParams({
    filename,
    format
  })
  return `${getApiBase()}/api/export-image?${params.toString()}`
}

/**
 * Download a gallery output file as PNG or AVIF (server converts when needed).
 * Falls back to direct `/output` fetch when format matches the stored extension.
 */
export async function downloadOutputAsFormat(
  filename: string,
  format: ArchiveImageFormat,
  opts?: { prompt?: string; seed?: number | string; width?: number; height?: number }
): Promise<void> {
  const safeFilename = filename.replace(/^.*[/\\]/, '')
  if (!safeFilename) throw new Error('Missing filename')

  const storedExt = pathExt(safeFilename)
  const wantExt = `.${format}`
  const downloadName = buildExportFilename({
    originalName: safeFilename,
    format,
    prompt: opts?.prompt,
    seed: opts?.seed,
    width: opts?.width,
    height: opts?.height
  })

  if (storedExt.toLowerCase() === wantExt) {
    await downloadUrlAs(getOutputUrl(safeFilename), downloadName)
    return
  }

  await downloadUrlAs(exportImageUrl(safeFilename, format), downloadName)
}

function pathExt(name: string): string {
  const match = name.match(/\.[a-z0-9]+$/i)
  return match ? match[0] : ''
}

function clickDownloadLink(href: string, filename: string): void {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * Trigger browser/Electron download of a URL under a chosen filename.
 * Fetches as a blob first so the download attribute works for same-origin
 * API routes and blob: URLs (plain <a download> often fails for http URLs in Electron).
 */
export async function downloadUrlAs(url: string, filename: string): Promise<void> {
  const safeName = filename.replace(/[^\w.-]+/g, '_') || 'image.png'

  // Already a local object URL — download attribute works directly
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    clickDownloadLink(url, safeName)
    return
  }

  const response = await authenticatedFetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status})`)
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    clickDownloadLink(objectUrl, safeName)
  } finally {
    // Keep the object URL alive long enough for the OS save dialog to start
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }
}

/** Copy image pixels to clipboard (PNG preferred). Falls back to error if unsupported. */
export async function copyImageUrlToClipboard(url: string): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard images are not supported in this environment')
  }
  const response = await authenticatedFetch(url)
  if (!response.ok) throw new Error('Failed to load image for clipboard')
  let blob = await response.blob()
  // Clipboard often wants image/png
  if (blob.type && blob.type !== 'image/png' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0)
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
            'image/png'
          )
        })
      }
      bitmap.close?.()
    } catch {
      /* use original blob */
    }
  }
  const type = blob.type || 'image/png'
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
}
