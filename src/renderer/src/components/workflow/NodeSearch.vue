<script setup lang="ts">
/**
 * Add-node search, opened by double-clicking the canvas or dropping a wire on empty space
 * (then only nodes with a matching socket are listed). Arrow keys + Enter pick.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { Search } from '@/lib/icons'
import { NODE_ICONS, SOCKET_COLORS } from '@/lib/graphUi'
import {
  NODE_DEFS,
  NODE_GROUPS,
  NODE_TYPES,
  type NodeType,
  type SocketType
} from '../../../../shared/workflowGraph'

const props = defineProps<{
  x: number
  y: number
  /** Only nodes that accept (side 'out') or produce (side 'in') this socket type */
  socket?: { type: SocketType; side: 'out' | 'in' } | null
}>()
const emit = defineEmits<{ pick: [type: NodeType]; close: [] }>()

const query = ref('')
const placement = computed(() => ({
  left: `${Math.max(8, Math.min(props.x, window.innerWidth - 300))}px`,
  top: `${Math.max(8, Math.min(props.y, window.innerHeight - 340))}px`
}))
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const socket = props.socket
  return NODE_TYPES.filter((type) => {
    const def = NODE_DEFS[type]
    if (socket) {
      const ports = socket.side === 'out' ? def.inputs : def.outputs
      if (!ports.some((p) => p.type === socket.type)) return false
    }
    return !q || `${def.label} ${def.description}`.toLowerCase().includes(q)
  }).sort(
    (a, b) =>
      NODE_GROUPS.findIndex((g) => g.id === NODE_DEFS[a].group) -
      NODE_GROUPS.findIndex((g) => g.id === NODE_DEFS[b].group)
  )
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(results.value.length - 1, active.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(0, active.value - 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const type = results.value[active.value]
    if (type) emit('pick', type)
  } else if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => void nextTick(() => input.value?.focus()))
</script>

<template>
  <div
    class="fixed z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--float-shadow)]"
    :style="placement"
    role="dialog"
    aria-label="Add a node"
    @pointerdown.stop
  >
    <label class="flex items-center gap-2 border-b border-border px-3">
      <Search class="size-3.5 text-muted-foreground" />
      <input
        ref="input"
        v-model="query"
        class="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        :placeholder="socket ? `Nodes for ${socket.type}` : 'Add a node'"
        aria-label="Search nodes"
        @input="active = 0"
        @keydown="onKeydown"
      />
      <span
        v-if="socket"
        class="size-2.5 rounded-full"
        :style="{ background: SOCKET_COLORS[socket.type] }"
        aria-hidden="true"
      />
    </label>
    <ul class="max-h-72 overflow-y-auto py-1" role="listbox">
      <li v-for="(type, index) in results" :key="type">
        <button
          type="button"
          class="flex w-full items-start gap-2.5 px-3 py-1.5 text-left"
          :class="index === active ? 'bg-accent' : 'hover:bg-accent'"
          role="option"
          :aria-selected="index === active"
          @mouseenter="active = index"
          @click="emit('pick', type)"
        >
          <component
            :is="NODE_ICONS[type]"
            class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          />
          <span class="min-w-0">
            <span class="block text-[13px]">{{ NODE_DEFS[type].label }}</span>
            <span class="block truncate text-[11px] text-muted-foreground">{{
              NODE_DEFS[type].description
            }}</span>
          </span>
        </button>
      </li>
      <li v-if="!results.length" class="px-3 py-4 text-center text-[13px] text-muted-foreground">
        No node matches.
      </li>
    </ul>
  </div>
</template>
