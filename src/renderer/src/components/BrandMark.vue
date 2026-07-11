<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>()
</script>

<template>
  <span
    class="inline-flex select-none items-baseline gap-2 tracking-tight"
    aria-label="Flaxeo Image"
  >
    <span
      :class="[
        'font-semibold',
        size === 'sm' ? 'text-sm' : '',
        size === 'md' ? 'text-base' : '',
        size === 'lg' ? 'text-4xl tracking-[-0.04em]' : '',
        size === 'xl' ? 'text-5xl md:text-6xl tracking-[-0.045em]' : ''
      ]"
      >Flaxeo</span
    >
    <span
      :class="[
        'font-thin',
        size === 'sm' ? 'text-sm' : '',
        size === 'md' ? 'text-base' : '',
        size === 'lg' ? 'text-4xl tracking-[-0.04em]' : '',
        size === 'xl' ? 'text-5xl md:text-6xl tracking-[-0.045em]' : ''
      ]"
      >Image</span
    >
  </span>
</template>
