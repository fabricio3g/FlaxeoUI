<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
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
} from 'radix-vue'

interface SelectOption {
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: string
    options: SelectOption[]
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

const triggerClasses =
  'flex w-full items-center justify-between gap-1 rounded-md border border-border/70 bg-card text-left transition-colors focus:outline-none focus:ring-1 focus:ring-ring data-[placeholder]:text-muted-foreground data-[state=open]:ring-1 data-[state=open]:ring-ring'

const sizeClasses: Record<string, string> = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-2.5 py-1.5'
}

const contentClasses =
  'z-50 max-h-60 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border/70 bg-card shadow-md'

const itemClasses =
  'relative flex cursor-default select-none items-center rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted/60 data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-colors'

const viewportClasses = 'p-1'
</script>

<template>
  <SelectRoot
    :model-value="safeModelValue"
    :disabled="disabled"
    @update:model-value="handleValueChange"
  >
    <SelectTrigger
      :class="[triggerClasses, sizeClasses[size], props.class]"
    >
      <SelectValue :placeholder="placeholder">
        {{ displayValue }}
      </SelectValue>
      <SelectIcon>
        <ChevronDown class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent :class="contentClasses" :position="'popper'">
        <SelectViewport :class="viewportClasses">
          <SelectGroup>
            <SelectItem
              v-for="option in safeOptions"
              :key="option.value"
              :value="option.value"
              :class="itemClasses"
            >
              <SelectItemText>
                {{ option.label }}
              </SelectItemText>
            </SelectItem>
          </SelectGroup>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
