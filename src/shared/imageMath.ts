/**
 * Pure pixel operations for the Remove background node. Inputs are raw interleaved
 * buffers (sharp `.raw()`), so these run and test without native image libraries.
 */

export interface RawImage {
  data: Uint8Array | Buffer
  width: number
  height: number
  channels: number
}

function colorDistance(data: Uint8Array, i: number, r: number, g: number, b: number): number {
  const dr = data[i] - r
  const dg = data[i + 1] - g
  const db = data[i + 2] - b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** Median color of the outer border — the "flat background" a cut-out prompt asked for. */
export function estimateBorderColor(img: RawImage): [number, number, number] {
  const { data, width, height, channels } = img
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const push = (x: number, y: number): void => {
    const i = (y * width + x) * channels
    rs.push(data[i])
    gs.push(data[i + 1])
    bs.push(data[i + 2])
  }
  const stepX = Math.max(1, Math.floor(width / 64))
  const stepY = Math.max(1, Math.floor(height / 64))
  for (let x = 0; x < width; x += stepX) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += stepY) {
    push(0, y)
    push(width - 1, y)
  }
  const median = (values: number[]): number => {
    values.sort((a, b) => a - b)
    return values[Math.floor(values.length / 2)] ?? 0
  }
  return [median(rs), median(gs), median(bs)]
}

/**
 * Background removal by flood fill from the border: only background-colored pixels
 * connected to the edge become transparent, so same-colored details inside the subject
 * survive. A one-pixel feather softens the cut edge. Returns RGBA.
 */
export function keyOutBackground(img: RawImage, tolerance: number): Uint8Array {
  const { data, width, height, channels } = img
  const [br, bg, bb] = estimateBorderColor(img)
  const total = width * height
  const out = new Uint8Array(total * 4)
  for (let p = 0; p < total; p++) {
    const i = p * channels
    out[p * 4] = data[i]
    out[p * 4 + 1] = data[i + 1]
    out[p * 4 + 2] = data[i + 2]
    out[p * 4 + 3] = channels === 4 ? data[i + 3] : 255
  }

  const isBackground = new Uint8Array(total)
  const stack: number[] = []
  const tryPush = (p: number): void => {
    if (isBackground[p]) return
    if (colorDistance(data as Uint8Array, p * channels, br, bg, bb) > tolerance) return
    isBackground[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < width; x++) {
    tryPush(x)
    tryPush((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    tryPush(y * width)
    tryPush(y * width + width - 1)
  }
  while (stack.length) {
    const p = stack.pop() as number
    const x = p % width
    const y = (p - x) / width
    if (x > 0) tryPush(p - 1)
    if (x < width - 1) tryPush(p + 1)
    if (y > 0) tryPush(p - width)
    if (y < height - 1) tryPush(p + width)
  }

  for (let p = 0; p < total; p++) {
    if (isBackground[p]) {
      out[p * 4 + 3] = 0
      continue
    }
    // Feather: subject pixels touching the background fade by color similarity
    const x = p % width
    const y = (p - x) / width
    const touches =
      (x > 0 && isBackground[p - 1]) ||
      (x < width - 1 && isBackground[p + 1]) ||
      (y > 0 && isBackground[p - width]) ||
      (y < height - 1 && isBackground[p + width])
    if (touches) {
      const d = colorDistance(data as Uint8Array, p * channels, br, bg, bb)
      const alpha = Math.min(1, Math.max(0.35, (d - tolerance) / (tolerance * 2) + 0.35))
      out[p * 4 + 3] = Math.round(out[p * 4 + 3] * alpha)
    }
  }
  return out
}
