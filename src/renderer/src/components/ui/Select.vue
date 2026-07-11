<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronDown } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  SelectContent,
  SelectGroup,
  SelectIcon,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport
} from 'reka-ui'

interface SelectOption {
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: string
    options: SelectOption[]
    label?: string
    placeholder?: string
    size?: 'sm' | 'md'
    disabled?: boolean
    class?: string
  }>(),
  {
    placeholder: 'Select...',
    size: 'md',
    disabled: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:open': [open: boolean]
}>()

const EMPTY_SENTINEL = '__empty__'

function toSafeValue(v: string): string {
  return v === '' ? EMPTY_SENTINEL : v
}

function fromSafeValue(v: string): string {
  return v === EMPTY_SENTINEL ? '' : v
}

function handleValueChange(value: string): void {
  emit('update:modelValue', fromSafeValue(value))
}

function handleOpenChange(open: boolean): void {
  emit('update:open', open)
}

const safeOptions = computed(() =>
  props.options.map((o) => ({ ...o, value: toSafeValue(o.value) }))
)

const safeModelValue = computed(() => {
  if (props.modelValue == null) return ''
  return toSafeValue(props.modelValue)
})

const displayValue = computed<string>(() => {
  const found = props.options.find((o) => o.value === props.modelValue)
  if (found) return found.label
  if (props.modelValue === '' || props.modelValue == null) return props.placeholder
  return props.modelValue
})

const triggerClasses = cn(
  'flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background text-left font-medium shadow-xs transition-[color,background-color,border-color,box-shadow] duration-150 outline-none dark:bg-input/30',
  'hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
  'data-[placeholder]:text-muted-foreground data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/25',
  'disabled:cursor-not-allowed disabled:opacity-50'
)

const sizeClasses: Record<string, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm'
}

const contentClasses = cn(
  'z-[300] max-h-60 min-w-[var(--reka-select-trigger-width)] w-auto max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-sm',
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95'
)

const itemClasses = cn(
  'relative flex min-w-0 cursor-default select-none items-center rounded-lg py-1.5 pl-2.5 pr-8 text-sm font-medium outline-none transition-colors duration-150',
  'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
  'data-[state=checked]:bg-accent/60 data-[state=checked]:text-foreground',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
)

const viewportClasses = 'p-1.5'
</script>

<template>
  <SelectRoot
    :model-value="safeModelValue"
    :disabled="disabled"
    @update:model-value="handleValueChange"
    @update:open="handleOpenChange"
  >
    <SelectTrigger
      data-slot="select-trigger"
      :data-size="size"
      :class="cn(triggerClasses, sizeClasses[size], props.class)"
    >
      <span v-if="label" class="shrink-0 text-muted-foreground">{{ label }}</span>
      <SelectValue :placeholder="placeholder" class="min-w-0 flex-1 truncate">
        {{ displayValue }}
      </SelectValue>
      <SelectIcon>
        <ChevronDown class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent data-slot="select-content" :class="contentClasses" :position="'popper'">
        <SelectViewport :class="viewportClasses">
          <SelectGroup>
            <SelectItem
              v-for="option in safeOptions"
              :key="option.value"
              :value="option.value"
              data-slot="select-item"
              :class="itemClasses"
            >
              <SelectItemText class="block w-full min-w-0 whitespace-nowrap">
                {{ option.label }}
              </SelectItemText>
              <Check
                v-if="option.value === safeModelValue"
                class="absolute right-2 h-3.5 w-3.5 text-foreground"
              />
            </SelectItem>
          </SelectGroup>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
