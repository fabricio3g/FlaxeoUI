import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { estimateBorderColor, keyOutBackground } from './imageMath.ts'

/** 6×6 white canvas with a 2×2 dark subject and a white "hole" pixel touching it. */
function sampleImage(): { data: Uint8Array; width: number; height: number; channels: number } {
  const width = 6
  const height = 6
  const data = new Uint8Array(width * height * 3).fill(255)
  for (const [x, y] of [
    [2, 2],
    [3, 2],
    [2, 3],
    [3, 3]
  ]) {
    const i = (y * width + x) * 3
    data[i] = 20
    data[i + 1] = 30
    data[i + 2] = 40
  }
  return { data, width, height, channels: 3 }
}

describe('background keying', () => {
  it('estimates the border color', () => {
    assert.deepEqual(estimateBorderColor(sampleImage()), [255, 255, 255])
  })

  it('clears border-connected background and keeps the subject opaque', () => {
    const img = sampleImage()
    const rgba = keyOutBackground(img, 30)
    const alpha = (x: number, y: number): number => rgba[(y * img.width + x) * 4 + 3]
    assert.equal(alpha(0, 0), 0)
    assert.equal(alpha(5, 5), 0)
    assert.ok(alpha(2, 2) > 0)
    assert.equal(rgba[(2 * img.width + 2) * 4], 20)
  })
})
