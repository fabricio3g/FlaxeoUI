<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from '@/lib/icons'
import { useGenerationProgress } from '@/composables/useGenerationProgress'

const props = withDefaults(
  defineProps<{
    loadingText?: string
    fallbackLabel?: string
    livePreview?: boolean
  }>(),
  {
    loadingText: 'Loading model',
    fallbackLabel: 'Generating'
  }
)

const { current, total, hasSteps } = useGenerationProgress()

const percent = computed(() =>
  total.value > 0 ? Math.min(100, (current.value / total.value) * 100) : 0
)

const statusText = computed(() => {
  if (props.livePreview) return 'Live preview'
  if (hasSteps.value) return props.fallbackLabel
  return props.loadingText
})
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="aui-progress-chip inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/35 px-3 py-1.5"
  >
    <Loader2 class="size-3.5 shrink-0 animate-spin text-muted-foreground" />
    <span class="text-[11px] font-medium text-foreground">{{ statusText }}</span>
    <span
      v-if="hasSteps"
      class="text-[11px] tabular-nums text-muted-foreground"
    >
      {{ current }}/{{ total }}
    </span>
    <div
      class="h-1 w-16 overflow-hidden rounded-full bg-border/50 sm:w-20"
      aria-hidden="true"
    >
      <div
        class="h-full rounded-full bg-foreground/65 transition-[width] duration-300 ease-out"
        :style="{ width: (hasSteps ? percent : 12) + '%' }"
      />
    </div>
  </div>
</template>
