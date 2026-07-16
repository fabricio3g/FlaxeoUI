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
  <!--
    as-child merges onto the single slotted element (usually a button).
    Do not wrap in an extra span — that breaks nested PopoverTrigger as-child chains.
  -->
  <TooltipProvider :delay-duration="delay" :skip-delay-duration="100">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="position"
          :side-offset="6"
          class="z-[999] max-w-xs whitespace-pre-wrap rounded-md bg-foreground px-2.5 py-1.5 text-left text-xs font-medium leading-relaxed text-background shadow-md data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95 sm:max-w-sm"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
