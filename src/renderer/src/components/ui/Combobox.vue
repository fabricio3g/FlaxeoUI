<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, ChevronDown, Search } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  /** Section header; options keep their order inside a group */
  group?: string
  /** Second line (file name, size, reason it is disabled…) */
  hint?: string
  /** Small trailing tag, e.g. "Installed" / "Get" */
  badge?: string
  badgeTone?: 'ok' | 'warn' | 'muted'
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: ComboboxOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    size?: 'sm' | 'md'
    disabled?: boolean
    /** Adds a "None" row that clears the value */
    clearable?: boolean
    clearLabel?: string
    ariaLabel?: string
    class?: string
    contentClass?: string
  }>(),
  {
    placeholder: 'Choose…',
    searchPlaceholder: 'Search…',
    emptyText: 'Nothing matches',
    size: 'md',
    disabled: false,
    clearable: false,
    clearLabel: 'None',
    ariaLabel: undefined,
    class: undefined,
    contentClass: undefined
  }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const query = ref('')
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

const selected = computed(() => props.options.find((o) => o.value === props.modelValue))

const rows = computed<ComboboxOption[]>(() => {
  const q = query.value.trim().toLowerCase()
  const base = q
    ? props.options.filter((o) =>
        `${o.label} ${o.hint || ''} ${o.value} ${o.group || ''}`.toLowerCase().includes(q)
      )
    : props.options
  return props.clearable && !q ? [{ value: '', label: props.clearLabel }, ...base] : base
})

/** Rows with a group header inserted whenever the group changes. */
const display = computed(() => {
  const out: Array<{ header?: string; option?: ComboboxOption; index?: number }> = []
  let lastGroup: string | undefined
  rows.value.forEach((option, index) => {
    if (option.group && option.group !== lastGroup) out.push({ header: option.group })
    lastGroup = option.group
    out.push({ option, index })
  })
  return out
})

watch(open, async (value) => {
  if (!value) return
  query.value = ''
  const current = rows.value.findIndex((o) => o.value === props.modelValue)
  active.value = Math.max(0, current)
  await nextTick()
  input.value?.focus()
  scrollActive()
})

watch(query, () => {
  active.value = rows.value.findIndex((o) => !o.disabled)
})

function scrollActive(): void {
  nextTick(() => {
    list.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  })
}

function move(delta: number): void {
  const count = rows.value.length
  if (!count) return
  let next = active.value
  for (let i = 0; i < count; i++) {
    next = (next + delta + count) % count
    if (!rows.value[next].disabled) break
  }
  active.value = next
  scrollActive()
}

function choose(option: ComboboxOption | undefined): void {
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  open.value = false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    choose(rows.value[active.value])
  }
}

const badgeTones = {
  ok: 'bg-success/15 text-success',
  warn: 'bg-warning/15 text-warning',
  muted: 'bg-muted text-muted-foreground'
} as const
</script>

<template>
  <Popover :open="open" @update:open="(v) => (open = v)">
    <PopoverTrigger as-child>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :aria-expanded="open"
        :class="
          cn(
            'flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background text-left font-medium transition-colors duration-150 outline-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
            size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
            open && 'border-ring ring-2 ring-ring/25',
            props.class
          )
        "
      >
        <span class="min-w-0 flex-1 truncate" :class="selected ? '' : 'text-muted-foreground'">
          <slot name="value" :option="selected">{{ selected?.label || placeholder }}</slot>
        </span>
        <span
          v-if="selected?.badge"
          class="shrink-0 rounded-full px-1.5 py-px text-[0.65rem] font-medium"
          :class="badgeTones[selected.badgeTone || 'muted']"
          >{{ selected.badge }}</span
        >
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      :side-offset="6"
      :class="
        cn(
          'w-[max(var(--reka-popover-trigger-width),18rem)] max-w-[calc(100vw-1.5rem)] p-0',
          contentClass
        )
      "
    >
      <div class="flex items-center gap-2 border-b border-border/70 px-2.5">
        <Search class="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref="input"
          v-model="query"
          :placeholder="searchPlaceholder"
          :aria-label="searchPlaceholder"
          class="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          @keydown="onKeydown"
        />
      </div>
      <div ref="list" role="listbox" class="max-h-[min(20rem,50vh)] overflow-y-auto p-1.5">
        <template
          v-for="(row, i) in display"
          :key="row.header ? `h-${row.header}-${i}` : `o-${row.option?.value}-${i}`"
        >
          <p
            v-if="row.header"
            class="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground first:pt-0.5"
          >
            {{ row.header }}
          </p>
          <button
            v-else-if="row.option"
            type="button"
            role="option"
            :aria-selected="row.option.value === modelValue"
            :data-active="row.index === active"
            :disabled="row.option.disabled"
            class="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors data-[active=true]:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            @mousemove="active = row.index ?? 0"
            @click="choose(row.option)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ row.option.label }}</span>
              <span v-if="row.option.hint" class="block truncate text-xs text-muted-foreground">{{
                row.option.hint
              }}</span>
            </span>
            <span
              v-if="row.option.badge"
              class="shrink-0 rounded-full px-1.5 py-px text-[0.65rem] font-medium"
              :class="badgeTones[row.option.badgeTone || 'muted']"
              >{{ row.option.badge }}</span
            >
            <Check v-if="row.option.value === modelValue" class="size-3.5 shrink-0" />
          </button>
        </template>
        <p v-if="!rows.length" class="px-2 py-3 text-center text-sm text-muted-foreground">
          {{ emptyText }}
        </p>
        <slot name="footer" :close="() => (open = false)" />
      </div>
    </PopoverContent>
  </Popover>
</template>
