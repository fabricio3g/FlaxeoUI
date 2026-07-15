/**
 * Post-process CLI image outputs: optional AVIF publish via staging.
 * sd-cli always writes PNG; when store format is AVIF we stage under temp
 * and only publish AVIF into Image output (PNG fallback on encode failure).
 */
import fs from 'fs'
import path from 'path'
import type { AppContext } from './types'
import {
  normalizeOutputImageFormat,
  type OutputImageFormat
} from '../shared/outputFormat'

export type { OutputImageFormat }
export { normalizeOutputImageFormat }

const AVIF_QUALITY = 55

export function getOutputImageFormat(ctx: AppContext): OutputImageFormat {
  return normalizeOutputImageFormat(ctx.state.backendConfig.outputImageFormat)
}

export type CliImageOutputPlan = {
  /** Path passed to sd-cli `-o` (always a .png path). */
  cliOutputPath: string
  /** Basename pattern for CLI (e.g. gen_123.png or gen_123_%03d.png). */
  cliFilename: string
  /** Staging directory under temp when publishing AVIF; null when writing PNG directly. */
  stageDir: string | null
}

/**
 * Plan where the CLI should write PNGs and whether a temp stage is used.
 * `pngBasename` must end with .png (supports %03d batch patterns).
 */
export function planCliImageOutput(ctx: AppContext, pngBasename: string): CliImageOutputPlan {
  const format = getOutputImageFormat(ctx)
  if (format !== 'avif') {
    return {
      cliOutputPath: path.join(ctx.paths.outputDir, pngBasename),
      cliFilename: pngBasename,
      stageDir: null
    }
  }

  const stamp = Date.now()
  const stageDir = path.join(ctx.paths.tempDir, `avif-stage_${stamp}`)
  fs.mkdirSync(stageDir, { recursive: true })
  return {
    cliOutputPath: path.join(stageDir, pngBasename),
    cliFilename: pngBasename,
    stageDir
  }
}

function collectOutputBasenames(outputPath: string, batchCount: number): string[] {
  const dir = path.dirname(outputPath)
  const base = path.basename(outputPath)

  if (base.includes('%')) {
    if (!fs.existsSync(dir)) return []
    const patternSource = base
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%0(\d+)d/g, '\\d{$1}')
      .replace(/%d/g, '\\d+')
    const re = new RegExp(`^${patternSource}$`)
    const found: { idx: number; name: string }[] = []

    for (const name of fs.readdirSync(dir)) {
      if (!re.test(name)) continue
      const full = path.join(dir, name)
      try {
        if (!fs.statSync(full).isFile()) continue
      } catch {
        continue
      }
      const nums = name.match(/\d+/g)
      const idx = nums ? parseInt(nums[nums.length - 1], 10) : 0
      found.push({ idx: Number.isFinite(idx) ? idx : 0, name })
    }
    found.sort((a, b) => a.idx - b.idx)
    return found.map((f) => f.name)
  }

  const names: string[] = []
  if (fs.existsSync(outputPath)) names.push(base)
  const ext = path.extname(base)
  const stem = path.basename(base, ext)
  for (let i = 1; i < Math.max(batchCount, 1); i++) {
    const sibling = `${stem}_${i}${ext}`
    if (fs.existsSync(path.join(dir, sibling))) names.push(sibling)
  }
  return names
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SharpFactory = (input?: string | Buffer) => any

/**
 * Load sharp via Node require so it resolves from node_modules at runtime.
 * Must stay external in build-server.js — bundling breaks createRequire / native bindings.
 */
function loadSharp(): SharpFactory | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('sharp') as SharpFactory | { default: SharpFactory }
    return typeof mod === 'function' ? mod : (mod.default ?? null)
  } catch (error) {
    console.warn('[outputCompress] sharp unavailable:', error)
    return null
  }
}

/**
 * Encode a single image file to AVIF. Returns true on success.
 */
export async function encodeFileToAvif(sourcePath: string, destPath: string): Promise<boolean> {
  const sharp = loadSharp()
  if (!sharp) return false
  try {
    await sharp(sourcePath).avif({ quality: AVIF_QUALITY }).toFile(destPath)
    return fs.existsSync(destPath) && fs.statSync(destPath).size > 0
  } catch (error) {
    console.warn('[outputCompress] AVIF encode failed:', error)
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
    } catch {
      /* ignore */
    }
    return false
  }
}

function removeDirSafe(dir: string | null): void {
  if (!dir) return
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

/**
 * After CLI success: collect staged/output PNGs and publish final basenames into outputDir.
 * When store format is PNG and CLI already wrote to outputDir, returns those names.
 * When store format is AVIF, converts each staged PNG into outputDir and removes the stage.
 */
export async function publishCliImageOutputs(
  ctx: AppContext,
  plan: CliImageOutputPlan,
  batchCount = 1
): Promise<string[]> {
  const basenames = collectOutputBasenames(plan.cliOutputPath, batchCount)
  if (!basenames.length) {
    if (fs.existsSync(plan.cliOutputPath)) {
      basenames.push(path.basename(plan.cliOutputPath))
    }
  }
  if (!basenames.length) {
    removeDirSafe(plan.stageDir)
    return []
  }

  // Direct PNG publish (CLI wrote into outputDir)
  if (!plan.stageDir) {
    return basenames
  }

  const stageDir = plan.stageDir
  const published: string[] = []

  for (const name of basenames) {
    const stagedPath = path.join(stageDir, name)
    if (!fs.existsSync(stagedPath)) continue

    const stem = path.basename(name, path.extname(name))
    const avifName = `${stem}.avif`
    const avifPath = path.join(ctx.paths.outputDir, avifName)
    const ok = await encodeFileToAvif(stagedPath, avifPath)
    if (ok) {
      published.push(avifName)
      try {
        fs.unlinkSync(stagedPath)
      } catch {
        /* ignore */
      }
      continue
    }

    // Fallback: promote PNG into Image output
    const pngName = `${stem}.png`
    const pngDest = path.join(ctx.paths.outputDir, pngName)
    try {
      fs.renameSync(stagedPath, pngDest)
      published.push(pngName)
    } catch {
      try {
        fs.copyFileSync(stagedPath, pngDest)
        published.push(pngName)
        fs.unlinkSync(stagedPath)
      } catch (error) {
        console.warn('[outputCompress] failed to promote PNG fallback:', error)
      }
    }
  }

  removeDirSafe(stageDir)
  return published
}

/**
 * Convert an existing output file to a buffer in the requested format for download/export.
 */
export async function convertOutputToFormat(
  sourcePath: string,
  format: OutputImageFormat
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  const sourceExt = path.extname(sourcePath).toLowerCase()
  const wantsAvif = format === 'avif'
  const sourceIsAvif = sourceExt === '.avif'
  const sourceIsPng = sourceExt === '.png'

  if (wantsAvif && sourceIsAvif) {
    return {
      buffer: fs.readFileSync(sourcePath),
      contentType: 'image/avif',
      ext: '.avif'
    }
  }
  if (!wantsAvif && sourceIsPng) {
    return {
      buffer: fs.readFileSync(sourcePath),
      contentType: 'image/png',
      ext: '.png'
    }
  }
  if (!wantsAvif && !sourceIsAvif && !sourceIsPng) {
    // jpeg/webp etc. — pass through as-is for non-png archive requests
    if (format === 'png') {
      // try convert to png
    } else {
      return {
        buffer: fs.readFileSync(sourcePath),
        contentType: 'application/octet-stream',
        ext: sourceExt || '.bin'
      }
    }
  }

  const sharp = loadSharp()
  if (!sharp) return null

  try {
    if (wantsAvif) {
      const buffer = await sharp(sourcePath).avif({ quality: AVIF_QUALITY }).toBuffer()
      return { buffer, contentType: 'image/avif', ext: '.avif' }
    }
    const buffer = await sharp(sourcePath).png().toBuffer()
    return { buffer, contentType: 'image/png', ext: '.png' }
  } catch (error) {
    console.warn('[outputCompress] convert for export failed:', error)
    return null
  }
}
