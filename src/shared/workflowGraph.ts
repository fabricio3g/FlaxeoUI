/**
 * Node workflows, ComfyUI style, shaped after how stable-diffusion.cpp works:
 *
 *   Load model -MODEL-> LoRA -MODEL-> Generate image -IMAGE-> Generate video -VIDEO-> Output
 *   Load images -IMAGE-> ControlNet -GUIDE-> Generate image
 *
 * - MODEL = sd.cpp's context options: the model files it loads (+ LoRAs added on the way).
 * - GUIDE = an add-on model loaded next to it with the images it reads: ControlNet,
 *   PhotoMaker, IP-Adapter, PuLID.
 * - Generate image / Generate video / Upscale / Fix faces are sd.cpp's run modes (img_gen,
 *   vid_gen, upscale, adetailer); their widgets are its generation options. Sampling
 *   widgets left empty use the model family's recommendation.
 *
 * Every node type is declared once in NODE_DEFS (sockets + widgets); the editor renders
 * widgets generically and the server executes by node type. Semantics:
 * - Edges connect sockets of the same type. An input socket marked `multiple` takes several
 *   edges (ordered by the source node's vertical position); others take one.
 * - IMAGE carries a list of files. A node runs once per image on its fan-out socket; other
 *   image sockets pass the whole list to every run.
 * - TEXT inputs join with ", " and fill `{prompt}` in the node's prompt widget (or are used
 *   as the prompt when the widget is empty).
 * - A widget can be turned into an input socket ("convert to input"); a wired value wins.
 * - Bypassed nodes pass their first matching input straight through.
 */
import { clampNumber, cleanText, createLibraryId, isLibraryId } from './library.ts'
import { createSetup, pickSetup, type ModelSetup } from './modelSetup.ts'
import { setupFamily, type FamilyKind } from './modelFamilies.ts'
import { HIRES_BUILTIN_UPSCALERS } from './sdArgHelpers.ts'

export type SocketType = 'model' | 'guide' | 'text' | 'image' | 'video' | 'number'

export const NODE_TYPES = [
  'loadModel',
  'lora',
  'controlNet',
  'photoMaker',
  'ipAdapter',
  'pulid',
  'prompt',
  'number',
  'loadImages',
  'generate',
  'video',
  'upscale',
  'faceFix',
  'removeBg',
  'output'
] as const
export type NodeType = (typeof NODE_TYPES)[number]

export interface PortDef {
  id: string
  label: string
  type: SocketType
  /** Accepts several edges (their values form a list) */
  multiple?: boolean
  required?: boolean
  /** The node runs once per image on this socket */
  fanOut?: boolean
}

export type WidgetKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'slider'
  | 'select'
  | 'toggle'
  | 'file'
  | 'images'
  | 'seed'

export interface WidgetDef {
  key: string
  label: string
  kind: WidgetKind
  min?: number
  max?: number
  step?: number
  /** Static choices for selects */
  choices?: Array<{ value: string; label: string }>
  /** Choices that come from the installed sd-cli (`--help`) for this flag */
  choicesFlag?: string
  /** `/api/models` category for file widgets */
  category?: string
  placeholder?: string
  /** Socket type when converted to an input */
  input?: SocketType
  /**
   * Model setup key this widget overrides. Empty value (null) = the model's recommended
   * value (from its family), which shows as the placeholder.
   */
  setupKey?: keyof ModelSetup
  /** Shown only when this widget is truthy / this socket is wired */
  showIf?: { widget?: string; wired?: string }
  default: unknown
}

/**
 * Groups follow sd.cpp: what it loads (models and the add-ons that guide them), what you
 * feed it, its run modes (img_gen, vid_gen, upscale, adetailer), and Flaxeo's own tools.
 */
export type NodeGroup = 'models' | 'guides' | 'inputs' | 'generate' | 'finish' | 'output'

export interface NodeDef {
  type: NodeType
  label: string
  description: string
  group: NodeGroup
  inputs: PortDef[]
  outputs: PortDef[]
  widgets: WidgetDef[]
  /** Runs sd-cli */
  gpu: boolean
  /** Which kinds of model this node expects on its MODEL socket */
  modelKinds?: FamilyKind[]
}

/**
 * What a GUIDE wire carries: an add-on model sd.cpp loads next to the main one, with the
 * images it reads (`--control-net` + `--control-image`, `--photo-maker` + id images, …).
 */
export interface GuideValue {
  kind: 'controlNet' | 'photoMaker' | 'ipAdapter' | 'pulid'
  model: string
  images: string[]
  strength: number
  canny?: boolean
  embedding?: string
}

const MODEL_IN: PortDef = { id: 'model', label: 'Model', type: 'model', required: true }
const PROMPT_IN: PortDef = { id: 'prompt', label: 'Prompt', type: 'text', multiple: true }
const NEGATIVE_IN: PortDef = { id: 'negative', label: 'Negative', type: 'text', multiple: true }
const IMAGE_OUT: PortDef = { id: 'image', label: 'Image', type: 'image' }
const GUIDE_OUT: PortDef = { id: 'guide', label: 'Guide', type: 'guide' }
const EACH_IMAGE_IN: PortDef = {
  id: 'image',
  label: 'Image',
  type: 'image',
  multiple: true,
  required: true,
  fanOut: true
}

const promptWidget: WidgetDef = {
  key: 'prompt',
  label: 'Prompt',
  kind: 'textarea',
  placeholder: 'Describe it. A wired prompt fills {prompt}.',
  default: ''
}
const negativeWidget: WidgetDef = {
  key: 'negative',
  label: 'Negative',
  kind: 'textarea',
  placeholder: 'What to avoid',
  default: ''
}
const seedWidget: WidgetDef = {
  key: 'seed',
  label: 'Seed',
  kind: 'seed',
  input: 'number',
  default: -1
}
const recommended = (
  key: string,
  label: string,
  setupKey: keyof ModelSetup,
  range: Pick<WidgetDef, 'min' | 'max' | 'step'>
): WidgetDef => ({
  key,
  label,
  kind: 'number',
  ...range,
  input: 'number',
  setupKey,
  default: null
})
/** sd.cpp sampling options; empty uses the model family's recommendation. */
const sampling: WidgetDef[] = [
  recommended('steps', 'Steps', 'steps', { min: 1, max: 150 }),
  recommended('cfgScale', 'CFG', 'cfgScale', { min: 0, max: 30, step: 0.1 }),
  recommended('guidance', 'Guidance', 'guidance', { min: 0, max: 30, step: 0.1 }),
  {
    key: 'sampler',
    label: 'Sampler',
    kind: 'select',
    choicesFlag: '--sampling-method',
    setupKey: 'sampler',
    default: null
  },
  {
    key: 'scheduler',
    label: 'Scheduler',
    kind: 'select',
    choicesFlag: '--scheduler',
    setupKey: 'scheduler',
    default: null
  }
]
const size = (step: number): WidgetDef[] => [
  recommended('width', 'Width', 'width', { min: 64, max: 4096, step }),
  recommended('height', 'Height', 'height', { min: 64, max: 4096, step })
]
const denoiseWidget = (wired: string): WidgetDef => ({
  key: 'strength',
  label: 'Strength',
  kind: 'slider',
  min: 0,
  max: 1,
  step: 0.01,
  input: 'number',
  setupKey: 'img2imgStrength',
  showIf: { wired },
  default: null
})
const slider = (key: string, label: string, max: number, fallback: number): WidgetDef => ({
  key,
  label,
  kind: 'slider',
  min: 0,
  max,
  step: max > 10 ? 1 : 0.05,
  default: fallback
})
const HIRES_UPSCALERS = HIRES_BUILTIN_UPSCALERS.map((value) => ({ value, label: value }))

export const NODE_DEFS: Record<NodeType, NodeDef> = {
  loadModel: {
    type: 'loadModel',
    label: 'Load model',
    description:
      'What sd.cpp loads: the model with its text encoders, VAE and tokenizer. Its family recommends the sampling settings of the nodes it feeds.',
    group: 'models',
    inputs: [],
    outputs: [{ id: 'model', label: 'Model', type: 'model' }],
    widgets: [],
    gpu: false
  },
  lora: {
    type: 'lora',
    label: 'LoRA',
    description:
      'Adds a LoRA to the model passing through, on top of any on Load model. Chain several.',
    group: 'models',
    inputs: [MODEL_IN],
    outputs: [{ id: 'model', label: 'Model', type: 'model' }],
    widgets: [
      { key: 'lora', label: 'LoRA', kind: 'file', category: 'loras', default: '' },
      slider('strength', 'Strength', 2, 1),
      { key: 'highNoise', label: 'High-noise model', kind: 'toggle', default: false }
    ],
    gpu: false
  },
  controlNet: {
    type: 'controlNet',
    label: 'ControlNet',
    description: 'Follow the pose, edges or depth of a control image (--control-net).',
    group: 'guides',
    inputs: [{ id: 'image', label: 'Control image', type: 'image', required: true }],
    outputs: [GUIDE_OUT],
    widgets: [
      { key: 'model', label: 'ControlNet', kind: 'file', category: 'controlnet', default: '' },
      slider('strength', 'Strength', 2, 0.9),
      { key: 'canny', label: 'Edge-detect first (Canny)', kind: 'toggle', default: false }
    ],
    gpu: false
  },
  photoMaker: {
    type: 'photoMaker',
    label: 'Identity (PhotoMaker)',
    description: 'Keep a person’s face from a few photos of them (--photo-maker, SDXL).',
    group: 'guides',
    inputs: [{ id: 'image', label: 'Face photos', type: 'image', multiple: true, required: true }],
    outputs: [GUIDE_OUT],
    widgets: [
      { key: 'model', label: 'PhotoMaker', kind: 'file', category: 'photomaker', default: '' },
      slider('strength', 'Style strength', 100, 20)
    ],
    gpu: false
  },
  ipAdapter: {
    type: 'ipAdapter',
    label: 'Style reference (IP-Adapter)',
    description: 'Borrow the look of an image (--ip-adapter; the model needs CLIP vision).',
    group: 'guides',
    inputs: [{ id: 'image', label: 'Style image', type: 'image', required: true }],
    outputs: [GUIDE_OUT],
    widgets: [
      { key: 'model', label: 'IP-Adapter', kind: 'file', category: 'ipAdapter', default: '' },
      slider('strength', 'Strength', 2, 0.8)
    ],
    gpu: false
  },
  pulid: {
    type: 'pulid',
    label: 'Identity (PuLID)',
    description: 'Keep a face from a saved identity embedding (--pulid-weights, FLUX).',
    group: 'guides',
    inputs: [],
    outputs: [GUIDE_OUT],
    widgets: [
      { key: 'model', label: 'PuLID weights', kind: 'file', category: 'pulid', default: '' },
      { key: 'embedding', label: 'Identity', kind: 'file', category: 'pulid', default: '' },
      slider('strength', 'Weight', 2, 1)
    ],
    gpu: false
  },
  prompt: {
    type: 'prompt',
    label: 'Prompt',
    description: 'Text you can wire into several nodes.',
    group: 'inputs',
    inputs: [],
    outputs: [{ id: 'text', label: 'Text', type: 'text' }],
    widgets: [{ key: 'text', label: 'Text', kind: 'textarea', placeholder: 'Prompt', default: '' }],
    gpu: false
  },
  number: {
    type: 'number',
    label: 'Number',
    description: 'One number for widgets turned into inputs (seed, steps, size…).',
    group: 'inputs',
    inputs: [],
    outputs: [{ id: 'number', label: 'Number', type: 'number' }],
    widgets: [{ key: 'value', label: 'Value', kind: 'number', default: 0 }],
    gpu: false
  },
  loadImages: {
    type: 'loadImages',
    label: 'Load images',
    description: 'One or more images for init, mask, reference or guide sockets.',
    group: 'inputs',
    inputs: [],
    outputs: [{ id: 'image', label: 'Images', type: 'image' }],
    widgets: [{ key: 'images', label: 'Images', kind: 'images', default: [] }],
    gpu: false
  },
  generate: {
    type: 'generate',
    label: 'Generate image',
    description:
      'sd.cpp img_gen. Text to image; an init image makes it img2img, a mask inpaints, and references feed edit models (Kontext, Qwen Edit, FLUX.2).',
    group: 'generate',
    inputs: [
      MODEL_IN,
      PROMPT_IN,
      NEGATIVE_IN,
      { id: 'init', label: 'Init image', type: 'image', multiple: true, fanOut: true },
      { id: 'mask', label: 'Mask', type: 'image' },
      { id: 'refs', label: 'References', type: 'image', multiple: true },
      { id: 'guides', label: 'Guides', type: 'guide', multiple: true }
    ],
    outputs: [IMAGE_OUT],
    widgets: [
      promptWidget,
      negativeWidget,
      ...size(64),
      ...sampling,
      seedWidget,
      { key: 'count', label: 'Batch', kind: 'number', min: 1, max: 8, default: 1 },
      denoiseWidget('init'),
      { key: 'hires', label: 'Hi-res fix', kind: 'toggle', default: false },
      {
        key: 'hiresScale',
        label: 'Hi-res scale',
        kind: 'slider',
        min: 1,
        max: 4,
        step: 0.05,
        showIf: { widget: 'hires' },
        default: 1.5
      },
      {
        key: 'hiresDenoise',
        label: 'Hi-res denoise',
        kind: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
        showIf: { widget: 'hires' },
        default: 0.5
      },
      {
        key: 'hiresSteps',
        label: 'Hi-res steps',
        kind: 'number',
        min: 0,
        max: 150,
        placeholder: 'Same as steps',
        showIf: { widget: 'hires' },
        default: 0
      },
      {
        key: 'hiresUpscaler',
        label: 'Hi-res upscaler',
        kind: 'select',
        choices: HIRES_UPSCALERS,
        showIf: { widget: 'hires' },
        default: 'Latent'
      }
    ],
    gpu: true,
    modelKinds: ['image', 'edit']
  },
  video: {
    type: 'video',
    label: 'Generate video',
    description:
      'sd.cpp vid_gen. Text to video; a first frame makes it image to video, add a last frame for FLF2V.',
    group: 'generate',
    inputs: [
      MODEL_IN,
      PROMPT_IN,
      NEGATIVE_IN,
      { id: 'start', label: 'First frame', type: 'image', multiple: true, fanOut: true },
      { id: 'end', label: 'Last frame', type: 'image' },
      { id: 'refs', label: 'References', type: 'image', multiple: true }
    ],
    outputs: [{ id: 'video', label: 'Video', type: 'video' }],
    widgets: [
      promptWidget,
      negativeWidget,
      ...size(16),
      recommended('frames', 'Frames', 'videoFrames', { min: 1, max: 1025 }),
      recommended('fps', 'FPS', 'videoFps', { min: 1, max: 120 }),
      ...sampling,
      recommended('flowShift', 'Flow shift', 'flowShift', { min: 0, max: 20, step: 0.1 }),
      seedWidget,
      denoiseWidget('start')
    ],
    gpu: true,
    modelKinds: ['video']
  },
  upscale: {
    type: 'upscale',
    label: 'Upscale',
    description: 'sd.cpp upscale mode: an ESRGAN model enlarges each image.',
    group: 'finish',
    inputs: [EACH_IMAGE_IN],
    outputs: [IMAGE_OUT],
    widgets: [
      { key: 'model', label: 'Upscaler', kind: 'file', category: 'upscale', default: '' },
      { key: 'repeats', label: 'Passes', kind: 'number', min: 1, max: 4, default: 1 },
      {
        key: 'tileSize',
        label: 'Tile size',
        kind: 'number',
        min: 64,
        max: 1024,
        step: 32,
        default: 128
      }
    ],
    gpu: true
  },
  faceFix: {
    type: 'faceFix',
    label: 'Fix faces',
    description: 'sd.cpp adetailer mode: find faces and re-render them with the model.',
    group: 'finish',
    inputs: [MODEL_IN, PROMPT_IN, EACH_IMAGE_IN],
    outputs: [IMAGE_OUT],
    widgets: [
      { key: 'detector', label: 'Detector', kind: 'file', category: 'adetailer', default: '' },
      { ...promptWidget, placeholder: 'Empty uses the wired prompt' },
      slider('denoise', 'Denoise', 1, 0.4),
      {
        key: 'confidence',
        label: 'Confidence',
        kind: 'slider',
        min: 0.05,
        max: 1,
        step: 0.05,
        default: 0.3
      }
    ],
    gpu: true,
    modelKinds: ['image', 'edit']
  },
  removeBg: {
    type: 'removeBg',
    label: 'Remove background',
    description:
      'A Flaxeo tool, not sd.cpp: cuts the subject out of a plain background on the CPU.',
    group: 'finish',
    inputs: [EACH_IMAGE_IN],
    outputs: [IMAGE_OUT],
    widgets: [
      {
        key: 'tolerance',
        label: 'Tolerance',
        kind: 'slider',
        min: 5,
        max: 120,
        step: 1,
        default: 40
      }
    ],
    gpu: false
  },
  output: {
    type: 'output',
    label: 'Output',
    description: 'Marks results. Every file also lands in Assets.',
    group: 'output',
    inputs: [
      { id: 'image', label: 'Images', type: 'image', multiple: true },
      { id: 'video', label: 'Videos', type: 'video', multiple: true }
    ],
    outputs: [],
    widgets: [],
    gpu: false
  }
}

export const NODE_GROUPS: Array<{ id: NodeGroup; label: string }> = [
  { id: 'models', label: 'Models' },
  { id: 'guides', label: 'Guides' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'generate', label: 'Generate' },
  { id: 'finish', label: 'Finish' },
  { id: 'output', label: 'Output' }
]

/* ------------------------------- Data -------------------------------- */

export type WidgetValue = string | number | boolean | string[] | null

export interface GraphNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  /** Custom title (empty = node type label) */
  title: string
  bypassed: boolean
  values: Record<string, WidgetValue>
  /** Widgets turned into input sockets */
  linked: string[]
  /** Load model only: the full model setup */
  setup: ModelSetup | null
}

export interface GraphEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface WorkflowGraph {
  version: 3
  id: string
  name: string
  description: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  createdAt: number
  updatedAt: number
  updatedBy: string
  /** Built-in example (copy to edit) */
  template?: boolean
}

export const MAX_GRAPH_NODES = 60
export const MAX_GRAPH_RUNS = 64
export const MAX_INPUT_IMAGES = 16

export function createNode(
  type: NodeType,
  position = { x: 0, y: 0 },
  values: Record<string, WidgetValue> = {}
): GraphNode {
  const def = NODE_DEFS[type]
  const defaults: Record<string, WidgetValue> = {}
  for (const widget of def.widgets) defaults[widget.key] = widget.default as WidgetValue
  return {
    id: createLibraryId('n'),
    type,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    title: '',
    bypassed: false,
    values: { ...defaults, ...values },
    linked: [],
    setup: type === 'loadModel' ? createSetup() : null
  }
}

export function createGraph(name = 'Untitled workflow'): WorkflowGraph {
  const now = Date.now()
  return {
    version: 3,
    id: createLibraryId('wf'),
    name,
    description: '',
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
    updatedBy: ''
  }
}

export function nodeTitle(node: Pick<GraphNode, 'type' | 'title'>): string {
  return node.title || NODE_DEFS[node.type].label
}

/** Sockets of a node: its declared inputs plus widgets converted to inputs. */
export function nodeInputs(node: Pick<GraphNode, 'type' | 'linked'>): PortDef[] {
  const def = NODE_DEFS[node.type]
  const linked = def.widgets
    .filter((w) => w.input && node.linked.includes(w.key))
    .map((w) => ({ id: `w:${w.key}`, label: w.label, type: w.input as SocketType }))
  return [...def.inputs, ...linked]
}

export function findPort(
  node: Pick<GraphNode, 'type' | 'linked'>,
  handle: string,
  side: 'in' | 'out'
): PortDef | undefined {
  const ports = side === 'in' ? nodeInputs(node) : NODE_DEFS[node.type].outputs
  return ports.find((p) => p.id === handle)
}

/* ---------------------------- Sanitizing ----------------------------- */

function cleanValue(widget: WidgetDef, raw: unknown): WidgetValue {
  if (raw === null || raw === undefined) return (widget.default as WidgetValue) ?? null
  switch (widget.kind) {
    case 'number':
    case 'slider':
    case 'seed': {
      const n = Number(raw)
      if (!Number.isFinite(n)) return (widget.default as WidgetValue) ?? null
      const min = widget.kind === 'seed' ? -1 : (widget.min ?? -1e9)
      const max = widget.kind === 'seed' ? Number.MAX_SAFE_INTEGER : (widget.max ?? 1e9)
      return clampNumber(n, min, max, n)
    }
    case 'toggle':
      return raw === true
    case 'images':
      return (Array.isArray(raw) ? raw : [])
        .filter((f): f is string => typeof f === 'string' && isSafeName(f))
        .slice(0, MAX_INPUT_IMAGES)
    case 'textarea':
      return cleanText(raw, 4000)
    default:
      return cleanText(raw, 300)
  }
}

/** File names only (output folder / model folder entries): no traversal. */
function isSafeName(value: string): boolean {
  return !!value && value.length <= 260 && !value.includes('..') && !/^[\\/]|^[a-z]:/i.test(value)
}

function sanitizeNode(raw: unknown): GraphNode | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isLibraryId(r.id) || !NODE_TYPES.includes(r.type as NodeType)) return null
  const type = r.type as NodeType
  const def = NODE_DEFS[type]
  const rawValues = (r.values && typeof r.values === 'object' ? r.values : {}) as Record<
    string,
    unknown
  >
  const values: Record<string, WidgetValue> = {}
  for (const widget of def.widgets) values[widget.key] = cleanValue(widget, rawValues[widget.key])
  for (const widget of def.widgets) {
    if (widget.kind === 'file' && typeof values[widget.key] === 'string') {
      if (!isSafeName(values[widget.key] as string)) values[widget.key] = ''
    }
  }
  const position = (r.position || {}) as Record<string, unknown>
  const convertible = def.widgets.filter((w) => w.input).map((w) => w.key)
  return {
    id: r.id,
    type,
    position: {
      x: Math.round(clampNumber(position.x, -1e5, 1e5, 0)),
      y: Math.round(clampNumber(position.y, -1e5, 1e5, 0))
    },
    title: cleanText(r.title, 80).trim(),
    bypassed: r.bypassed === true,
    values,
    linked: (Array.isArray(r.linked) ? r.linked : []).filter(
      (k): k is string => typeof k === 'string' && convertible.includes(k)
    ),
    setup:
      type === 'loadModel' ? pickSetup(r.setup && typeof r.setup === 'object' ? r.setup : {}) : null
  }
}

/**
 * Graphs saved before the sd.cpp-shaped nodes: "Edit image" was img_gen with the source as
 * a reference image, and Generate's "Start image" is sd.cpp's init image.
 */
function migrateLegacy(rawNodes: unknown[], rawEdges: unknown[]): [unknown[], unknown[]] {
  const types = new Map<string, string>()
  const nodes = rawNodes.map((entry) => {
    const n = (entry || {}) as Record<string, unknown>
    types.set(String(n.id), String(n.type))
    return n.type === 'edit' ? { ...n, type: 'generate' } : n
  })
  const edges = rawEdges.map((entry) => {
    const e = (entry || {}) as Record<string, unknown>
    const type = types.get(String(e.target))
    if (type === 'edit' && e.targetHandle === 'image') return { ...e, targetHandle: 'refs' }
    if (type === 'generate' && e.targetHandle === 'start') return { ...e, targetHandle: 'init' }
    return e
  })
  return [nodes, edges]
}

export function sanitizeGraph(raw: unknown): WorkflowGraph | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.version !== 3 || !isLibraryId(r.id)) return null
  const [rawNodes, rawEdges] = migrateLegacy(
    Array.isArray(r.nodes) ? r.nodes : [],
    Array.isArray(r.edges) ? r.edges : []
  )
  const nodes = rawNodes
    .map(sanitizeNode)
    .filter((n): n is GraphNode => !!n)
    .slice(0, MAX_GRAPH_NODES)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges: GraphEdge[] = []
  for (const entry of rawEdges) {
    const e = (entry || {}) as Record<string, unknown>
    const source = byId.get(String(e.source))
    const target = byId.get(String(e.target))
    if (!source || !target || !isLibraryId(e.id)) continue
    const edge: GraphEdge = {
      id: e.id,
      source: source.id,
      sourceHandle: String(e.sourceHandle || ''),
      target: target.id,
      targetHandle: String(e.targetHandle || '')
    }
    if (checkConnection({ nodes, edges }, edge).ok) edges.push(edge)
  }
  const now = Date.now()
  return {
    version: 3,
    id: r.id,
    name: cleanText(r.name, 120).trim() || 'Untitled workflow',
    description: cleanText(r.description, 600),
    nodes,
    edges,
    createdAt: Number(r.createdAt) > 0 ? Math.floor(Number(r.createdAt)) : now,
    updatedAt: Number(r.updatedAt) > 0 ? Math.floor(Number(r.updatedAt)) : now,
    updatedBy: cleanText(r.updatedBy, 60),
    template: r.template === true || undefined
  }
}

/* ---------------------------- Connections ---------------------------- */

type GraphShape = Pick<WorkflowGraph, 'nodes' | 'edges'>

export function checkConnection(
  graph: GraphShape,
  edge: Pick<GraphEdge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>
): { ok: true } | { ok: false; reason: string } {
  if (edge.source === edge.target) return { ok: false, reason: 'A node cannot feed itself.' }
  const source = graph.nodes.find((n) => n.id === edge.source)
  const target = graph.nodes.find((n) => n.id === edge.target)
  if (!source || !target) return { ok: false, reason: 'Missing node.' }
  const out = findPort(source, edge.sourceHandle, 'out')
  const input = findPort(target, edge.targetHandle, 'in')
  if (!out || !input) return { ok: false, reason: 'Unknown socket.' }
  if (out.type !== input.type) {
    return {
      ok: false,
      reason: `${out.label} (${out.type}) cannot go into ${input.label} (${input.type}).`
    }
  }
  const exists = graph.edges.some(
    (e) =>
      e.source === edge.source &&
      e.sourceHandle === edge.sourceHandle &&
      e.target === edge.target &&
      e.targetHandle === edge.targetHandle
  )
  if (exists) return { ok: false, reason: 'Already connected.' }
  if (reaches(graph, target.id, source.id)) return { ok: false, reason: 'That would make a loop.' }
  return { ok: true }
}

/** Is `to` reachable from `from` following edges? */
function reaches(graph: GraphShape, from: string, to: string): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const id = stack.pop() as string
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of graph.edges) if (e.source === id) stack.push(e.target)
  }
  return false
}

/**
 * Add an edge. Single sockets replace their existing wire (like dropping a new cable);
 * `multiple` sockets accumulate.
 */
export function connect(
  graph: GraphShape,
  edge: Pick<GraphEdge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>
): GraphEdge[] {
  const target = graph.nodes.find((n) => n.id === edge.target)
  const input = target ? findPort(target, edge.targetHandle, 'in') : undefined
  const kept = input?.multiple
    ? graph.edges
    : graph.edges.filter((e) => !(e.target === edge.target && e.targetHandle === edge.targetHandle))
  return [...kept, { id: createLibraryId('e'), ...edge }]
}

/** Edges into a socket, top node first. */
export function incoming(graph: GraphShape, nodeId: string, handle: string): GraphEdge[] {
  const y = (id: string): number => graph.nodes.find((n) => n.id === id)?.position.y ?? 0
  return graph.edges
    .filter((e) => e.target === nodeId && e.targetHandle === handle)
    .sort((a, b) => y(a.source) - y(b.source))
}

export function isWired(graph: GraphShape, nodeId: string, handle: string): boolean {
  return graph.edges.some((e) => e.target === nodeId && e.targetHandle === handle)
}

/** Kahn's algorithm, ties broken left-to-right then top-to-bottom. Throws on cycles. */
export function topoOrder(graph: GraphShape): GraphNode[] {
  const indegree = new Map(graph.nodes.map((n) => [n.id, 0]))
  for (const e of graph.edges) indegree.set(e.target, (indegree.get(e.target) || 0) + 1)
  const position = (n: GraphNode): number => n.position.x * 10000 + n.position.y
  const ready = graph.nodes.filter((n) => indegree.get(n.id) === 0)
  const order: GraphNode[] = []
  while (ready.length) {
    ready.sort((a, b) => position(a) - position(b))
    const node = ready.shift() as GraphNode
    order.push(node)
    for (const e of graph.edges) {
      if (e.source !== node.id) continue
      const next = (indegree.get(e.target) || 0) - 1
      indegree.set(e.target, next)
      if (next === 0) {
        const target = graph.nodes.find((n) => n.id === e.target)
        if (target) ready.push(target)
      }
    }
  }
  if (order.length !== graph.nodes.length) throw new Error('The workflow has a loop.')
  return order
}

/** The Load model node feeding a node's MODEL socket (through any LoRA nodes). */
export function upstreamModel(graph: GraphShape, nodeId: string): GraphNode | null {
  let current = nodeId
  for (let hops = 0; hops < MAX_GRAPH_NODES; hops++) {
    const edge = incoming(graph, current, 'model')[0]
    const source = edge && graph.nodes.find((n) => n.id === edge.source)
    if (!source) return null
    if (source.type === 'loadModel') return source
    current = source.id
  }
  return null
}

/* ------------------------- Validation / estimates ------------------------ */

export interface GraphIssue {
  nodeId: string
  message: string
}

export function validateGraph(graph: GraphShape): GraphIssue[] {
  const issues: GraphIssue[] = []
  if (!graph.nodes.length) return [{ nodeId: '', message: 'Add some nodes first.' }]
  try {
    topoOrder(graph)
  } catch (e) {
    issues.push({ nodeId: '', message: e instanceof Error ? e.message : 'Invalid graph' })
  }
  for (const node of graph.nodes) {
    if (node.bypassed) continue
    const def = NODE_DEFS[node.type]
    for (const port of def.inputs) {
      if (port.required && !isWired(graph, node.id, port.id)) {
        issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: connect ${port.label}.` })
      }
    }
    if (node.type === 'loadModel' && node.setup) {
      const main =
        node.setup.loadMode === 'standard' ? node.setup.standardModel : node.setup.diffusionModel
      if (!main) issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: choose a model.` })
    }
    if (node.type === 'lora' && !node.values.lora) {
      issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: choose a LoRA file.` })
    }
    if (node.type === 'loadImages' && !(node.values.images as string[]).length) {
      issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: add at least one image.` })
    }
    if (node.type === 'upscale' && !node.values.model) {
      issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: choose an upscaler.` })
    }
    if (node.type === 'faceFix' && !node.values.detector) {
      issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: choose a face detector.` })
    }
    if (def.group === 'guides' && !node.values.model) {
      issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: choose its model file.` })
    }
    if (node.type === 'pulid' && !node.values.embedding) {
      issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: choose an identity embedding.` })
    }
    issues.push(...modelIssues(graph, node))
  }
  const outputs = graph.nodes.filter((n) => !n.bypassed && NODE_DEFS[n.type].gpu)
  if (!outputs.length && !graph.nodes.some((n) => n.type === 'removeBg')) {
    issues.push({
      nodeId: '',
      message: 'Add a node that makes something (Generate image, Generate video, Upscale…).'
    })
  }
  if (estimateGraph(graph).runs > MAX_GRAPH_RUNS) {
    issues.push({
      nodeId: '',
      message: `More than ${MAX_GRAPH_RUNS} model runs; reduce images or counts.`
    })
  }
  return issues
}

/** Checks between a node and the model and guides wired into it. */
function modelIssues(graph: GraphShape, node: GraphNode): GraphIssue[] {
  const def = NODE_DEFS[node.type]
  const issues: GraphIssue[] = []
  const say = (message: string): void => {
    issues.push({ nodeId: node.id, message: `${nodeTitle(node)}: ${message}` })
  }
  const setup = upstreamModel(graph, node.id)?.setup
  const kind = setup ? setupFamily(setup)?.kind : undefined
  if (kind && def.modelKinds && !def.modelKinds.includes(kind)) {
    say(kind === 'video' ? 'this is a video model; use Generate video.' : 'needs a video model.')
  }
  if (node.type !== 'generate') return issues
  if (isWired(graph, node.id, 'mask') && !isWired(graph, node.id, 'init')) {
    say('a mask needs an init image to paint into.')
  }
  const guides = incoming(graph, node.id, 'guides')
    .map((e) => graph.nodes.find((n) => n.id === e.source))
    .filter((n): n is GraphNode => !!n && !n.bypassed)
  for (const type of new Set(guides.map((g) => g.type))) {
    if (guides.filter((g) => g.type === type).length > 1)
      say(`sd.cpp takes one ${NODE_DEFS[type].label} at a time.`)
  }
  if (guides.some((g) => g.type === 'ipAdapter') && setup && !setup.clipVisionModel) {
    say('IP-Adapter needs a CLIP vision file on the model.')
  }
  return issues
}

/**
 * How many items each node produces and how many sd-cli runs the graph needs.
 * Used for the run button label and the run cap.
 */
export function estimateGraph(graph: GraphShape): { runs: number; items: Record<string, number> } {
  const items: Record<string, number> = {}
  let runs = 0
  let order: GraphNode[]
  try {
    order = topoOrder(graph)
  } catch {
    return { runs: 0, items }
  }
  const count = (nodeId: string, handle: string): number =>
    incoming(graph, nodeId, handle).reduce((sum, e) => sum + (items[e.source] ?? 0), 0)
  for (const node of order) {
    const def = NODE_DEFS[node.type]
    const fan = def.inputs.find((p) => p.fanOut)
    const fanItems = fan && isWired(graph, node.id, fan.id) ? count(node.id, fan.id) : 1
    if (node.bypassed) {
      items[node.id] = fan ? fanItems : 0
      continue
    }
    switch (node.type) {
      case 'loadImages':
        items[node.id] = Math.max(1, (node.values.images as string[]).length)
        break
      case 'generate': {
        const perRun = Math.max(1, Number(node.values.count) || 1)
        runs += fanItems
        items[node.id] = fanItems * perRun
        break
      }
      case 'video':
      case 'upscale':
      case 'faceFix':
        runs += fanItems
        items[node.id] = fanItems
        break
      case 'removeBg':
        items[node.id] = fanItems
        break
      default:
        items[node.id] = def.outputs.length ? 1 : 0
    }
  }
  return { runs, items }
}

/** Nodes whose results are the workflow's finals: Output nodes, else every unwired producer. */
export function finalNodes(graph: GraphShape): GraphNode[] {
  const outputs = graph.nodes.filter((n) => n.type === 'output')
  if (outputs.length) return outputs
  return graph.nodes.filter(
    (n) =>
      NODE_DEFS[n.type].outputs.some((p) => p.type === 'image' || p.type === 'video') &&
      !graph.edges.some((e) => e.source === n.id)
  )
}

/** Fill `{prompt}` (or use the wired text when the widget is empty). */
export function resolvePrompt(template: string, wired: string[]): string {
  const text = wired
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ')
  const own = template.trim()
  if (!own) return text
  if (own.includes('{prompt}')) return own.split('{prompt}').join(text).trim()
  return [own, text].filter(Boolean).join(', ')
}

/* ------------------------------- Runs -------------------------------- */

export type NodeRunStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface NodeRunState {
  status: NodeRunStatus
  /** Output socket → files */
  outputs: Record<string, string[]>
  done: number
  total: number
  error?: string
}

export interface GraphRunState {
  id: string
  workflowId: string
  name: string
  status: 'running' | 'done' | 'failed' | 'cancelled'
  startedAt: number
  finishedAt?: number
  nodes: Record<string, NodeRunState>
  /** Files from final nodes */
  finals: string[]
  error?: string
  owner?: string
}

/* ------------------------------ Examples ----------------------------- */

interface ExampleSpec {
  id: string
  name: string
  description: string
  nodes: Array<{
    key: string
    type: NodeType
    x: number
    y: number
    values?: Record<string, WidgetValue>
    setup?: Partial<ModelSetup>
  }>
  wires: Array<[string, string, string, string]>
}

function buildExample(spec: ExampleSpec): WorkflowGraph {
  const ids = new Map<string, string>()
  const nodes = spec.nodes.map((n) => {
    const node = createNode(n.type, { x: n.x, y: n.y }, n.values || {})
    node.id = `n-${spec.id}-${n.key.toLowerCase()}`
    if (n.setup && node.setup) node.setup = { ...node.setup, ...n.setup }
    ids.set(n.key, node.id)
    return node
  })
  const edges = spec.wires.map(([from, out, to, input], index) => ({
    id: `e-${spec.id}-${index}`,
    source: ids.get(from) as string,
    sourceHandle: out,
    target: ids.get(to) as string,
    targetHandle: input
  }))
  return {
    version: 3,
    id: `example-${spec.id}`,
    name: spec.name,
    description: spec.description,
    nodes,
    edges,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: '',
    template: true
  }
}

export const GRAPH_EXAMPLES: WorkflowGraph[] = [
  buildExample({
    id: 'text-to-image',
    name: 'Text to image',
    description: 'The basic chain: a model, a LoRA and a prompt into Generate.',
    nodes: [
      { key: 'model', type: 'loadModel', x: 0, y: 0 },
      { key: 'lora', type: 'lora', x: 300, y: 0 },
      {
        key: 'gen',
        type: 'generate',
        x: 600,
        y: 0,
        values: { prompt: 'a lighthouse on a cliff at dusk, volumetric light' }
      },
      { key: 'out', type: 'output', x: 900, y: 0 }
    ],
    wires: [
      ['model', 'model', 'lora', 'model'],
      ['lora', 'model', 'gen', 'model'],
      ['gen', 'image', 'out', 'image']
    ]
  }),
  buildExample({
    id: 'image-to-video',
    name: 'Image, then video',
    description: 'Generate a still with an image model, then animate it with a video model.',
    nodes: [
      {
        key: 'prompt',
        type: 'prompt',
        x: 0,
        y: 260,
        values: { text: 'a red fox in fresh snow, morning light' }
      },
      { key: 'imgModel', type: 'loadModel', x: 0, y: 0 },
      { key: 'gen', type: 'generate', x: 320, y: 0 },
      { key: 'vidModel', type: 'loadModel', x: 320, y: 420, setup: { videoMode: true } },
      {
        key: 'video',
        type: 'video',
        x: 660,
        y: 120,
        values: { prompt: '{prompt}, the fox turns its head, slow camera push' }
      },
      { key: 'out', type: 'output', x: 980, y: 120 }
    ],
    wires: [
      ['imgModel', 'model', 'gen', 'model'],
      ['prompt', 'text', 'gen', 'prompt'],
      ['prompt', 'text', 'video', 'prompt'],
      ['gen', 'image', 'video', 'start'],
      ['vidModel', 'model', 'video', 'model'],
      ['video', 'video', 'out', 'video']
    ]
  }),
  buildExample({
    id: 'combine-references',
    name: 'Combine references',
    description: 'Several images into an edit model (Kontext, Qwen Edit, FLUX.2) as references.',
    nodes: [
      { key: 'images', type: 'loadImages', x: 0, y: 160 },
      { key: 'model', type: 'loadModel', x: 0, y: 0 },
      {
        key: 'gen',
        type: 'generate',
        x: 320,
        y: 0,
        values: { prompt: 'the person from image 1 wearing the jacket from image 2' }
      },
      { key: 'out', type: 'output', x: 640, y: 0 }
    ],
    wires: [
      ['model', 'model', 'gen', 'model'],
      ['images', 'image', 'gen', 'refs'],
      ['gen', 'image', 'out', 'image']
    ]
  }),
  buildExample({
    id: 'controlnet-pose',
    name: 'Follow a pose',
    description: 'A ControlNet guide makes Generate follow the pose or edges of an image.',
    nodes: [
      { key: 'model', type: 'loadModel', x: 0, y: 0 },
      { key: 'pose', type: 'loadImages', x: 0, y: 220 },
      { key: 'control', type: 'controlNet', x: 300, y: 220 },
      {
        key: 'gen',
        type: 'generate',
        x: 620,
        y: 0,
        values: { prompt: 'a dancer in a red dress, studio light' }
      },
      { key: 'out', type: 'output', x: 940, y: 0 }
    ],
    wires: [
      ['model', 'model', 'gen', 'model'],
      ['pose', 'image', 'control', 'image'],
      ['control', 'guide', 'gen', 'guides'],
      ['gen', 'image', 'out', 'image']
    ]
  }),
  buildExample({
    id: 'draft-upscale',
    name: 'Draft, refine, upscale',
    description: 'A fast draft, a second model refines it at low strength, then ESRGAN.',
    nodes: [
      { key: 'fast', type: 'loadModel', x: 0, y: 0 },
      {
        key: 'draft',
        type: 'generate',
        x: 300,
        y: 0,
        values: { prompt: 'isometric cozy cabin, warm windows' }
      },
      { key: 'quality', type: 'loadModel', x: 300, y: 380 },
      {
        key: 'refine',
        type: 'generate',
        x: 620,
        y: 120,
        values: { prompt: 'isometric cozy cabin, warm windows, detailed', strength: 0.35 }
      },
      { key: 'up', type: 'upscale', x: 940, y: 120 },
      { key: 'out', type: 'output', x: 1220, y: 120 }
    ],
    wires: [
      ['fast', 'model', 'draft', 'model'],
      ['draft', 'image', 'refine', 'init'],
      ['quality', 'model', 'refine', 'model'],
      ['refine', 'image', 'up', 'image'],
      ['up', 'image', 'out', 'image']
    ]
  })
]

/** Copy an example (or any graph) under fresh ids. */
export function duplicateGraph(graph: WorkflowGraph, name = `${graph.name} copy`): WorkflowGraph {
  const ids = new Map<string, string>()
  const nodes = graph.nodes.map((n) => {
    const id = createLibraryId('n')
    ids.set(n.id, id)
    return JSON.parse(JSON.stringify({ ...n, id })) as GraphNode
  })
  const now = Date.now()
  return {
    ...createGraph(name),
    description: graph.description,
    nodes,
    edges: graph.edges.map((e) => ({
      ...e,
      id: createLibraryId('e'),
      source: ids.get(e.source) as string,
      target: ids.get(e.target) as string
    })),
    createdAt: now,
    updatedAt: now
  }
}
