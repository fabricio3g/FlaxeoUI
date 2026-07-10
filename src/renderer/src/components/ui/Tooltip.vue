<script setup lang="ts">
import { ref } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    text: string
    position?: 'top' | 'bottom' | 'left' | 'right'
    delay?: number
  }>(),
  { position: 'top', delay: 120 }
)

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function show() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (visible.value = true), props.delay)
}

function hide() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (visible.value = false), 80)
}

const positionClasses: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'top-1/2 -translate-y-1/2 right-full mr-2',
  right: 'top-1/2 -translate-y-1/2 left-full ml-2'
}
</script>

<template>
  <div
    class="relative inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        role="tooltip"
        :class="
          cn(
            'pointer-events-none absolute z-[999] max-w-64 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md',
            position === 'left' || position === 'right'
              ? 'whitespace-nowrap'
              : 'whitespace-normal text-center',
            positionClasses[position]
          )
        "
      >
        {{ text }}
      </div>
    </Transition>
  </div>
</template>
