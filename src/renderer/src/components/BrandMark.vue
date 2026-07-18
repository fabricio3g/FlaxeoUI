<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Floating squares behind the mark (lg/xl empty states) */
    ambient?: boolean
  }>(),
  {
    size: 'md',
    ambient: undefined
  }
)

const showAmbient = computed(() => props.ambient ?? (props.size === 'lg' || props.size === 'xl'))

/** Quiet ambient squares around the wordmark */
const squares = [
  { s: '0.55rem', x: '8%', y: '18%' },
  { s: '0.9rem', x: '88%', y: '12%' },
  { s: '0.45rem', x: '4%', y: '62%' },
  { s: '1.15rem', x: '92%', y: '58%' },
  { s: '0.7rem', x: '18%', y: '88%' },
  { s: '0.85rem', x: '78%', y: '86%' },
  { s: '0.4rem', x: '96%', y: '38%' },
  { s: '1rem', x: '2%', y: '38%' },
  { s: '0.5rem', x: '42%', y: '6%' },
  { s: '0.65rem', x: '58%', y: '94%' }
] as const

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'brand-mark--sm'
    case 'lg':
      return 'brand-mark--lg'
    case 'xl':
      return 'brand-mark--xl'
    default:
      return 'brand-mark--md'
  }
})
</script>

<template>
  <span
    class="brand-mark relative inline-flex select-none items-baseline justify-center text-foreground"
    :class="[sizeClass, showAmbient && 'brand-mark--ambient']"
    aria-label="Flaxeo Image"
  >
    <span
      v-if="showAmbient"
      class="brand-mark__field pointer-events-none absolute inset-0 z-0 overflow-visible"
      aria-hidden="true"
    >
      <span
        v-for="(sq, i) in squares"
        :key="i"
        class="brand-mark__square absolute border border-foreground/30 bg-foreground/8 dark:border-white/35 dark:bg-white/10"
        :style="{
          width: sq.s,
          height: sq.s,
          left: sq.x,
          top: sq.y
        }"
      />
    </span>

    <span class="brand-mark__flaxeo relative z-10">Flaxeo</span>
    <span class="brand-mark__image relative z-10">Image</span>
  </span>
</template>

<style scoped>
.brand-mark {
  gap: 0.4em;
  line-height: 1;
}

.brand-mark__flaxeo {
  font-weight: 600;
  letter-spacing: -0.04em;
  color: inherit;
}

.brand-mark__image {
  font-weight: 200;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, currentColor 85%, transparent);
}

.brand-mark--sm {
  font-size: 0.875rem;
}

.brand-mark--md {
  font-size: 1rem;
}

.brand-mark--lg {
  font-size: 2.25rem;
}

.brand-mark--xl {
  font-size: 3rem;
}

@media (min-width: 768px) {
  .brand-mark--xl {
    font-size: 3.75rem;
  }
}

.brand-mark--ambient {
  padding: 0.75em 1em;
  isolation: isolate;
  min-width: 8em;
}

.brand-mark__square {
  border-radius: 0;
  transform: translate(-50%, -50%);
  opacity: 0.75;
}
</style>
