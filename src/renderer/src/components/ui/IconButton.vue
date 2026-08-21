<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    variant?: 'ghost' | 'outline' | 'solid'
    size?: 'xs' | 'sm' | 'md'
    shape?: 'square' | 'pill'
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    class?: string
  }>(),
  {
    variant: 'ghost',
    size: 'md',
    shape: 'square',
    disabled: false,
    type: 'button'
  }
)

const variantClasses = {
  ghost:
    'text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40',
  outline:
    'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40',
  solid: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40'
} as const

const sizeClasses = {
  xs: 'size-6',
  sm: 'size-7',
  md: 'size-8'
} as const
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    :class="
      cn(
        // no-drag keeps clicks working inside the titlebar drag region
        'inline-flex shrink-0 items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none [-webkit-app-region:no-drag]',
        props.shape === 'pill' ? 'rounded-full' : 'rounded-md',
        variantClasses[props.variant],
        sizeClasses[props.size],
        props.class
      )
    "
  >
    <slot />
  </button>
</template>
