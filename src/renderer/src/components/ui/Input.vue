<script setup lang="ts">
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md'
    class?: string
  }>(),
  {
    size: 'md',
    class: undefined
  }
)

// Supports `v-model` and `v-model.number` like the native inputs it replaces.
const [modelValue, modelModifiers] = defineModel<string | number>({
  set(value) {
    if (modelModifiers.number && typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      return Number.isNaN(parsed) ? value : parsed
    }
    return value
  }
})
</script>

<template>
  <input
    v-model="modelValue"
    v-bind="$attrs"
    :class="
      cn(
        'w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-foreground transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
        props.size === 'sm' && 'px-2.5 py-1.5 text-sm',
        props.class
      )
    "
  />
</template>
