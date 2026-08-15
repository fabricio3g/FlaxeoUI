<script setup lang="ts">
/**
 * Empty-state hero shared by the Image / Edit / Video stages.
 * One headline, one supporting line, actions in the default slot —
 * the sidebar already says which workspace you are in.
 */
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div
    class="fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex max-w-2xl flex-col items-center px-6 text-center duration-200"
  >
    <h2 class="content-item text-2xl font-semibold tracking-[-0.02em] text-foreground">
      {{ title }}
    </h2>
    <p
      v-if="description"
      class="content-item mt-2 max-w-md text-sm leading-6 text-muted-foreground"
    >
      {{ description }}
    </p>

    <div
      v-if="$slots.default"
      class="content-item mt-6 flex flex-wrap items-center justify-center gap-2"
    >
      <slot />
    </div>
  </div>
</template>
