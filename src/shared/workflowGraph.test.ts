import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRAPH_EXAMPLES,
  NODE_DEFS,
  checkConnection,
  connect,
  createGraph,
  createNode,
  duplicateGraph,
  estimateGraph,
  finalNodes,
  incoming,
  nodeInputs,
  resolvePrompt,
  sanitizeGraph,
  topoOrder,
  validateGraph,
  type WorkflowGraph
} from './workflowGraph.ts'

function chain(): WorkflowGraph {
  const graph = createGraph('test')
  const model = createNode('loadModel', { x: 0, y: 0 })
  model.setup!.diffusionModel = 'flux.gguf'
  model.setup!.loadMode = 'split'
  const lora = createNode('lora', { x: 300, y: 0 }, { lora: 'style' })
  const gen = createNode('generate', { x: 600, y: 0 }, { prompt: 'a fox' })
  const out = createNode('output', { x: 900, y: 0 })
  graph.nodes = [model, lora, gen, out]
  graph.edges = connect(graph, {
    source: model.id,
    sourceHandle: 'model',
    target: lora.id,
    targetHandle: 'model'
  })
  graph.edges = connect(graph, {
    source: lora.id,
    sourceHandle: 'model',
    target: gen.id,
    targetHandle: 'model'
  })
  graph.edges = connect(graph, {
    source: gen.id,
    sourceHandle: 'image',
    target: out.id,
    targetHandle: 'image'
  })
  return graph
}

describe('graph v3', () => {
  it('builds a Load model → LoRA → Generate chain that validates', () => {
    const graph = chain()
    assert.deepEqual(validateGraph(graph), [])
    assert.deepEqual(
      topoOrder(graph).map((n) => n.type),
      ['loadModel', 'lora', 'generate', 'output']
    )
    assert.equal(estimateGraph(graph).runs, 1)
    assert.equal(finalNodes(graph)[0].type, 'output')
  })

  it('only wires matching socket types and refuses loops', () => {
    const graph = chain()
    const [model, , gen] = graph.nodes
    const wrong = checkConnection(graph, {
      source: gen.id,
      sourceHandle: 'image',
      target: gen.id,
      targetHandle: 'model'
    })
    assert.equal(wrong.ok, false)
    const typed = checkConnection(graph, {
      source: model.id,
      sourceHandle: 'model',
      target: gen.id,
      targetHandle: 'refs'
    })
    assert.equal(typed.ok, false)
  })

  it('replaces the wire on single sockets and stacks on multiple ones', () => {
    const graph = chain()
    const gen = graph.nodes[2]
    const second = createNode('loadModel', { x: 0, y: 300 })
    graph.nodes.push(second)
    graph.edges = connect(graph, {
      source: second.id,
      sourceHandle: 'model',
      target: gen.id,
      targetHandle: 'model'
    })
    assert.equal(incoming(graph, gen.id, 'model').length, 1)
    const a = createNode('loadImages', { x: 0, y: 500 }, { images: ['a.png'] })
    const b = createNode('loadImages', { x: 0, y: 400 }, { images: ['b.png', 'c.png'] })
    graph.nodes.push(a, b)
    graph.edges = connect(graph, {
      source: a.id,
      sourceHandle: 'image',
      target: gen.id,
      targetHandle: 'refs'
    })
    graph.edges = connect(graph, {
      source: b.id,
      sourceHandle: 'image',
      target: gen.id,
      targetHandle: 'refs'
    })
    // Top node first
    assert.deepEqual(
      incoming(graph, gen.id, 'refs').map((e) => e.source),
      [b.id, a.id]
    )
  })

  it('fans out once per init image and multiplies by batch', () => {
    const graph = chain()
    const gen = graph.nodes[2]
    gen.values.count = 2
    const images = createNode(
      'loadImages',
      { x: 0, y: 300 },
      { images: ['a.png', 'b.png', 'c.png'] }
    )
    graph.nodes.push(images)
    graph.edges = connect(graph, {
      source: images.id,
      sourceHandle: 'image',
      target: gen.id,
      targetHandle: 'init'
    })
    const estimate = estimateGraph(graph)
    assert.equal(estimate.runs, 3)
    assert.equal(estimate.items[gen.id], 6)
  })

  it('turns a widget into an input socket', () => {
    const gen = createNode('generate')
    gen.linked = ['seed']
    assert.ok(nodeInputs(gen).some((p) => p.id === 'w:seed' && p.type === 'number'))
    const graph = chain()
    graph.nodes[2].linked = ['seed']
    const number = createNode('number', { x: 0, y: 600 }, { value: 7 })
    graph.nodes.push(number)
    const ok = checkConnection(graph, {
      source: number.id,
      sourceHandle: 'number',
      target: graph.nodes[2].id,
      targetHandle: 'w:seed'
    })
    assert.equal(ok.ok, true)
  })

  it('reports what is missing in plain words', () => {
    const graph = chain()
    graph.nodes[0].setup!.diffusionModel = ''
    graph.edges = graph.edges.filter(
      (e) => e.targetHandle !== 'model' || e.target !== graph.nodes[2].id
    )
    const messages = validateGraph(graph).map((i) => i.message)
    assert.ok(messages.some((m) => /choose a model/.test(m)))
    assert.ok(messages.some((m) => /connect Model/.test(m)))
  })

  it('fills {prompt} with wired text', () => {
    assert.equal(
      resolvePrompt('{prompt}, oil painting', ['a fox', 'snow']),
      'a fox, snow, oil painting'
    )
    assert.equal(resolvePrompt('', ['a fox']), 'a fox')
    assert.equal(resolvePrompt('studio light', ['a fox']), 'studio light, a fox')
  })

  it('round-trips through the sanitizer and drops unsafe values', () => {
    const graph = chain()
    graph.nodes[1].values.lora = '../../secret'
    const images = createNode('loadImages', {}, { images: ['ok.png', 'C:/x.png', '../y.png'] })
    graph.nodes.push(images)
    const clean = sanitizeGraph(JSON.parse(JSON.stringify(graph)))!
    assert.equal(clean.nodes.length, 5)
    assert.equal(clean.edges.length, 3)
    assert.equal(clean.nodes[1].values.lora, '')
    assert.deepEqual(clean.nodes[4].values.images, ['ok.png'])
    assert.equal(sanitizeGraph({ ...graph, version: 2 }), null)
  })

  it('ships valid examples that copy under new ids', () => {
    for (const example of GRAPH_EXAMPLES) {
      const clean = sanitizeGraph(example)
      assert.ok(clean, example.id)
      assert.equal(clean.edges.length, example.edges.length, example.id)
      for (const node of example.nodes) assert.ok(NODE_DEFS[node.type], node.type)
      const copy = duplicateGraph(example)
      assert.notEqual(copy.id, example.id)
      assert.equal(copy.edges.length, example.edges.length)
      assert.ok(copy.edges.every((e) => copy.nodes.some((n) => n.id === e.source)))
    }
  })

  it('migrates Edit image and Start image from older saves', () => {
    const graph = chain()
    const legacy = JSON.parse(JSON.stringify(graph))
    const images = createNode('loadImages', { x: 0, y: 300 }, { images: ['a.png'] })
    legacy.nodes.push({ ...images }, { ...createNode('generate'), id: 'n-edit', type: 'edit' })
    legacy.edges.push(
      {
        id: 'e-1',
        source: images.id,
        sourceHandle: 'image',
        target: 'n-edit',
        targetHandle: 'image'
      },
      {
        id: 'e-2',
        source: images.id,
        sourceHandle: 'image',
        target: graph.nodes[2].id,
        targetHandle: 'start'
      }
    )
    const clean = sanitizeGraph(legacy)!
    assert.equal(clean.nodes.find((n) => n.id === 'n-edit')?.type, 'generate')
    assert.equal(clean.edges.find((e) => e.id === 'e-1')?.targetHandle, 'refs')
    assert.equal(clean.edges.find((e) => e.id === 'e-2')?.targetHandle, 'init')
  })

  it('wires guides into Generate and checks them like sd.cpp would', () => {
    const graph = chain()
    const gen = graph.nodes[2]
    const pose = createNode('loadImages', { x: 0, y: 300 }, { images: ['pose.png'] })
    const control = createNode('controlNet', { x: 300, y: 300 }, { model: 'openpose.safetensors' })
    const second = createNode('controlNet', { x: 300, y: 500 }, { model: 'canny.safetensors' })
    graph.nodes.push(pose, control, second)
    for (const node of [control, second]) {
      graph.edges = connect(graph, {
        source: pose.id,
        sourceHandle: 'image',
        target: node.id,
        targetHandle: 'image'
      })
      graph.edges = connect(graph, {
        source: node.id,
        sourceHandle: 'guide',
        target: gen.id,
        targetHandle: 'guides'
      })
    }
    // A guide only goes into the guides socket
    assert.equal(
      checkConnection(graph, {
        source: control.id,
        sourceHandle: 'guide',
        target: gen.id,
        targetHandle: 'refs'
      }).ok,
      false
    )
    assert.ok(validateGraph(graph).some((i) => /one ControlNet at a time/.test(i.message)))
    second.bypassed = true
    assert.deepEqual(validateGraph(graph), [])
    // A mask needs an init image
    graph.edges = connect(graph, {
      source: pose.id,
      sourceHandle: 'image',
      target: gen.id,
      targetHandle: 'mask'
    })
    assert.ok(validateGraph(graph).some((i) => /mask needs an init image/.test(i.message)))
  })

  it('flags a video model on an image node', () => {
    const graph = chain()
    graph.nodes[0].setup!.diffusionModel = 'wan2.2_ti2v_5B_Q8_0.gguf'
    graph.nodes[0].setup!.modelFamily = 'wan22'
    const messages = validateGraph(graph).map((i) => i.message)
    assert.ok(
      messages.some((m) => /video model/.test(m)),
      messages.join(' | ')
    )
  })
})
