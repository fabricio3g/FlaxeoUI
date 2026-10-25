import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { hasHelpFlag, parseCliHelp, type CliHelpInfo } from '../shared/cliHelp'
import { parseSdHelp, type SdHelp } from '../shared/sdHelp'
import bundledHelpText from '../../sd-cli-help.txt'

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

let capabilitiesCache: { at: number; path: string; info: CliHelpInfo; help: SdHelp } | null = null
let bundledHelp: SdHelp | null = null

/** Call whenever the active backend changes (switch version, custom folder, install). */
export function invalidateCapabilitiesCache(): void {
  capabilitiesCache = null
}

async function probe(cliPath: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(cliPath, ['--help'], {
      timeout: 15000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    })
    return `${stdout || ''}
${stderr || ''}`
  } catch (error: unknown) {
    // sd-cli prints help to stderr and exits non-zero on some builds
    const err = error as { stdout?: string; stderr?: string }
    return `${err?.stdout || ''}
${err?.stderr || ''}`
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

  const text = await probe(cliPath)
  const info = text.trim() ? parseCliHelp(text) : { flags: [], modes: [] }
  capabilitiesCache = { at: Date.now(), path: cliPath, info, help: parseSdHelp(text) }
  return info
}

/** Parsed options of the installed sd-cli (null until probed or when none is installed). */
export function cachedHelp(): SdHelp | null {
  return capabilitiesCache?.help.options.length ? capabilitiesCache.help : null
}

/** Options for the UI: the installed sd-cli when available, else the help captured in the repo. */
export async function getHelpForUi(cliPath: string): Promise<{ help: SdHelp; live: boolean }> {
  await getCapabilities(cliPath)
  const live = cachedHelp()
  if (live) return { help: live, live: true }
  bundledHelp ??= parseSdHelp(bundledHelpText)
  return { help: bundledHelp, live: false }
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
