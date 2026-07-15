export type OutputImageFormat = 'png' | 'avif'

export function normalizeOutputImageFormat(value: unknown): OutputImageFormat {
  return value === 'avif' ? 'avif' : 'png'
}
