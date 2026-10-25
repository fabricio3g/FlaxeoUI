/**
 * Workflow runs: execute a node graph in topological order. MODEL wires carry a model
 * setup (LoRA nodes add to it), GUIDE wires an add-on model with its images; generate and
 * video nodes turn their widgets plus those into the same request body Create sends, and
 * run the regular job functions (sd-cli, or the kept-loaded model).
 */
import path from 'path'
import type { Express } from 'express'
import type { AppContext, JsonObject } from '../types'
import { errorMessage, resolveInputFile } from '../utils'
import { requestOwner } from '../members'
import { hasFlagCached } from '../capabilitiesCache'
import { removeBackground } from '../imageOps'
import {
  ensureCliIdle,
  runAdetailerJob,
  runAsOwner,
  runImageJob,
  runUpscaleJob,
  runVideoJob,
  sendCliFailure,
  type JobOptions
} from './generation'
import {
  NODE_DEFS,
  estimateGraph,
  finalNodes,
  incoming,
  isWired,
  nodeTitle,
  resolvePrompt,
  sanitizeGraph,
  topoOrder,
  validateGraph,
  type GraphNode,
  type GraphRunState,
  type GuideValue,
  type WorkflowGraph
} from '../../shared/workflowGraph'
import { buildGenerationPayload } from '../../shared/generationPayload'
import {
  DEFAULT_RUN,
  pickMachine,
  type MachineFields,
  type ModelSetup
} from '../../shared/modelSetup'

type Values = Record<string, unknown[]>

async function executeGraph(
  ctx: AppContext,
  graph: WorkflowGraph,
  machine: MachineFields,
  run: GraphRunState
): Promise<void> {
  const order = topoOrder(graph)
  const totalRuns = Math.max(1, estimateGraph(graph).runs)
  const outputs = new Map<string, Values>()
  const cancelled = (): boolean => ctx.state.cliCancelRequested
  let runIndex = 0

  const wired = (node: GraphNode, handle: string): unknown[] =>
    incoming(graph, node.id, handle).flatMap((e) => outputs.get(e.source)?.[e.sourceHandle] || [])
  const texts = (node: GraphNode, handle: string): string[] =>
    wired(node, handle).filter((v): v is string => typeof v === 'string')
  const files = (node: GraphNode, handle: string): string[] => texts(node, handle)

  /** Widget value: a wired number wins, then the node's own value, then the model's. */
  const widget = (node: GraphNode, key: string, setup?: ModelSetup): unknown => {
    if (node.linked.includes(key)) {
      const value = wired(node, `w:${key}`)[0]
      if (typeof value === 'number') return value
    }
    const own = node.values[key]
    if (own !== null && own !== undefined && own !== '') return own
    const def = NODE_DEFS[node.type].widgets.find((w) => w.key === key)
    return def?.setupKey && setup ? setup[def.setupKey] : own
  }

  const job = (node: GraphNode): JobOptions => {
    runIndex++
    return {
      label: 'WORKFLOW',
      stage: { current: runIndex, total: totalRuns, label: nodeTitle(node) },
      // Results that feed another node stay PNG so sd-cli and sharp can read them.
      forcePng: graph.edges.some((e) => e.source === node.id),
      prefix: 'wf'
    }
  }

  /**
   * The request body Create would send for this node and model. Add-on models come only
   * from GUIDE wires and post steps only from their own nodes, so anything the model setup
   * still carries for them is cleared here.
   */
  const payloadFor = (
    node: GraphNode,
    setup: ModelSetup,
    extra: JsonObject,
    guides: GuideValue[] = []
  ): JsonObject => {
    const n = (key: string): number | undefined => {
      const value = Number(widget(node, key, setup))
      return Number.isFinite(value) ? value : undefined
    }
    const s = (key: string): string | undefined => {
      const value = widget(node, key, setup)
      return typeof value === 'string' && value ? value : undefined
    }
    const config = {
      ...machine,
      ...setup,
      ...DEFAULT_RUN,
      steps: n('steps') ?? setup.steps,
      cfgScale: n('cfgScale') ?? setup.cfgScale,
      sampler: s('sampler') ?? setup.sampler,
      scheduler: s('scheduler') ?? setup.scheduler,
      width: n('width') ?? setup.width,
      height: n('height') ?? setup.height,
      img2imgStrength: n('strength') ?? setup.img2imgStrength,
      videoFrames: n('frames') ?? setup.videoFrames,
      videoFps: n('fps') ?? setup.videoFps,
      videoMode: node.type === 'video',
      guidance: n('guidance') ?? setup.guidance,
      flowShift: n('flowShift') ?? setup.flowShift,
      seed: n('seed') ?? -1,
      batchCount: node.type === 'generate' ? Math.max(1, n('count') ?? 1) : 1,
      hiresEnabled: node.type === 'generate' && node.values.hires === true,
      hiresScale: n('hiresScale') ?? setup.hiresScale,
      hiresDenoise: n('hiresDenoise') ?? setup.hiresDenoise,
      hiresSteps: n('hiresSteps') ?? 0,
      hiresUpscaler: s('hiresUpscaler') ?? setup.hiresUpscaler,
      adetailerEnabled: false,
      upscaleModel: '',
      ...guideConfig(guides)
    }
    const payload = buildGenerationPayload(config, {
      prompt: resolvePrompt(String(node.values.prompt || ''), texts(node, 'prompt')),
      negativePrompt: resolvePrompt(String(node.values.negative || ''), texts(node, 'negative')),
      extra: extra as Record<string, string | number | boolean | object | undefined>
    }) as JsonObject
    if (!hasFlagCached('--ref-image-args')) delete payload.refImageArgs
    return payload
  }

  for (const node of order) {
    if (cancelled()) break
    const state = run.nodes[node.id]
    const def = NODE_DEFS[node.type]
    const out: Values = {}
    const push = (port: string, list: unknown[]): void => {
      out[port] = [...(out[port] || []), ...list]
    }
    state.status = 'running'
    try {
      if (node.bypassed) {
        // Pass the first matching input straight through.
        for (const port of def.outputs) {
          const input = def.inputs.find(
            (p) => p.type === port.type && isWired(graph, node.id, p.id)
          )
          if (input) push(port.id, wired(node, input.id))
        }
        state.status = 'skipped'
      } else {
        await runNode(node, push)
        state.status = cancelled() ? 'skipped' : 'done'
      }
    } catch (error) {
      state.status = 'failed'
      state.error = errorMessage(error)
      throw new Error(`${nodeTitle(node)}: ${state.error}`)
    } finally {
      outputs.set(node.id, out)
      for (const [port, list] of Object.entries(out)) {
        const type = def.outputs.find((p) => p.id === port)?.type
        if (type !== 'model' && type !== 'guide') {
          state.outputs[port] = list.filter((v): v is string => typeof v === 'string')
        }
      }
    }
  }

  run.finals = finalNodes(graph).flatMap((node) =>
    Object.values(run.nodes[node.id]?.outputs || {}).flat()
  )

  async function runNode(
    node: GraphNode,
    push: (port: string, list: unknown[]) => void
  ): Promise<void> {
    const state = run.nodes[node.id]
    const model = (): ModelSetup => {
      const setup = wired(node, 'model')[0] as ModelSetup | undefined
      if (!setup) throw new Error('connect a model.')
      return setup
    }
    const abs = (name: string): string => {
      const resolved = resolveInputFile(ctx, name)
      if (!resolved) throw new Error(`image "${path.basename(name)}" was not found.`)
      return resolved
    }
    const each = async (
      sources: string[],
      fn: (source: string | null) => Promise<{ cancelled: boolean; filenames: string[] }>,
      port: string
    ): Promise<void> => {
      const list = sources.length ? sources : [null]
      state.total = list.length
      for (const source of list) {
        if (cancelled()) return
        const result = await fn(source)
        if (result.cancelled) return
        push(port, result.filenames)
        state.done++
      }
    }

    switch (node.type) {
      case 'loadModel':
        push('model', [node.setup])
        break
      case 'lora': {
        const setup = model()
        const lora = String(node.values.lora || '').replace(/\.(safetensors|gguf|pt)$/i, '')
        push('model', [
          {
            ...setup,
            loras: [
              ...setup.loras,
              {
                path: lora,
                strength: Number(node.values.strength) || 1,
                target: node.values.highNoise ? 'high_noise' : 'default'
              }
            ]
          }
        ])
        break
      }
      case 'prompt':
        push('text', [String(node.values.text || '')])
        break
      case 'number':
        push('number', [Number(node.values.value) || 0])
        break
      case 'loadImages': {
        const names = (node.values.images as string[]) || []
        names.forEach(abs) // fail early when a file is gone
        push('image', names)
        break
      }
      case 'controlNet':
      case 'photoMaker':
      case 'ipAdapter':
      case 'pulid': {
        const images = files(node, 'image')
        images.forEach(abs)
        const guide: GuideValue = {
          kind: node.type,
          model: String(node.values.model || ''),
          images,
          strength: Number(node.values.strength),
          canny: node.values.canny === true,
          embedding: String(node.values.embedding || '')
        }
        push('guide', [guide])
        break
      }
      case 'generate': {
        const setup = model()
        const refs = files(node, 'refs')
        const mask = files(node, 'mask')[0]
        const guides = wired(node, 'guides') as GuideValue[]
        await each(
          files(node, 'init'),
          (init) =>
            runImageJob(
              ctx,
              payloadFor(
                node,
                setup,
                {
                  refImages: refs,
                  initImagePath: init || undefined,
                  maskPath: init ? mask : undefined,
                  strength: init ? (widget(node, 'strength', setup) as number) : undefined
                },
                guides
              ),
              null,
              job(node)
            ),
          'image'
        )
        break
      }
      case 'video': {
        const setup = model()
        const end = files(node, 'end')[0]
        const refs = files(node, 'refs')
        await each(
          files(node, 'start'),
          (start) =>
            runVideoJob(
              ctx,
              payloadFor(node, setup, {
                initImagePath: start || undefined,
                endImagePath: end,
                refImages: refs
              }),
              null,
              job(node)
            ),
          'video'
        )
        break
      }
      case 'upscale':
        await each(
          files(node, 'image'),
          (source) =>
            runUpscaleJob(
              ctx,
              {
                upscaleModel: node.values.model,
                upscaleRepeats: node.values.repeats,
                upscaleTileSize: node.values.tileSize
              },
              abs(source as string),
              job(node)
            ),
          'image'
        )
        break
      case 'faceFix': {
        const setup = model()
        await each(
          files(node, 'image'),
          (source) =>
            runAdetailerJob(
              ctx,
              payloadFor(node, setup, {
                adetailerEnabled: true,
                adetailerModel: node.values.detector,
                adetailerPrompt: String(node.values.prompt || '') || undefined,
                adetailerDenoisingStrength: node.values.denoise,
                adetailerConfidence: node.values.confidence
              }),
              abs(source as string),
              job(node)
            ),
          'image'
        )
        break
      }
      case 'removeBg': {
        const sources = files(node, 'image')
        state.total = sources.length
        for (const source of sources) {
          if (cancelled()) break
          push('image', [
            await removeBackground(ctx, abs(source), Number(node.values.tolerance) || 40)
          ])
          state.done++
        }
        break
      }
      case 'output':
        push('image', files(node, 'image'))
        push('video', files(node, 'video'))
        break
    }
  }
}

/** sd.cpp add-on model options for the guides wired into a Generate node. */
function guideConfig(guides: GuideValue[]): Partial<ModelSetup> & JsonObject {
  const of = (kind: GuideValue['kind']): GuideValue | undefined =>
    guides.find((g) => g.kind === kind)
  const control = of('controlNet')
  const identity = of('photoMaker')
  const style = of('ipAdapter')
  const pulid = of('pulid')
  return {
    controlNetModel: control?.model || '',
    controlImagePath: control?.images[0] || '',
    controlNetStrength: control?.strength ?? 0.9,
    applyCanny: control?.canny === true,
    photoMakerModel: identity?.model || '',
    photoMakerImages: identity?.images || [],
    photoMakerStyleStrength: identity?.strength ?? 20,
    photoMakerIdEmbedsPath: '',
    ipAdapterModel: style?.model || '',
    ipAdapterImage: style?.images[0] || '',
    ipAdapterStrength: style?.strength ?? 0.8,
    pulidWeights: pulid?.model || '',
    pulidIdEmbedding: pulid?.embedding || '',
    pulidIdWeight: pulid?.strength ?? 1
  }
}

export function registerWorkflowRoutes(app: Express, ctx: AppContext): void {
  /** Live state of the running (or last) workflow, polled by the canvas. */
  app.get('/api/workflows/status', (_req, res) => {
    res.json({ run: ctx.state.workflowRun || null })
  })

  /** Runs to completion; the canvas polls /status meanwhile for per-node progress. */
  app.post('/api/workflows/run', async (req, res) => {
    if (!ensureCliIdle(ctx, res)) return
    const body = (req.body || {}) as JsonObject
    const graph = sanitizeGraph({
      ...(body.graph as object),
      version: 3,
      id: 'run'
    })
    if (!graph) return res.status(400).json({ message: 'Invalid workflow' })
    const issues = validateGraph(graph)
    if (issues.length)
      return res.status(400).json({ message: issues.map((i) => i.message).join(' ') })

    const owner = requestOwner(ctx, res)
    const run: GraphRunState = {
      id: `run-${Date.now().toString(36)}`,
      workflowId: typeof body.workflowId === 'string' ? body.workflowId.slice(0, 80) : '',
      name: typeof body.name === 'string' ? body.name.slice(0, 120) : 'Workflow',
      owner,
      startedAt: Date.now(),
      status: 'running',
      finals: [],
      nodes: Object.fromEntries(
        graph.nodes.map((n) => [n.id, { status: 'pending', done: 0, total: 0, outputs: {} }])
      )
    }
    ctx.state.workflowRun = run

    await runAsOwner(ctx, owner, async () => {
      try {
        await executeGraph(ctx, graph, pickMachine(body.machine || {}), run)
        run.status = ctx.state.cliCancelRequested ? 'cancelled' : 'done'
        res.json({
          message: run.status === 'cancelled' ? 'Cancelled' : 'Complete',
          runId: run.id,
          filenames: run.finals,
          filename: run.finals[0],
          nodes: run.nodes
        })
      } catch (error) {
        run.status = 'failed'
        run.error = errorMessage(error)
        sendCliFailure(res, error, 'Workflow failed')
      } finally {
        run.finishedAt = Date.now()
      }
    })
  })
}
