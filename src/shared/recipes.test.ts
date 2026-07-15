import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getBuiltinRecipes,
  normalizeRecipe,
  parseRecipeJson,
  RECIPE_VERSION,
  serializeRecipe
} from './recipes.ts'

describe('recipes', () => {
  it('normalizes a valid recipe', () => {
    const r = normalizeRecipe({
      version: RECIPE_VERSION,
      name: 'Test',
      surface: 'text2image',
      prompt: 'a cat',
      tags: ['fun'],
      configSnapshot: { steps: 20, width: 512, height: 512 }
    })
    assert.ok(r)
    assert.equal(r!.name, 'Test')
    assert.equal(r!.surface, 'text2image')
    assert.equal(r!.configSnapshot.steps, 20)
    assert.ok(r!.id.startsWith('recipe-') || r!.id.length > 0)
  })

  it('rejects missing name or surface', () => {
    assert.equal(normalizeRecipe({ surface: 'text2image', configSnapshot: {} }), null)
    assert.equal(normalizeRecipe({ name: 'x', surface: 'nope', configSnapshot: {} }), null)
    assert.equal(normalizeRecipe({ name: 'x', surface: 'text2image' }), null)
  })

  it('round-trips JSON serialize/parse', () => {
    const builtins = getBuiltinRecipes()
    assert.ok(builtins.length >= 12)
    assert.ok(builtins.some((r) => r.id === 'builtin-surface-tile'))
    assert.ok(builtins.some((r) => r.tags.includes('surface')))
    const json = serializeRecipe(builtins[0], { stripBuiltin: true })
    const parsed = parseRecipeJson(json)
    assert.ok(parsed)
    assert.equal(parsed!.name, builtins[0].name)
    assert.equal(parsed!.prompt, builtins[0].prompt)
    assert.equal(parsed!.configSnapshot.width, builtins[0].configSnapshot.width)
  })

  it('deep-clones nested config snapshot fields', () => {
    const loras = [{ path: 'style.safetensors', multiplier: 0.8 }]
    const recipe = normalizeRecipe({
      name: 'Lora clone',
      surface: 'text2image',
      tags: [],
      configSnapshot: { steps: 20, loras }
    })

    assert.ok(recipe)
    loras[0].multiplier = 0.1
    const saved = recipe.configSnapshot.loras as typeof loras
    assert.equal(saved[0].multiplier, 0.8)
  })

  it('parseRecipeJson handles bad input', () => {
    assert.equal(parseRecipeJson('{'), null)
    assert.equal(parseRecipeJson('[]'), null)
  })
})
