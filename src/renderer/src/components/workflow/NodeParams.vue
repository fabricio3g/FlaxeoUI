<script setup lang="ts">
/**
 * Right panel for the selected node: its name, every widget at full size (and which ones
 * are wired as inputs), and for Load model the model picker plus every model option.
 */
import { computed } from 'vue'
import { Cable, X } from '@/lib/icons'
import NodeWidget from './NodeWidget.vue'
import ModelPicker from '@/components/create/ModelPicker.vue'
import ModelOptions from '@/components/options/ModelOptions.vue'
import { useWorkflowEditor } from '@/composables/useWorkflowEditor'
import { NODE_ICONS } from '@/lib/graphUi'
import {
  NODE_DEFS,
  isWired,
  nodeTitle,
  upstreamModel,
  type GraphNode,
  type WidgetDef
} from '../../../../shared/workflowGraph'
import type { ModelSetup } from '../../../../shared/modelSetup'

const props = defineProps<{ node: GraphNode }>()
const emit = defineEmits<{ close: [] }>()

const editor = useWorkflowEditor()
const def = computed(() => NODE_DEFS[props.node.type])
const model = computed(() => upstreamModel(editor.graph.value, props.node.id)?.setup || null)
/** Same rule as on the node: hi-res settings only with hi-res on, strength only with an image. */
const widgets = computed(() =>
  def.value.widgets.filter(
    (w) =>
      !(w.showIf?.wired && !isWired(editor.graph.value, props.node.id, w.showIf.wired)) &&
      !(w.showIf?.widget && !props.node.values[w.showIf.widget])
  )
)
const inherited = (w: WidgetDef): unknown =>
  w.setupKey && model.value ? model.value[w.setupKey] : undefined

/** Which kind of models fit: the nodes this model feeds decide. */
const kind = computed(() => {
  const targets = editor.graph.value.edges
    .filter((e) => e.source === props.node.id)
    .map((e) => editor.graph.value.nodes.find((n) => n.id === e.target)?.type)
  return targets.includes('video') ? 'video' : 'image'
})

function replaceSetup(setup: ModelSetup): void {
  editor.updateSetup(props.node.id, setup)
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-12 shrink-0 items-center gap-2 px-4">
      <component :is="NODE_ICONS[node.type]" class="size-4 shrink-0 text-muted-foreground" />
      <input
        class="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] font-medium hover:bg-accent focus:bg-background"
        :value="node.title"
        :placeholder="nodeTitle({ type: node.type, title: '' })"
        aria-label="Node name"
        @change="editor.setTitle(node.id, ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Close parameters"
        v-tip="{ text: 'Close', keys: 'Esc' }"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>
    </div>
    <p class="px-4 pb-2 text-xs text-muted-foreground">{{ def.description }}</p>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <template v-if="node.type === 'loadModel' && node.setup">
        <div class="mb-2 border-t border-border pt-3">
          <ModelPicker :setup="node.setup" :kind="kind" @update="replaceSetup" />
        </div>
        <ModelOptions
          :setup="node.setup"
          mode="model"
          @update="editor.updateSetup(node.id, $event)"
        />
      </template>

      <div v-else class="space-y-3 border-t border-border pt-3">
        <div v-for="w in widgets" :key="w.key">
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="text-[13px] text-muted-foreground">{{ w.label }}</span>
            <button
              v-if="w.input"
              type="button"
              class="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] hover:bg-accent"
              :class="node.linked.includes(w.key) ? 'text-brand' : 'text-muted-foreground'"
              :aria-pressed="node.linked.includes(w.key)"
              :title="
                node.linked.includes(w.key)
                  ? 'Back to a value on the node'
                  : 'Take this value from a wire'
              "
              @click="editor.toggleLinked(node.id, w.key)"
            >
              <Cable class="size-3" />
              {{ node.linked.includes(w.key) ? 'Wired input' : 'Make input' }}
            </button>
          </div>
          <p v-if="node.linked.includes(w.key)" class="text-xs text-muted-foreground">
            Comes from the “{{ w.label }}” socket on the node.
          </p>
          <NodeWidget
            v-else
            :widget="w"
            :value="node.values[w.key] ?? null"
            :inherited="inherited(w)"
            @update="editor.setValue(node.id, w.key, $event)"
          />
        </div>
        <p v-if="!widgets.length" class="text-[13px] text-muted-foreground">
          Nothing to set here; wire it up on the canvas.
        </p>
      </div>
    </div>
  </div>
</template>
