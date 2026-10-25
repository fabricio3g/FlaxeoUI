<script setup lang="ts">
/**
 * A node on the canvas: header, sockets, widgets and last results on one surface.
 * Everything is drawn from the node type's declaration, so new node types need no markup.
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { AlertTriangle, Check, Loader2 } from '@/lib/icons'
import NodeWidget from './NodeWidget.vue'
import { NODE_ICONS, SOCKET_COLORS, isVideoFile } from '@/lib/graphUi'
import { useWorkflowEditor } from '@/composables/useWorkflowEditor'
import { useModels } from '@/composables/useModels'
import { useViewer } from '@/composables/useViewer'
import { getOutputUrl } from '@/services/api'
import {
  NODE_DEFS,
  isWired,
  nodeInputs,
  nodeTitle,
  upstreamModel,
  type GraphNode,
  type NodeRunState,
  type PortDef,
  type WidgetDef
} from '../../../../shared/workflowGraph'
import { setupFamily, setupStatus } from '../../../../shared/modelFamilies'
import { mainModel, modelLabel, type InstalledModels } from '../../../../shared/modelSetup'

const props = defineProps<{
  id: string
  selected?: boolean
  data: { node: GraphNode; run?: NodeRunState; issue?: string }
}>()

const editor = useWorkflowEditor()
const viewer = useViewer()
const { models } = useModels()

const node = computed(() => props.data.node)
const def = computed(() => NODE_DEFS[node.value.type])
const run = computed(() => props.data.run)

const rows = computed(() => {
  const inputs = nodeInputs(node.value)
  const outputs = def.value.outputs
  return Array.from({ length: Math.max(inputs.length, outputs.length) }, (_, i) => ({
    input: inputs[i] as PortDef | undefined,
    output: outputs[i] as PortDef | undefined
  }))
})

const model = computed(() => upstreamModel(editor.graph.value, node.value.id)?.setup || null)

const widgets = computed(() =>
  def.value.widgets.filter((w) => {
    if (node.value.linked.includes(w.key)) return false
    if (w.showIf?.wired && !isWired(editor.graph.value, node.value.id, w.showIf.wired)) return false
    if (w.showIf?.widget && !node.value.values[w.showIf.widget]) return false
    return true
  })
)

const inherited = (w: WidgetDef): unknown =>
  w.setupKey && model.value ? model.value[w.setupKey] : undefined

/** Load model: what is chosen and whether its files are all there. */
const modelSummary = computed(() => {
  const setup = node.value.setup
  if (!setup) return null
  const file = mainModel(setup)
  const family = setupFamily(setup)
  const status = setupStatus(setup, models.value as unknown as InstalledModels)
  return {
    name: file ? modelLabel(file) : '',
    family: family?.name || '',
    missing: file
      ? status.missing.map((m) => m.label).concat(status.stale.map((s) => modelLabel(s.file)))
      : []
  }
})

const results = computed(() =>
  Object.values(run.value?.outputs || {})
    .flat()
    .filter((f) => !/[\\/]/.test(f))
)

const handleStyle = (port: PortDef) => ({
  background: SOCKET_COLORS[port.type],
  borderColor: 'var(--card)'
})

function openParams(): void {
  editor.selectedIds.value = [node.value.id]
}
</script>

<template>
  <div
    class="w-[264px] rounded-lg border bg-card text-card-foreground shadow-[var(--surface-shadow)] transition-colors"
    :class="[
      selected ? 'border-brand' : 'border-border',
      node.bypassed && 'border-dashed opacity-60',
      run?.status === 'running' && 'border-brand'
    ]"
  >
    <header class="flex h-8 items-center gap-1.5 px-2.5">
      <component :is="NODE_ICONS[node.type]" class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-[12px] font-medium">{{ nodeTitle(node) }}</span>
      <span v-if="node.bypassed" class="text-[11px] text-muted-foreground">Bypassed</span>
      <span
        v-else-if="run?.status === 'running'"
        class="flex items-center gap-1 text-[11px] tabular-nums text-brand"
      >
        <Loader2 class="size-3 animate-spin" />
        <template v-if="run.total > 1">{{ run.done }}/{{ run.total }}</template>
      </span>
      <Check v-else-if="run?.status === 'done'" class="size-3.5 text-success" aria-label="Done" />
      <AlertTriangle
        v-else-if="run?.status === 'failed' || data.issue"
        class="size-3.5 text-destructive"
        :aria-label="run?.error || data.issue"
      />
    </header>

    <div v-if="rows.length" class="border-t border-border py-1">
      <div
        v-for="(row, index) in rows"
        :key="index"
        class="relative flex h-6 items-center justify-between gap-2 px-3 text-[11px] text-muted-foreground"
      >
        <span v-if="row.input" class="relative flex min-w-0 items-center">
          <Handle
            :id="row.input.id"
            type="target"
            :position="Position.Left"
            class="!-left-[13px] !size-2.5 !border-2"
            :style="handleStyle(row.input)"
          />
          <span class="truncate"
            >{{ row.input.label }}<span v-if="row.input.multiple" class="opacity-60"> ⋯</span></span
          >
        </span>
        <span v-else />
        <span v-if="row.output" class="relative flex min-w-0 items-center">
          <span class="truncate">{{ row.output.label }}</span>
          <Handle
            :id="row.output.id"
            type="source"
            :position="Position.Right"
            class="!-right-[13px] !size-2.5 !border-2"
            :style="handleStyle(row.output)"
          />
        </span>
      </div>
    </div>

    <button
      v-if="modelSummary"
      type="button"
      class="nodrag block w-full border-t border-border px-3 py-2 text-left hover:bg-accent"
      @click="openParams"
    >
      <span
        class="block truncate text-[12px]"
        :class="!modelSummary.name && 'text-muted-foreground'"
      >
        {{ modelSummary.name || 'Choose a model…' }}
      </span>
      <span v-if="modelSummary.family" class="block truncate text-[11px] text-muted-foreground">{{
        modelSummary.family
      }}</span>
      <span v-if="modelSummary.missing.length" class="block truncate text-[11px] text-warning">
        Missing: {{ modelSummary.missing.join(', ') }}
      </span>
    </button>

    <div v-if="widgets.length" class="space-y-1 border-t border-border px-3 py-2">
      <div
        v-for="w in widgets"
        :key="w.key"
        :class="
          w.kind === 'textarea' || w.kind === 'images'
            ? 'space-y-0.5'
            : 'grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-2'
        "
      >
        <span class="truncate text-[11px] text-muted-foreground">{{ w.label }}</span>
        <NodeWidget
          :widget="w"
          :value="node.values[w.key] ?? null"
          :inherited="inherited(w)"
          compact
          @update="editor.setValue(node.id, w.key, $event)"
        />
      </div>
    </div>

    <div v-if="results.length" class="grid grid-cols-3 gap-1 border-t border-border p-2">
      <button
        v-for="(file, index) in results.slice(0, 6)"
        :key="file"
        type="button"
        class="nodrag aspect-square overflow-hidden rounded bg-muted"
        :aria-label="`Open result ${index + 1}`"
        @click="viewer.show(results, index)"
      >
        <video
          v-if="isVideoFile(file)"
          :src="getOutputUrl(file)"
          class="size-full object-cover"
          muted
        />
        <img
          v-else
          :src="getOutputUrl(file)"
          alt=""
          loading="lazy"
          class="size-full object-cover"
        />
      </button>
    </div>

    <p
      v-if="run?.status === 'failed' || data.issue"
      class="border-t border-border px-3 py-1.5 text-[11px] leading-snug text-destructive"
    >
      {{ run?.error || data.issue }}
    </p>
  </div>
</template>
