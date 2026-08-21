<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'outline' | 'destructive'
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Fully rounded (chips, suggestions) */
    pill?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    class?: string
  }>(),
  {
    variant: 'ghost',
    size: 'md',
    pill: false,
    disabled: false,
    type: 'button'
  }
)

const variantClasses = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40',
  ghost:
    'text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40',
  outline:
    'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40',
  destructive:
    'bg-destructive/10 text-destructive hover:bg-destructive/15 disabled:opacity-40'
} as const

const sizeClasses = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-8 gap-2 px-3 text-sm',
  lg: 'h-9 gap-2 px-4 text-sm',
  xl: 'h-10 gap-2 px-4 text-sm'
} as const
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    :class="
      cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none',
        props.pill ? 'rounded-full' : 'rounded-md',
        variantClasses[props.variant],
        sizeClasses[props.size],
        props.class
      )
    "
  >
    <slot />
  </button>
</template>
