<script setup lang="ts">
/** Left panel of the workflow editor: your workflows, examples, and the node library. */
import { computed, ref } from 'vue'
import { Plus, Search } from '@/lib/icons'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { NODE_ICONS } from '@/lib/graphUi'
import { useLibraryStore } from '@/stores/library'
import { useWorkflowEditor } from '@/composables/useWorkflowEditor'
import { requestConfirm } from '@/composables/useConfirm'
import { useRouter } from 'vue-router'
import {
  NODE_DEFS,
  NODE_GROUPS,
  NODE_TYPES,
  type NodeType,
  type WorkflowGraph
} from '../../../../shared/workflowGraph'

const library = useLibraryStore()
const editor = useWorkflowEditor()
const tab = ref<'workflows' | 'nodes'>('workflows')
const query = ref('')

const matches = (text: string): boolean =>
  !query.value.trim() || text.toLowerCase().includes(query.value.trim().toLowerCase())

const mine = computed(() => library.workflows.filter((w) => matches(`${w.name} ${w.description}`)))
const examples = computed(() =>
  library.examples.filter((w) => matches(`${w.name} ${w.description}`))
)
const groups = computed(() =>
  NODE_GROUPS.map((group) => ({
    ...group,
    types: NODE_TYPES.filter(
      (type) =>
        NODE_DEFS[type].group === group.id &&
        matches(`${NODE_DEFS[type].label} ${NODE_DEFS[type].description}`)
    )
  })).filter((g) => g.types.length)
)

const router = useRouter()

async function confirmDiscard(): Promise<boolean> {
  const g = editor.graph.value
  if (!editor.dirty.value || !g.nodes.length) return true
  return requestConfirm({
    title: 'Discard unsaved changes?',
    message: `"${g.name}" has changes that are not saved.`,
    confirmLabel: 'Discard'
  })
}

async function open(graph: WorkflowGraph): Promise<void> {
  if (await confirmDiscard()) editor.open(graph)
  void router.push({ name: 'Workflows' })
}

async function startNew(): Promise<void> {
  if (await confirmDiscard()) editor.startNew()
}

function onDragStart(event: DragEvent, type: NodeType): void {
  event.dataTransfer?.setData('application/x-flaxeo-node', type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-2 px-3 pt-3">
      <SegmentedControl
        v-model="tab"
        :options="[
          { value: 'workflows', label: 'Workflows' },
          { value: 'nodes', label: 'Nodes' }
        ]"
        size="sm"
        class="flex-1"
      />
    </div>
    <label class="mx-3 mt-2 flex h-8 items-center gap-2 rounded-md bg-muted px-2.5">
      <Search class="size-3.5 shrink-0 text-muted-foreground" />
      <input
        v-model="query"
        type="search"
        :placeholder="tab === 'nodes' ? 'Search nodes' : 'Search workflows'"
        :aria-label="tab === 'nodes' ? 'Search nodes' : 'Search workflows'"
        class="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </label>

    <div v-if="tab === 'workflows'" class="min-h-0 flex-1 overflow-y-auto px-2 py-2 text-[13px]">
      <button
        type="button"
        class="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-medium hover:bg-accent"
        @click="startNew()"
      >
        <Plus class="size-3.5" /> New workflow
      </button>
      <p class="px-2 pb-1 pt-2 text-xs text-muted-foreground">Yours</p>
      <button
        v-for="w in mine"
        :key="w.id"
        type="button"
        class="block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
        :class="editor.savedId.value === w.id && 'bg-accent'"
        :aria-current="editor.savedId.value === w.id ? 'page' : undefined"
        @click="open(w)"
      >
        <span class="block truncate">{{ w.name }}</span>
        <span class="block text-xs text-muted-foreground"
          >{{ w.nodes.length }} nodes<template v-if="w.updatedBy">
            · {{ w.updatedBy }}</template
          ></span
        >
      </button>
      <p v-if="!mine.length" class="px-2 py-1 text-xs text-muted-foreground">
        {{ query ? 'No match.' : 'Saved workflows appear here.' }}
      </p>
      <p class="px-2 pb-1 pt-4 text-xs text-muted-foreground">Examples</p>
      <button
        v-for="w in examples"
        :key="w.id"
        type="button"
        class="block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
        @click="open(w)"
      >
        <span class="block truncate">{{ w.name }}</span>
        <span class="block truncate text-xs text-muted-foreground">{{ w.description }}</span>
      </button>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <p class="px-2 pb-2 text-xs text-muted-foreground">
        Drag onto the canvas, click to add, or double-click the canvas to search.
      </p>
      <template v-for="group in groups" :key="group.id">
        <p class="px-2 pb-1 pt-2 text-xs text-muted-foreground">{{ group.label }}</p>
        <button
          v-for="type in group.types"
          :key="type"
          type="button"
          draggable="true"
          class="flex w-full cursor-grab items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent active:cursor-grabbing"
          @dragstart="onDragStart($event, type)"
          @click="editor.pendingAdd.value = type"
        >
          <component
            :is="NODE_ICONS[type]"
            class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          />
          <span class="min-w-0">
            <span class="block text-[13px]">{{ NODE_DEFS[type].label }}</span>
            <span class="block text-[11px] leading-snug text-muted-foreground">{{
              NODE_DEFS[type].description
            }}</span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>
