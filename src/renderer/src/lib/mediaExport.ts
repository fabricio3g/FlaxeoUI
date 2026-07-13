/**
 * Gallery / viewer export helpers (clipboard + download naming).
 */
import { authenticatedFetch } from '@/services/api'

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
}): string {
  const ext =
    opts.originalName && /\.[a-z0-9]+$/i.test(opts.originalName)
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
