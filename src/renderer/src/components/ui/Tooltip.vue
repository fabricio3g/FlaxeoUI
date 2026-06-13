<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string
    position?: 'top' | 'bottom' | 'left' | 'right'
  }>(),
  { position: 'right' }
)

const visible = ref(false)

const isVertical = computed(() => props.position === 'top' || props.position === 'bottom')
</script>

<template>
  <div
    class="relative inline-flex"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
  >
    <slot />
    <div
      v-if="visible"
      class="absolute z-[999] border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md pointer-events-none"
      :class="[
        position === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' : '',
        position === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-2' : '',
        position === 'left' ? 'top-1/2 -translate-y-1/2 right-full mr-2' : '',
        position === 'right' ? 'top-1/2 -translate-y-1/2 left-full ml-2' : '',
        isVertical ? 'max-w-64 text-center whitespace-normal rounded-md' : 'whitespace-nowrap rounded-full'
      ]"
    >
      {{ text }}
    </div>
  </div>
</template>
