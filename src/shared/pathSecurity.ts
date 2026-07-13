import fs from 'node:fs'
import path from 'node:path'

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveStoredPath(
  value: unknown,
  outputDir: string,
  roots: string[],
  kind: 'file' | 'directory' = 'file'
): string | null {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return null

  let raw = value
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw)
      if (!url.pathname.startsWith('/output/')) return null
      raw = decodeURIComponent(url.pathname.slice('/output/'.length))
    } else if (raw.startsWith('/output/')) {
      raw = decodeURIComponent(raw.slice('/output/'.length))
    } else if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !path.isAbsolute(raw)) {
      return null
    }

    const candidate = path.isAbsolute(raw) ? raw : path.resolve(outputDir, raw)
    const realCandidate = fs.realpathSync.native(candidate)
    const allowed = roots.some((root) => {
      try {
        return isPathInside(fs.realpathSync.native(root), realCandidate)
      } catch {
        return false
      }
    })
    if (!allowed) return null

    const stat = fs.statSync(realCandidate)
    if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) return null
    return realCandidate
  } catch {
    return null
  }
}
