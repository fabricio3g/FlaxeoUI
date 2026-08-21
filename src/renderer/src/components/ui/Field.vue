<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    /** Stack direction of label/control; row keeps the label inline (compact panels) */
    layout?: 'column' | 'row'
    class?: string
  }>(),
  {
    label: undefined,
    hint: undefined,
    layout: 'column',
    class: undefined
  }
)
</script>

<template>
  <label :class="cn('block', props.class)">
    <span
      v-if="props.label"
      :class="
        cn(
          'block text-sm font-medium text-muted-foreground',
          props.layout === 'row' ? 'mr-2 inline-block' : 'mb-1.5'
        )
      "
      >{{ props.label }}</span
    >
    <slot />
    <span v-if="props.hint" class="mt-1 block text-xs text-muted-foreground/80">{{
      props.hint
    }}</span>
  </label>
</template>
