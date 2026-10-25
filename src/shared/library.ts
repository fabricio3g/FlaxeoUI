/**
 * Library records shared by server and renderer: ids, text helpers, style kits and member
 * names. Everything read from disk or imported from a file goes through a sanitizer.
 */

/** Opaque library ids: lowercase, URL-safe, bounded (same shape as LAN media ids). */
export const LIBRARY_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/

export function isLibraryId(value: unknown): value is string {
  return typeof value === 'string' && LIBRARY_ID_PATTERN.test(value)
}

export function createLibraryId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${random}`.toLowerCase()
}

export function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\0/g, '').slice(0, max) : ''
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function cleanTimestamp(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Date.now()
}

/** Display names for people on the network: short, single-line. */
export function cleanMemberName(value: unknown, fallback = ''): string {
  const name = cleanText(value, 40).replace(/\s+/g, ' ').trim()
  return name || fallback
}

/* ------------------------------ Style kits ------------------------------ */

export interface StyleKitSize {
  label: string
  width: number
  height: number
}

export interface StyleKitLora {
  path: string
  strength: number
}

export interface StyleKit {
  id: string
  name: string
  description: string
  /** Added to every prompt while the kit is active */
  stylePrompt: string
  /** Merged into every negative prompt */
  negativePrompt: string
  /** Hex colors; described to the model by name ("teal, coral") */
  palette: string[]
  /** Preferred output sizes, offered first in the size menu */
  sizes: StyleKitSize[]
  loras: StyleKitLora[]
  createdAt: number
  updatedAt: number
  updatedBy: string
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function sanitizeStyleKit(raw: unknown): StyleKit | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isLibraryId(r.id)) return null
  const name = cleanText(r.name, 80).trim()
  if (!name) return null
  const palette = Array.isArray(r.palette)
    ? r.palette
        .filter((c): c is string => typeof c === 'string' && HEX_COLOR.test(c))
        .map((c) => c.toLowerCase())
        .slice(0, 8)
    : []
  const sizes = Array.isArray(r.sizes)
    ? r.sizes
        .map((s) => {
          const size = (s || {}) as Record<string, unknown>
          const inRange = (v: unknown): boolean => Number(v) >= 64 && Number(v) <= 4096
          return {
            label: cleanText(size.label, 40).trim(),
            width: inRange(size.width) ? Math.round(Number(size.width) / 8) * 8 : 0,
            height: inRange(size.height) ? Math.round(Number(size.height) / 8) * 8 : 0
          }
        })
        .filter((s) => s.width > 0 && s.height > 0)
        .slice(0, 12)
    : []
  const loras = Array.isArray(r.loras)
    ? r.loras
        .map((l) => {
          const lora = (l || {}) as Record<string, unknown>
          return {
            path: cleanText(lora.path, 260).trim(),
            strength: clampNumber(lora.strength, -4, 4, 1)
          }
        })
        // LoRA names are resolved inside the LoRA folder — never accept paths
        .filter((l) => l.path && !/[\\/]|\.\./.test(l.path))
        .slice(0, 8)
    : []
  return {
    id: r.id,
    name,
    description: cleanText(r.description, 400),
    stylePrompt: cleanText(r.stylePrompt, 1200),
    negativePrompt: cleanText(r.negativePrompt, 1200),
    palette,
    sizes,
    loras,
    createdAt: cleanTimestamp(r.createdAt),
    updatedAt: cleanTimestamp(r.updatedAt),
    updatedBy: cleanText(r.updatedBy, 60)
  }
}

/** Basic color words image models understand, with a reference RGB for each. */
const COLOR_NAMES: Array<[string, number, number, number]> = [
  ['black', 15, 15, 15],
  ['charcoal', 54, 69, 79],
  ['gray', 128, 128, 128],
  ['silver', 192, 192, 192],
  ['white', 245, 245, 245],
  ['cream', 255, 245, 214],
  ['beige', 222, 205, 170],
  ['brown', 120, 72, 40],
  ['tan', 200, 160, 110],
  ['red', 210, 35, 35],
  ['crimson', 150, 20, 40],
  ['coral', 255, 120, 90],
  ['orange', 245, 140, 30],
  ['gold', 220, 175, 40],
  ['yellow', 250, 220, 50],
  ['olive', 120, 125, 40],
  ['lime', 160, 220, 60],
  ['green', 40, 150, 70],
  ['forest green', 30, 80, 45],
  ['mint', 160, 230, 190],
  ['teal', 20, 130, 130],
  ['turquoise', 60, 210, 200],
  ['sky blue', 120, 190, 240],
  ['blue', 40, 90, 210],
  ['navy', 20, 30, 80],
  ['indigo', 75, 45, 150],
  ['purple', 130, 60, 170],
  ['lavender', 190, 170, 235],
  ['magenta', 220, 40, 160],
  ['pink', 245, 160, 190]
]

/** Nearest plain color word for a hex value ("#ff5500" → "orange"). */
export function colorName(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  let best = COLOR_NAMES[0]
  let bestDistance = Infinity
  for (const entry of COLOR_NAMES) {
    const distance = (entry[1] - r) ** 2 + (entry[2] - g) ** 2 + (entry[3] - b) ** 2
    if (distance < bestDistance) {
      best = entry
      bestDistance = distance
    }
  }
  return best[0]
}

export interface StyledPrompt {
  prompt: string
  negativePrompt: string
  loras: Array<{ path: string; strength: number }>
}

function joinPromptParts(...parts: string[]): string {
  return parts
    .map((p) =>
      p
        .trim()
        .replace(/^,+|,+$/g, '')
        .trim()
    )
    .filter(Boolean)
    .join(', ')
}

/** "color palette of orange and navy" — hex codes mean nothing to a text encoder. */
export function paletteText(palette: readonly string[]): string {
  const names = [...new Set(palette.map(colorName))]
  if (!names.length) return ''
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return `color palette of ${list}`
}

/**
 * Apply a kit to one generation's prompt pair and LoRA list. The single place style kits
 * touch a generation (shared/generationPayload.ts). Idempotent: re-applying does not stack.
 */
export function applyStyleKit(kit: StyleKit | null | undefined, input: StyledPrompt): StyledPrompt {
  if (!kit) return input
  const additions = [kit.stylePrompt.trim(), paletteText(kit.palette)].filter(
    (part) => part && !input.prompt.includes(part)
  )
  const negative = kit.negativePrompt.trim()
  const loras = [...input.loras]
  for (const lora of kit.loras) {
    if (!loras.some((l) => l.path === lora.path)) loras.push({ ...lora })
  }
  return {
    prompt: joinPromptParts(input.prompt, ...additions),
    negativePrompt:
      negative && !input.negativePrompt.includes(negative)
        ? joinPromptParts(input.negativePrompt, negative)
        : input.negativePrompt,
    loras
  }
}
