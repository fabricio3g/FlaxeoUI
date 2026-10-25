import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isOutputName, sanitizeSession, sessionTitle, summarizeSession } from './sessions.ts'

describe('sessions', () => {
  const raw = {
    id: 'ses-1',
    title: '',
    rows: [
      {
        id: 'row-1',
        mode: 'image',
        status: 'done',
        prompt: 'a red fox in snow',
        outputs: ['gen_1.png', '../secret.png', 'C:/x.png'],
        inputs: [
          { file: 'input_a.png', role: 'reference' },
          { file: 'input_b.png', role: 'boss' }
        ],
        setup: { steps: 9, sampler: 'euler' }
      },
      { id: 'BAD ID', prompt: 'dropped' }
    ]
  }

  it('keeps output-folder names only and known input roles', () => {
    const session = sanitizeSession(raw)!
    assert.equal(session.rows.length, 1)
    assert.deepEqual(session.rows[0].outputs, ['gen_1.png'])
    assert.deepEqual(session.rows[0].inputs, [{ file: 'input_a.png', role: 'reference' }])
    assert.equal(session.rows[0].setup?.steps, 9)
    assert.equal(isOutputName('a/b.png'), false)
  })

  it('titles and summarizes from the rows', () => {
    const session = sanitizeSession(raw)!
    assert.equal(sessionTitle(session), 'a red fox in snow')
    assert.equal(summarizeSession(session).cover, 'gen_1.png')
  })
})
