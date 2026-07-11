<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger
} from 'reka-ui'

withDefaults(
  defineProps<{
    text: string
    position?: 'top' | 'bottom' | 'left' | 'right'
    delay?: number
  }>(),
  { position: 'top', delay: 120 }
)
</script>

<template>
  <TooltipProvider :delay-duration="delay" :skip-delay-duration="100">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <span class="inline-flex">
          <slot />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="position"
          :side-offset="6"
          class="z-[999] max-w-64 rounded-md bg-foreground px-2.5 py-1.5 text-center text-xs font-medium text-background shadow-md data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
