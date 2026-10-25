<script setup lang="ts">
/**
 * Workflows: a node graph editor in the ComfyUI tradition. Load model → LoRA → Generate,
 * widgets on the nodes, typed wires, double-click to add, Run with a batch count.
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  VueFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeDragEvent,
  type NodeMouseEvent,
  type VueFlowStore
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {
  AlertTriangle,
  Maximize2,
  Minus,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Undo2
} from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import GraphNode from '@/components/workflow/GraphNode.vue'
import NodeParams from '@/components/workflow/NodeParams.vue'
import NodeSearch from '@/components/workflow/NodeSearch.vue'
import OutputViewer from '@/components/workflow/OutputViewer.vue'
import { SOCKET_COLORS } from '@/lib/graphUi'
import { useWorkflowEditor } from '@/composables/useWorkflowEditor'
import { useGraphRunner } from '@/composables/useGraphRunner'
import { useViewer } from '@/composables/useViewer'
import { useLibraryStore } from '@/stores/library'
import { useToast } from '@/composables/useToast'
import { requestConfirm } from '@/composables/useConfirm'
import { useRemoteSession } from '@/composables/useRemoteSession'
import {
  GRAPH_EXAMPLES,
  NODE_DEFS,
  estimateGraph,
  findPort,
  nodeTitle,
  validateGraph,
  type NodeType,
  type SocketType
} from '../../../shared/workflowGraph'

type WireStart = { nodeId: string; handle: string; side: 'out' | 'in' }

const editor = useWorkflowEditor()
const runner = useGraphRunner()
const viewer = useViewer()
const library = useLibraryStore()
const toast = useToast()
const { canControl } = useRemoteSession()

const batch = ref(1)
const canvas = ref<HTMLElement | null>(null)
const search = ref<{
  x: number
  y: number
  flow: { x: number; y: number }
  socket: (WireStart & { type: SocketType }) | null
} | null>(null)
const menu = ref<{ x: number; y: number; nodeId: string } | null>(null)
let flow: VueFlowStore | null = null
let pendingWire: WireStart | null = null
let wireConnected = false
let active = false
/** Header controls live in the shell's top bar only while this page is shown. */
const pageActive = ref(true)

const graph = computed(() => editor.graph.value)
const issues = computed(() => validateGraph(graph.value))
const issueByNode = computed(() =>
  Object.fromEntries(issues.value.filter((i) => i.nodeId).map((i) => [i.nodeId, i.message]))
)
const estimate = computed(() => estimateGraph(graph.value))
const showRun = computed(() => runner.run.value?.workflowId === graph.value.id)

const flowNodes = computed(() =>
  graph.value.nodes.map((node) => ({
    id: node.id,
    type: 'graph',
    position: { ...node.position },
    selected: editor.selectedIds.value.includes(node.id),
    data: {
      node,
      run: showRun.value ? runner.nodeRuns.value[node.id] : undefined,
      issue: issueByNode.value[node.id]
    }
  }))
)

const flowEdges = computed(() =>
  graph.value.edges.map((edge) => {
    const source = graph.value.nodes.find((n) => n.id === edge.source)
    const port = source ? findPort(source, edge.sourceHandle, 'out') : undefined
    const target = showRun.value ? runner.nodeRuns.value[edge.target] : undefined
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: target?.status === 'running',
      style: { stroke: port ? SOCKET_COLORS[port.type] : 'var(--muted-foreground)', strokeWidth: 2 }
    }
  })
)

/* --------------------------- Canvas events --------------------------- */

function isValidConnection(c: Connection): boolean {
  const existing = graph.value.edges.some(
    (e) =>
      e.source === c.source &&
      e.target === c.target &&
      e.sourceHandle === c.sourceHandle &&
      e.targetHandle === c.targetHandle
  )
  if (existing) return true // Vue Flow re-checks wires it already shows
  const source = graph.value.nodes.find((n) => n.id === c.source)
  const target = graph.value.nodes.find((n) => n.id === c.target)
  const out = source && findPort(source, c.sourceHandle || '', 'out')
  const input = target && findPort(target, c.targetHandle || '', 'in')
  return !!out && !!input && out.type === input.type && c.source !== c.target
}

function onConnect(c: Connection): void {
  wireConnected = true
  const reason = editor.connectSockets({
    source: c.source,
    sourceHandle: c.sourceHandle || '',
    target: c.target,
    targetHandle: c.targetHandle || ''
  })
  if (reason) toast.warning(reason)
}

function onConnectStart(params: {
  nodeId?: string
  handleId: string | null
  handleType?: string
}): void {
  wireConnected = false
  pendingWire =
    params.nodeId && params.handleId
      ? {
          nodeId: params.nodeId,
          handle: params.handleId,
          side: params.handleType === 'source' ? 'out' : 'in'
        }
      : null
}

/** A wire dropped on empty canvas opens the node search for that socket type. */
function onConnectEnd(event?: MouseEvent | TouchEvent): void {
  const wire = pendingWire
  pendingWire = null
  if (wireConnected || !wire || !event || !('clientX' in event)) return
  if (!(event.target as HTMLElement | null)?.closest('.vue-flow__pane')) return
  const node = graph.value.nodes.find((n) => n.id === wire.nodeId)
  const port = node && findPort(node, wire.handle, wire.side)
  if (port) openSearch(event.clientX, event.clientY, { ...wire, type: port.type })
}

function onNodesChange(changes: NodeChange[]): void {
  const removed = changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id)
  if (removed.length) editor.removeNodes(removed)
  const selections = changes.filter((c) => c.type === 'select') as Array<{
    id: string
    selected: boolean
  }>
  if (!selections.length) return
  const next = new Set(editor.selectedIds.value)
  for (const s of selections) {
    if (s.selected) next.add(s.id)
    else next.delete(s.id)
  }
  editor.selectedIds.value = [...next]
}

function onEdgesChange(changes: EdgeChange[]): void {
  editor.removeEdges(
    changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id)
  )
}

function onNodeDragStop(event: NodeDragEvent): void {
  for (const n of event.nodes) editor.moveNode(n.id, n.position)
}

function toFlow(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.value?.getBoundingClientRect()
  if (!flow || !rect) return { x: 0, y: 0 }
  return flow.project({ x: clientX - rect.left, y: clientY - rect.top })
}

function openSearch(
  x: number,
  y: number,
  socket: (WireStart & { type: SocketType }) | null = null
): void {
  if (!canControl.value) return
  menu.value = null
  search.value = { x, y, flow: toFlow(x, y), socket }
}

function onCanvasDblClick(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('.vue-flow__pane'))
    openSearch(event.clientX, event.clientY)
}

function addFromSearch(type: NodeType): void {
  const s = search.value
  search.value = null
  if (!s) return
  const wire = s.socket
    ? { nodeId: s.socket.nodeId, handle: s.socket.handle, side: s.socket.side }
    : undefined
  if (!editor.addNode(type, { x: s.flow.x - 20, y: s.flow.y - 16 }, wire)) {
    toast.warning('This workflow has the maximum number of nodes.')
  }
}

/** Sidebar click (via the editor): drop the node in the middle of the view. */
function addAtCenter(type: NodeType): void {
  const rect = canvas.value?.getBoundingClientRect()
  if (!rect) return
  const at = toFlow(rect.left + rect.width / 2, rect.top + rect.height / 2)
  editor.addNode(type, { x: at.x - 130, y: at.y - 60 })
}

watch(
  () => editor.pendingAdd.value,
  (type) => {
    if (!type) return
    editor.pendingAdd.value = null
    addAtCenter(type)
  }
)

function onDrop(event: DragEvent): void {
  const type = event.dataTransfer?.getData('application/x-flaxeo-node') as NodeType
  if (!type || !NODE_DEFS[type]) return
  const at = toFlow(event.clientX, event.clientY)
  editor.addNode(type, { x: at.x - 130, y: at.y - 16 })
}

function onNodeContextMenu({ event, node }: NodeMouseEvent): void {
  event.preventDefault()
  if (!canControl.value || !('clientX' in event)) return
  if (!editor.selectedIds.value.includes(node.id)) editor.selectedIds.value = [node.id]
  menu.value = { x: event.clientX, y: event.clientY, nodeId: node.id }
}

const menuNode = computed(() => graph.value.nodes.find((n) => n.id === menu.value?.nodeId) || null)

function menuAction(action: 'bypass' | 'duplicate' | 'delete'): void {
  const ids = editor.selectedIds.value
  menu.value = null
  if (action === 'bypass') editor.toggleBypass(ids)
  else if (action === 'duplicate') editor.duplicate(ids)
  else editor.removeNodes(ids)
}

/* ------------------------------ Fit view ----------------------------- */

let nodesReady = false
let needsFit = true

function tryFit(): void {
  if (!flow || !nodesReady || !needsFit) return
  needsFit = false
  void flow.fitView({ padding: 0.2, maxZoom: 1 })
}

function zoom(direction: 1 | -1): void {
  if (direction > 0) void flow?.zoomIn()
  else void flow?.zoomOut()
}

function fitAll(): void {
  void flow?.fitView({ padding: 0.2, maxZoom: 1 })
}

function onInit(instance: VueFlowStore): void {
  flow = instance
  tryFit()
}

function onNodesInitialized(): void {
  nodesReady = true
  tryFit()
}

watch(
  () => graph.value.id,
  () => {
    needsFit = true
    nodesReady = false
  }
)

/* ------------------------------ Library ------------------------------ */

async function save(): Promise<void> {
  if (!canControl.value) return
  try {
    await editor.save()
    toast.success('Workflow saved')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save')
  }
}

async function remove(): Promise<void> {
  if (!editor.isSaved.value) return
  const ok = await requestConfirm({
    title: `Delete "${graph.value.name}"?`,
    message: 'Images it made stay in Assets.',
    confirmLabel: 'Delete'
  })
  if (!ok) return
  await library.deleteItem('workflows', graph.value.id)
  editor.startNew()
}

function run(): void {
  const first = issues.value[0]
  if (first) {
    toast.error(first.message)
    return
  }
  runner.start(graph.value, batch.value)
}

/* ------------------------------ Keyboard ----------------------------- */

function onKeydown(event: KeyboardEvent): void {
  if (!active) return
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (mod && key === 'enter') {
    event.preventDefault()
    run()
    return
  }
  if (mod && key === 's') {
    event.preventDefault()
    void save()
    return
  }
  const typing = (event.target as HTMLElement | null)?.closest(
    'input, textarea, select, [contenteditable]'
  )
  if (typing || !canControl.value) return
  if (mod && key === 'z' && !event.shiftKey) editor.undo()
  else if ((mod && key === 'y') || (mod && key === 'z' && event.shiftKey)) editor.redo()
  else if (mod && key === 'c') editor.copy()
  else if (mod && key === 'v') editor.paste()
  else if (mod && (key === 'd' || key === 'b')) {
    event.preventDefault()
    if (key === 'd') editor.duplicate()
    else editor.toggleBypass(editor.selectedIds.value)
  } else if (key === 'escape') {
    search.value = null
    menu.value = null
  }
}

onMounted(() => {
  void library.ensureLoaded()
  if (!editor.graph.value.nodes.length && !editor.dirty.value) editor.open(GRAPH_EXAMPLES[0])
  window.addEventListener('keydown', onKeydown)
  active = true
})
onActivated(() => {
  active = true
  pageActive.value = true
})
onDeactivated(() => {
  active = false
  pageActive.value = false
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="relative flex h-full min-h-0">
    <section class="relative flex min-w-0 flex-1 flex-col">
      <Teleport v-if="pageActive" to="#page-header" defer>
        <input
          class="h-8 w-56 min-w-0 rounded-md bg-transparent px-2 text-[13px] font-medium hover:bg-accent focus:bg-background titlebar-no-drag"
          :value="graph.name"
          aria-label="Workflow name"
          :readonly="!canControl"
          @change="editor.rename(($event.target as HTMLInputElement).value)"
        />
        <span v-if="editor.dirty.value" class="text-xs text-muted-foreground">Unsaved</span>
        <div class="ml-auto flex items-center gap-0.5 titlebar-no-drag">
          <button
            v-tip="{ text: 'Undo', keys: 'Mod+Z' }"
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Undo"
            :disabled="!editor.canUndo.value"
            @click="editor.undo()"
          >
            <Undo2 class="size-4" />
          </button>
          <button
            v-tip="{ text: 'Redo', keys: 'Mod+Y' }"
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Redo"
            :disabled="!editor.canRedo.value"
            @click="editor.redo()"
          >
            <Redo2 class="size-4" />
          </button>
          <button
            v-if="editor.isSaved.value && canControl"
            type="button"
            class="h-8 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-destructive"
            @click="remove"
          >
            Delete
          </button>
          <button
            v-if="canControl"
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] hover:bg-accent"
            v-tip="{ text: 'Save', keys: 'Mod+S' }"
            @click="save"
          >
            <Save class="size-3.5" /> Save
          </button>
        </div>
      </Teleport>

      <div
        ref="canvas"
        class="relative min-h-0 flex-1"
        @dblclick="onCanvasDblClick"
        @dragover.prevent
        @drop.prevent="onDrop"
        @pointerdown="menu = null"
      >
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :is-valid-connection="isValidConnection"
          :zoom-on-double-click="false"
          :delete-key-code="canControl ? ['Delete', 'Backspace'] : null"
          :nodes-draggable="canControl"
          :nodes-connectable="canControl"
          :min-zoom="0.2"
          :max-zoom="2"
          class="flaxeo-flow"
          @init="onInit"
          @nodes-initialized="onNodesInitialized"
          @connect="onConnect"
          @connect-start="onConnectStart"
          @connect-end="onConnectEnd"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @node-drag-stop="onNodeDragStop"
          @node-context-menu="onNodeContextMenu"
          @pane-click="editor.selectedIds.value = []"
        >
          <template #node-graph="p">
            <GraphNode :id="p.id" :selected="p.selected" :data="p.data" />
          </template>
          <Background :gap="22" :size="1.2" pattern-color="var(--border)" />
          <MiniMap
            pannable
            zoomable
            node-color="var(--muted-foreground)"
            mask-color="color-mix(in oklch, var(--background) 70%, transparent)"
            class="hidden overflow-hidden rounded-xl border border-border shadow-[var(--float-shadow)] xl:block"
          />
        </VueFlow>

        <div
          class="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-popover p-1 shadow-[var(--float-shadow)]"
        >
          <button
            type="button"
            v-tip="{ text: 'Run the workflow', keys: 'Mod+Enter' }"
            class="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-medium text-brand-foreground hover:opacity-90"
            @click="run"
          >
            <Play class="size-3.5" />
            {{ runner.running.value ? 'Queue' : 'Run' }}
          </button>
          <label class="flex h-8 items-center gap-1 px-1.5 text-[13px] text-muted-foreground">
            ×
            <input
              v-model.number="batch"
              type="number"
              min="1"
              max="32"
              class="w-9 bg-transparent tabular-nums text-foreground outline-none"
              aria-label="How many runs"
              v-tip="'How many times to run'"
            />
          </label>
          <button
            v-if="runner.running.value"
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] hover:bg-accent"
            @click="runner.cancel()"
          >
            <Square class="size-3" /> Stop
          </button>
          <span class="px-2 text-xs tabular-nums text-muted-foreground">
            <template v-if="runner.running.value">Running</template>
            <template v-else
              >{{ estimate.runs }} model run{{ estimate.runs === 1 ? '' : 's' }}</template
            >
            <template v-if="runner.queued.value"> · {{ runner.queued.value }} queued</template>
          </span>
          <Popover v-if="issues.length">
            <PopoverTrigger as-child>
              <button
                type="button"
                class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-warning hover:bg-accent"
                :aria-label="`${issues.length} things to fix`"
              >
                <AlertTriangle class="size-3.5" /> {{ issues.length }}
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" class="w-72 p-3 text-[13px]">
              <ul class="space-y-1.5">
                <li v-for="(issue, index) in issues" :key="index">{{ issue.message }}</li>
              </ul>
            </PopoverContent>
          </Popover>
        </div>

        <p
          v-if="runner.lastError.value && !runner.running.value && showRun"
          class="absolute left-1/2 top-16 z-10 max-w-lg -translate-x-1/2 rounded-md bg-popover px-3 py-2 text-[13px] text-destructive shadow-[var(--float-shadow)]"
        >
          {{ runner.lastError.value }}
        </p>

        <div
          class="absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-[var(--float-shadow)]"
        >
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center hover:bg-accent"
            aria-label="Zoom in"
            v-tip="'Zoom in'"
            @click="zoom(1)"
          >
            <Plus class="size-4" />
          </button>
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center hover:bg-accent"
            aria-label="Zoom out"
            v-tip="'Zoom out'"
            @click="zoom(-1)"
          >
            <Minus class="size-4" />
          </button>
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center hover:bg-accent"
            aria-label="Fit to view"
            v-tip="'Fit to view'"
            @click="fitAll"
          >
            <Maximize2 class="size-4" />
          </button>
        </div>

        <p
          v-if="!graph.nodes.length"
          class="pointer-events-none absolute inset-0 flex items-center justify-center text-[14px] text-muted-foreground"
        >
          Double-click to add a node, or drag one in from Nodes.
        </p>
      </div>

      <NodeSearch
        v-if="search"
        :x="search.x"
        :y="search.y"
        :socket="search.socket"
        @pick="addFromSearch"
        @close="search = null"
      />

      <div
        v-if="menu && menuNode"
        class="fixed z-50 w-48 rounded-xl border border-border bg-popover p-1 text-[13px] shadow-[var(--float-shadow)]"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        role="menu"
        @pointerdown.stop
      >
        <p class="truncate px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">
          {{
            editor.selectedIds.value.length > 1
              ? `${editor.selectedIds.value.length} nodes`
              : nodeTitle(menuNode)
          }}
        </p>
        <button
          type="button"
          role="menuitem"
          class="flex w-full justify-between rounded-md px-2.5 py-1.5 hover:bg-accent"
          @click="menuAction('bypass')"
        >
          {{ menuNode.bypassed ? 'Stop bypassing' : 'Bypass' }}
          <kbd class="text-xs text-muted-foreground">Ctrl B</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          class="flex w-full justify-between rounded-md px-2.5 py-1.5 hover:bg-accent"
          @click="menuAction('duplicate')"
        >
          Duplicate <kbd class="text-xs text-muted-foreground">Ctrl D</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          class="flex w-full justify-between rounded-md px-2.5 py-1.5 text-destructive hover:bg-accent"
          @click="menuAction('delete')"
        >
          Delete <kbd class="text-xs text-muted-foreground">Del</kbd>
        </button>
      </div>
    </section>

    <aside
      v-if="editor.selected.value"
      class="absolute bottom-2 right-2 top-2 z-30 flex w-[22rem] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-[var(--float-shadow)]"
    >
      <NodeParams :node="editor.selected.value" @close="editor.selectedIds.value = []" />
    </aside>

    <OutputViewer
      :files="viewer.files.value"
      :index="viewer.index.value"
      @update:index="viewer.index.value = $event"
    />
  </div>
</template>

<style>
.flaxeo-flow .vue-flow__edge-path {
  stroke-linecap: round;
}
.flaxeo-flow .vue-flow__node.selected,
.flaxeo-flow .vue-flow__node:focus,
.flaxeo-flow .vue-flow__node:focus-visible {
  outline: none;
  box-shadow: none;
}
.flaxeo-flow .vue-flow__connection-path {
  stroke: var(--brand);
  stroke-width: 2;
}
.flaxeo-flow .vue-flow__handle {
  min-width: 0;
  min-height: 0;
}
.flaxeo-flow .vue-flow__minimap {
  background: var(--card);
}
</style>
