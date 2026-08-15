/**
 * Parse `sd-cli --help` output into the flag / mode inventory the app gates on.
 *
 * Kept pure (text in, data out) so both the server probe and unit tests can use it.
 */

export interface CliHelpInfo {
  flags: string[]
  modes: string[]
  versionLine?: string
}

/** Modes sd.cpp has shipped — matched by substring when the bracket list regex misses. */
const KNOWN_MODES = ['img_gen', 'vid_gen', 'upscale', 'convert', 'metadata', 'adetailer']

export function parseCliHelp(helpText: string): CliHelpInfo {
  const flags = new Set<string>()
  const modes = new Set<string>()
  const lines = helpText.split(/\r?\n/)
  let versionLine: string | undefined

  for (const line of lines) {
    if (!versionLine && /stable-diffusion\.cpp|version/i.test(line)) {
      versionLine = line.trim()
    }

    // Flags like: --upscale-model, -M, --mode
    const flagMatches = line.matchAll(/(?:^|\s)(--?[a-zA-Z][\w-]*)/g)
    for (const match of flagMatches) {
      const flag = match[1]
      if (flag === '-h' || flag === '--help') continue
      flags.add(flag)
    }

    // mode list: one of [img_gen, vid_gen, upscale, convert, metadata]
    const modeBlock = line.match(/\[([^\]]+)\]/)
    if (modeBlock && /mode|one of/i.test(line)) {
      for (const part of modeBlock[1].split(',')) {
        const mode = part.trim()
        if (/^[a-z][a-z0-9_]*$/.test(mode)) modes.add(mode)
      }
    }
  }

  for (const mode of KNOWN_MODES) {
    if (helpText.includes(mode)) modes.add(mode)
  }

  return { flags: [...flags].sort(), modes: [...modes].sort(), versionLine }
}

/**
 * Exact flag lookup. Never prefix-matches — `--hires-width` must not satisfy `--hires`,
 * which is the difference between "supports hires fix" and "supports one hires option".
 */
export function hasHelpFlag(flags: readonly string[], flag: string): boolean {
  if (!flag) return false
  const normalized = flag.startsWith('-') ? flag : `--${flag}`
  return flags.includes(normalized)
}
