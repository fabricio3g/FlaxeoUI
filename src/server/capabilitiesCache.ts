import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { hasHelpFlag, parseCliHelp, type CliHelpInfo } from '../shared/cliHelp'

const execFileAsync = promisify(execFile)

/**
 * Flag inventory of the active sd-cli, used server-side to pick between flag
 * *spellings* (e.g. --model-args vs the legacy --chroma-* flags).
 *
 * The renderer keeps its own copy via /api/backend/capabilities for disabling
 * controls; this cache exists because argv is built here, after the request
 * leaves the renderer.
 */
const CAPABILITIES_CACHE_TTL_MS = 60_000

let capabilitiesCache: { at: number; path: string; info: CliHelpInfo } | null = null

/** Call whenever the active backend changes (switch version, custom folder, install). */
export function invalidateCapabilitiesCache(): void {
  capabilitiesCache = null
}

async function probe(cliPath: string): Promise<CliHelpInfo> {
  try {
    const { stdout, stderr } = await execFileAsync(cliPath, ['--help'], {
      timeout: 15000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    })
    return parseCliHelp(`${stdout || ''}\n${stderr || ''}`)
  } catch (error: unknown) {
    // sd-cli prints help to stderr and exits non-zero on some builds
    const err = error as { stdout?: string; stderr?: string }
    const text = `${err?.stdout || ''}\n${err?.stderr || ''}`
    return text.trim() ? parseCliHelp(text) : { flags: [], modes: [] }
  }
}

/** Takes the resolved sd-cli path rather than AppContext, so sd.ts can import this without a cycle. */
export async function getCapabilities(cliPath: string): Promise<CliHelpInfo> {
  const fresh =
    capabilitiesCache &&
    capabilitiesCache.path === cliPath &&
    Date.now() - capabilitiesCache.at < CAPABILITIES_CACHE_TTL_MS
  if (fresh && capabilitiesCache) return capabilitiesCache.info

  if (!fs.existsSync(cliPath)) return { flags: [], modes: [] }

  const info = await probe(cliPath)
  capabilitiesCache = { at: Date.now(), path: cliPath, info }
  return info
}

/**
 * Synchronous read for argv builders, which are sync inside async route handlers.
 * Handlers call `getCapabilities()` first to warm this; a cold cache reports false,
 * which means "emit the legacy spelling" — the behaviour before this cache existed.
 */
export function hasFlagCached(flag: string): boolean {
  if (!capabilitiesCache) return false
  return hasHelpFlag(capabilitiesCache.info.flags, flag)
}
