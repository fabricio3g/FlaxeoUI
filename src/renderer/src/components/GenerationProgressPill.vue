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
    fallbackLabel: 'GEN'
  }
)

const { current, total, itPerSec, etaSeconds, label, hasSteps } = useGenerationProgress()

const percent = computed(() =>
  total.value > 0 ? Math.min(100, (current.value / total.value) * 100) : 0
)

function formatETA(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '...'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="aui-status-badge fade-in slide-in-from-bottom-1 animate-in fill-mode-both inline-flex items-center gap-3 rounded-full border border-border/70 bg-background/90 px-3.5 py-2 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)] backdrop-blur-xl duration-200 motion-reduce:animate-none"
  >
    <div class="flex min-w-0 items-center gap-2">
      <Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin text-foreground/70" />
      <span class="truncate text-[11px] font-medium tracking-wide text-foreground">
        {{
          props.livePreview
            ? 'Live preview'
            : hasSteps
              ? label || props.fallbackLabel
              : props.loadingText
        }}
      </span>
    </div>

    <div class="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        class="h-full rounded-full bg-foreground/75 transition-[width] duration-300 ease-out"
        :style="{ width: percent + '%' }"
      ></div>
    </div>

    <div
      class="flex shrink-0 items-center gap-2 text-[11px] font-medium tabular-nums text-muted-foreground"
    >
      <span>Step {{ hasSteps ? current : 0 }}/{{ hasSteps ? total : 0 }}</span>
      <span v-if="etaSeconds > 0" class="hidden sm:inline">ETA {{ formatETA(etaSeconds) }}</span>
      <span v-if="itPerSec > 0" class="hidden md:inline">{{ itPerSec.toFixed(2) }} it/s</span>
    </div>
  </div>
</template>
