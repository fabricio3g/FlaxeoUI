import { computed, ref } from 'vue'
import { useLibraryStore } from '@/stores/library'
import {
  MAX_GRAPH_NODES,
  NODE_DEFS,
  checkConnection,
  connect,
  createGraph,
  createNode,
  duplicateGraph,
  type GraphEdge,
  type GraphNode,
  type NodeType,
  type WidgetValue,
  type WorkflowGraph
} from '../../../shared/workflowGraph'
import { createLibraryId } from '../../../shared/library'
import type { ModelSetup } from '../../../shared/modelSetup'

const MAX_HISTORY = 80

/** The open workflow, shared by the canvas, its nodes and the side panels. */
const graph = ref<WorkflowGraph>(createGraph())
const savedId = ref('')
const dirty = ref(false)
const selectedIds = ref<string[]>([])
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let lastKey = ''
let clipboard: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null
/** Node type the sidebar asked to add; the canvas places it in view and clears this. */
const pendingAdd = ref<NodeType | null>(null)

function snapshot(): string {
  return JSON.stringify({ nodes: graph.value.nodes, edges: graph.value.edges })
}

/**
 * Record an undo step, then apply a change. Calls with the same `key` in a row (typing in
 * one widget, dragging one node) collapse into a single step.
 */
function commit(change: (g: WorkflowGraph) => void, key = ''): void {
  if (!key || key !== lastKey) {
    undoStack.value = [...undoStack.value.slice(-MAX_HISTORY + 1), snapshot()]
    redoStack.value = []
  }
  lastKey = key
  change(graph.value)
  graph.value.updatedAt = Date.now()
  dirty.value = true
}

function restore(state: string): void {
  const parsed = JSON.parse(state) as Pick<WorkflowGraph, 'nodes' | 'edges'>
  graph.value.nodes = parsed.nodes
  graph.value.edges = parsed.edges
  dirty.value = true
  lastKey = ''
}

function node(id: string): GraphNode | undefined {
  return graph.value.nodes.find((n) => n.id === id)
}

export function useWorkflowEditor() {
  const library = useLibraryStore()

  const selected = computed(() =>
    selectedIds.value.length === 1 ? node(selectedIds.value[0]) || null : null
  )
  const isSaved = computed(() => savedId.value === graph.value.id)

  /** Open a saved workflow as is, or an example as a fresh unsaved copy. */
  function open(source: WorkflowGraph): void {
    graph.value = source.template
      ? duplicateGraph(source, source.name)
      : (JSON.parse(JSON.stringify(source)) as WorkflowGraph)
    savedId.value = source.template ? '' : source.id
    dirty.value = false
    selectedIds.value = []
    undoStack.value = []
    redoStack.value = []
    lastKey = ''
  }

  function startNew(): void {
    open({ ...createGraph(), template: true })
    graph.value.name = 'Untitled workflow'
  }

  async function save(): Promise<void> {
    const saved = await library.saveWorkflow(graph.value)
    graph.value.updatedAt = saved.updatedAt
    savedId.value = saved.id
    dirty.value = false
  }

  async function saveAs(name: string): Promise<void> {
    graph.value = { ...duplicateGraph(graph.value, name), name }
    await save()
  }

  function undo(): void {
    const previous = undoStack.value.at(-1)
    if (!previous) return
    redoStack.value = [...redoStack.value, snapshot()]
    undoStack.value = undoStack.value.slice(0, -1)
    restore(previous)
  }

  function redo(): void {
    const next = redoStack.value.at(-1)
    if (!next) return
    undoStack.value = [...undoStack.value, snapshot()]
    redoStack.value = redoStack.value.slice(0, -1)
    restore(next)
  }

  function rename(name: string): void {
    commit((g) => (g.name = name.slice(0, 120)), 'name')
  }

  function addNode(
    type: NodeType,
    position: { x: number; y: number },
    wireFrom?: { nodeId: string; handle: string; side: 'out' | 'in' }
  ): GraphNode | null {
    if (graph.value.nodes.length >= MAX_GRAPH_NODES) return null
    const created = createNode(type, position)
    commit((g) => {
      g.nodes.push(created)
      if (!wireFrom) return
      const from = g.nodes.find((n) => n.id === wireFrom.nodeId)
      if (!from) return
      // Wire the first compatible socket on the new node.
      const def = NODE_DEFS[type]
      if (wireFrom.side === 'out') {
        const out = NODE_DEFS[from.type].outputs.find((p) => p.id === wireFrom.handle)
        const input = def.inputs.find((p) => p.type === out?.type)
        if (out && input) {
          const edge = {
            source: from.id,
            sourceHandle: out.id,
            target: created.id,
            targetHandle: input.id
          }
          if (checkConnection(g, edge).ok) g.edges = connect(g, edge)
        }
      } else {
        const output = def.outputs[0]
        const edge = output && {
          source: created.id,
          sourceHandle: output.id,
          target: from.id,
          targetHandle: wireFrom.handle
        }
        if (edge && checkConnection(g, edge).ok) g.edges = connect(g, edge)
      }
    })
    selectedIds.value = [created.id]
    return created
  }

  function connectSockets(
    edge: Pick<GraphEdge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>
  ): string {
    const check = checkConnection(graph.value, edge)
    if (!check.ok) return check.reason
    commit((g) => (g.edges = connect(g, edge)))
    return ''
  }

  function removeEdges(ids: string[]): void {
    if (!ids.length) return
    commit((g) => (g.edges = g.edges.filter((e) => !ids.includes(e.id))))
  }

  function removeNodes(ids: string[]): void {
    if (!ids.length) return
    commit((g) => {
      g.nodes = g.nodes.filter((n) => !ids.includes(n.id))
      g.edges = g.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target))
    })
    selectedIds.value = selectedIds.value.filter((id) => !ids.includes(id))
  }

  function moveNode(id: string, position: { x: number; y: number }): void {
    const target = node(id)
    if (
      !target ||
      (target.position.x === Math.round(position.x) && target.position.y === Math.round(position.y))
    )
      return
    commit(() => {
      target.position = { x: Math.round(position.x), y: Math.round(position.y) }
    }, `move:${id}`)
  }

  function setValue(id: string, key: string, value: WidgetValue): void {
    const target = node(id)
    if (target) commit(() => (target.values[key] = value), `value:${id}:${key}`)
  }

  function updateSetup(id: string, patch: Partial<ModelSetup>): void {
    const target = node(id)
    if (target?.setup) commit(() => Object.assign(target.setup as ModelSetup, patch), `setup:${id}`)
  }

  function setTitle(id: string, title: string): void {
    const target = node(id)
    if (target) commit(() => (target.title = title.slice(0, 80)), `title:${id}`)
  }

  function toggleBypass(ids: string[]): void {
    const targets = ids.map(node).filter((n): n is GraphNode => !!n)
    if (!targets.length) return
    const next = !targets.every((n) => n.bypassed)
    commit(() => targets.forEach((n) => (n.bypassed = next)))
  }

  /** Turn a widget into an input socket, or back (dropping its wire). */
  function toggleLinked(id: string, key: string): void {
    const target = node(id)
    if (!target) return
    commit((g) => {
      if (target.linked.includes(key)) {
        target.linked = target.linked.filter((k) => k !== key)
        g.edges = g.edges.filter((e) => !(e.target === id && e.targetHandle === `w:${key}`))
      } else {
        target.linked = [...target.linked, key]
      }
    })
  }

  function copy(ids = selectedIds.value): number {
    const nodes = graph.value.nodes.filter((n) => ids.includes(n.id))
    if (!nodes.length) return 0
    clipboard = JSON.parse(
      JSON.stringify({
        nodes,
        edges: graph.value.edges.filter((e) => ids.includes(e.source) && ids.includes(e.target))
      })
    )
    return nodes.length
  }

  /** Paste copies with their internal wires, offset so they do not cover the originals. */
  function paste(offset = 40): void {
    if (!clipboard) return
    const data = clipboard
    if (graph.value.nodes.length + data.nodes.length > MAX_GRAPH_NODES) return
    const ids = new Map<string, string>()
    const nodes = data.nodes.map((n) => {
      const id = createLibraryId('n')
      ids.set(n.id, id)
      return {
        ...JSON.parse(JSON.stringify(n)),
        id,
        position: { x: n.position.x + offset, y: n.position.y + offset }
      } as GraphNode
    })
    const edges = data.edges.map((e) => ({
      ...e,
      id: createLibraryId('e'),
      source: ids.get(e.source) as string,
      target: ids.get(e.target) as string
    }))
    commit((g) => {
      g.nodes.push(...nodes)
      g.edges.push(...edges)
    })
    selectedIds.value = nodes.map((n) => n.id)
  }

  function duplicate(ids = selectedIds.value): void {
    const previous = clipboard
    if (copy(ids)) paste()
    clipboard = previous
  }

  return {
    graph,
    dirty,
    savedId,
    isSaved,
    pendingAdd,
    selectedIds,
    selected,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    open,
    startNew,
    save,
    saveAs,
    undo,
    redo,
    rename,
    addNode,
    connectSockets,
    removeEdges,
    removeNodes,
    moveNode,
    setValue,
    updateSetup,
    setTitle,
    toggleBypass,
    toggleLinked,
    copy,
    paste,
    duplicate
  }
}
