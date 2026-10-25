/**
 * Local (CPU) image operations: storing uploads and the Remove background node.
 * Inputs are absolute paths already resolved inside output/temp; outputs are PNGs
 * written into the output folder, returned as basenames.
 */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { AppContext } from './types'
import { loadSharp } from './outputCompress'
import { keyOutBackground, type RawImage } from '../shared/imageMath'

type Sharp = typeof import('sharp').default

function requireSharp(): Sharp {
  const sharp = loadSharp()
  if (!sharp) throw new Error('Image processing is unavailable (sharp failed to load).')
  return sharp as unknown as Sharp
}

/** Attached images, normalized to PNG in the output folder so sessions and workflows reopen them. */
export async function storeUploadedImages(
  ctx: AppContext,
  files: Array<{ path: string; originalname: string }>
): Promise<string[]> {
  const sharp = requireSharp()
  const written: string[] = []
  try {
    for (const file of files) {
      const name = `input_${stemOf(file.originalname) || 'image'}_${randomUUID()}.png`
      written.push(name)
      await sharp(file.path, { limitInputPixels: 40_000_000 })
        .rotate()
        .png()
        .toFile(path.join(ctx.paths.outputDir, name))
    }
    return written
  } catch {
    for (const name of written) fs.rmSync(path.join(ctx.paths.outputDir, name), { force: true })
    throw new Error(
      'Could not load these images. Choose PNG, JPEG, WebP or other supported images under 40 megapixels.'
    )
  }
}

function stemOf(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 60)
}

function outName(ctx: AppContext, prefix: string, source: string, suffix = ''): string {
  const base = `${prefix}_${stemOf(source)}${suffix}`.toLowerCase()
  let name = `${base}.png`
  let n = 1
  while (fs.existsSync(path.join(ctx.paths.outputDir, name))) name = `${base}_${n++}.png`
  return name
}

async function readRaw(file: string, alpha = false): Promise<RawImage> {
  const sharp = requireSharp()
  let pipeline = sharp(file)
  pipeline = alpha ? pipeline.ensureAlpha() : pipeline.removeAlpha()
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

async function writeRaw(
  data: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3 | 4,
  dest: string
): Promise<void> {
  const sharp = requireSharp()
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels }
  })
    .png()
    .toFile(dest)
}

export async function removeBackground(
  ctx: AppContext,
  source: string,
  tolerance: number
): Promise<string> {
  const img = await readRaw(source, true)
  const rgba = keyOutBackground(img, tolerance)
  const name = outName(ctx, 'cutout', source)
  await writeRaw(rgba, img.width, img.height, 4, path.join(ctx.paths.outputDir, name))
  return name
}
