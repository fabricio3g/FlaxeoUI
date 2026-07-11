import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { appendLoraPromptTokens, formatLoraPromptToken } from '../renderer/src/lib/promptTokens.ts'

describe('formatLoraPromptToken', () => {
  it('formats default lora token', () => {
    assert.equal(
      formatLoraPromptToken({ path: 'models/loras/style.safetensors', strength: 0.8 }),
      '<lora:style:0.8>'
    )
  })

  it('formats high-noise branch token', () => {
    assert.equal(
      formatLoraPromptToken({
        path: 'wan_high.safetensors',
        strength: 1,
        target: 'high_noise'
      }),
      '<lora:|high_noise|wan_high:1>'
    )
  })
})

describe('appendLoraPromptTokens', () => {
  it('appends multiple tokens after prompt', () => {
    const result = appendLoraPromptTokens('a cat', [
      { path: 'a.safetensors', strength: 1 },
      { path: 'b.gguf', strength: 0.5, target: 'high_noise' }
    ])
    assert.equal(result, 'a cat <lora:a:1> <lora:|high_noise|b:0.5>')
  })
})
