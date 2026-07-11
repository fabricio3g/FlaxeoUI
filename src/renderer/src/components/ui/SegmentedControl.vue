<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

export interface SegmentedOption {
  value: string
  label: string
  icon?: Component
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SegmentedOption[]
    size?: 'sm' | 'md'
    iconOnly?: boolean
  }>(),
  { size: 'md', iconOnly: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function selectOption(option: SegmentedOption): void {
  if (!option.disabled) emit('update:modelValue', option.value)
}

const containerClasses = (size: 'sm' | 'md') =>
  cn(
    'inline-flex items-center justify-center rounded-md border border-border/60 bg-muted/50 p-0.5 text-muted-foreground',
    size === 'sm' ? 'h-8' : 'h-9'
  )

const optionClasses = (
  option: SegmentedOption,
  size: 'sm' | 'md',
  iconOnly: boolean,
  active: boolean
) =>
  cn(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm font-medium transition-[color,background-color] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
    'disabled:pointer-events-none disabled:opacity-50',
    active ? 'bg-background/90 text-foreground' : 'hover:bg-background/40 hover:text-foreground',
    size === 'sm'
      ? iconOnly
        ? 'size-7 [&_svg]:size-3.5'
        : 'h-7 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5'
      : iconOnly
        ? 'size-8 [&_svg]:size-4'
        : 'h-8 gap-1.5 px-3 text-sm [&_svg]:size-4'
  )
</script>

<template>
  <div :class="containerClasses(props.size)" role="tablist">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === option.value"
      :aria-disabled="option.disabled || undefined"
      :data-state="modelValue === option.value ? 'active' : 'inactive'"
      :disabled="option.disabled"
      :class="optionClasses(option, props.size, iconOnly, modelValue === option.value)"
      @click="selectOption(option)"
    >
      <component v-if="option.icon" :is="option.icon" class="shrink-0" />
      <span :class="iconOnly ? 'sr-only' : 'truncate'">{{ option.label }}</span>
    </button>
  </div>
</template>
