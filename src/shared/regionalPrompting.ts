export type RegionalPromptRegion = {
  id: string
  x: number
  y: number
  width: number
  height: number
  prompt: string
}

export const MAX_REGIONAL_PROMPTS = 4

const MIN_NORMALIZED_SIZE = 0.01

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeRegionalPromptRegions(value: unknown): RegionalPromptRegion[] {
  if (!Array.isArray(value)) return []

  const regions: RegionalPromptRegion[] = []
  const usedIds = new Set<string>()

  for (let index = 0; index < value.length && regions.length < MAX_REGIONAL_PROMPTS; index++) {
    const candidate = value[index]
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue

    const record = candidate as Record<string, unknown>
    if (
      typeof record.x !== 'number' ||
      !Number.isFinite(record.x) ||
      typeof record.y !== 'number' ||
      !Number.isFinite(record.y) ||
      typeof record.width !== 'number' ||
      !Number.isFinite(record.width) ||
      typeof record.height !== 'number' ||
      !Number.isFinite(record.height)
    ) {
      continue
    }

    const x = clamp(record.x, 0, 1)
    const y = clamp(record.y, 0, 1)
    const width = clamp(record.width, 0, 1 - x)
    const height = clamp(record.height, 0, 1 - y)
    if (width < MIN_NORMALIZED_SIZE || height < MIN_NORMALIZED_SIZE) continue

    const baseId =
      typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `region-${index + 1}`
    let id = baseId
    let suffix = 2
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`
    usedIds.add(id)

    regions.push({
      id,
      x,
      y,
      width,
      height,
      prompt: typeof record.prompt === 'string' ? record.prompt.trim() : ''
    })
  }

  return regions
}

export function normalizedRectToPixels(
  region: RegionalPromptRegion,
  width: number,
  height: number
): Pick<RegionalPromptRegion, 'x' | 'y' | 'width' | 'height'> {
  const pixelBoundsWidth = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1))
  const pixelBoundsHeight = Math.max(1, Math.floor(Number.isFinite(height) ? height : 1))
  const normalizedX = clamp(Number.isFinite(region.x) ? region.x : 0, 0, 1)
  const normalizedY = clamp(Number.isFinite(region.y) ? region.y : 0, 0, 1)
  const normalizedWidth = clamp(
    Number.isFinite(region.width) ? region.width : 0,
    0,
    1 - normalizedX
  )
  const normalizedHeight = clamp(
    Number.isFinite(region.height) ? region.height : 0,
    0,
    1 - normalizedY
  )

  const x = Math.min(pixelBoundsWidth - 1, Math.floor(normalizedX * pixelBoundsWidth))
  const y = Math.min(pixelBoundsHeight - 1, Math.floor(normalizedY * pixelBoundsHeight))
  const right = Math.min(
    pixelBoundsWidth,
    Math.ceil((normalizedX + normalizedWidth) * pixelBoundsWidth)
  )
  const bottom = Math.min(
    pixelBoundsHeight,
    Math.ceil((normalizedY + normalizedHeight) * pixelBoundsHeight)
  )

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  }
}

export function composeRegionalPrompt(mainPrompt: string, regionPrompt: string): string {
  return [mainPrompt.trim(), regionPrompt.trim()].filter(Boolean).join(', ')
}
