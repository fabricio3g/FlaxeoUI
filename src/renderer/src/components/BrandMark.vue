<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Soft floating squares behind the mark (lg/xl empty states) */
    ambient?: boolean
  }>(),
  {
    size: 'md',
    ambient: undefined
  }
)

const showAmbient = computed(() => props.ambient ?? (props.size === 'lg' || props.size === 'xl'))

/**
 * Square field around the wordmark.
 * Positions are % of the ambient stage so they scale with size.
 */
const squares = [
  { s: '0.55rem', x: '8%', y: '18%', d: '0s' },
  { s: '0.9rem', x: '88%', y: '12%', d: '0.5s' },
  { s: '0.45rem', x: '4%', y: '62%', d: '1.1s' },
  { s: '1.15rem', x: '92%', y: '58%', d: '0.25s' },
  { s: '0.7rem', x: '18%', y: '88%', d: '1.4s' },
  { s: '0.85rem', x: '78%', y: '86%', d: '0.85s' },
  { s: '0.4rem', x: '96%', y: '38%', d: '1.7s' },
  { s: '1rem', x: '2%', y: '38%', d: '0.35s' },
  { s: '0.5rem', x: '42%', y: '6%', d: '1s' },
  { s: '0.65rem', x: '58%', y: '94%', d: '1.55s' }
] as const

/** Shared type ramp: same weights/tracking everywhere; only font-size changes. */
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
        class="brand-mark__square absolute rounded-[3px] border-2 border-foreground/35 bg-foreground/10 dark:border-white/40 dark:bg-white/10"
        :style="{
          width: sq.s,
          height: sq.s,
          left: sq.x,
          top: sq.y,
          animationDelay: sq.d
        }"
      />
    </span>

    <!-- Flaxeo: hard / heavy — same style at every size -->
    <span class="brand-mark__flaxeo relative z-10">Flaxeo</span>
    <!-- Image: slim / light — same style at every size -->
    <span class="brand-mark__image relative z-10">Image</span>
  </span>
</template>

<style scoped>
/* Shared wordmark system (sidebar sm + hero lg/xl) */
.brand-mark {
  gap: 0.4em; /* proportional to font-size so spacing matches at every size */
  line-height: 1;
}

.brand-mark__flaxeo {
  font-weight: 900;
  letter-spacing: -0.05em;
  color: inherit;
}

.brand-mark__image {
  font-weight: 200;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, currentColor 85%, transparent);
}

.brand-mark--sm {
  font-size: 0.875rem; /* 14px — sidebar */
}

.brand-mark--md {
  font-size: 1rem;
}

.brand-mark--lg {
  font-size: 2.25rem; /* 36px — empty states */
}

.brand-mark--xl {
  font-size: 3rem; /* 48px — Image hero */
}

@media (min-width: 768px) {
  .brand-mark--xl {
    font-size: 3.75rem; /* 60px */
  }
}

/* Ambient squares: same padding scale for lg/xl heroes */
.brand-mark--ambient {
  padding: 0.75em 1em;
  isolation: isolate;
  min-width: 8em;
}

.brand-mark__square {
  transform: translate(-50%, -50%);
  animation: brand-square-drift 4.8s ease-in-out infinite;
  will-change: transform, opacity;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.04);
}

@keyframes brand-square-drift {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
    opacity: 0.75;
  }
  35% {
    transform: translate(-50%, calc(-50% - 10px)) scale(1.12) rotate(6deg);
    opacity: 1;
  }
  70% {
    transform: translate(calc(-50% + 6px), calc(-50% + 6px)) scale(0.92) rotate(-5deg);
    opacity: 0.65;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-mark__square {
    animation: none;
    opacity: 0.85;
  }
}
</style>
