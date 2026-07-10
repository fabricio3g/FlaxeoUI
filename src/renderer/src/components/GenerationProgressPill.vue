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
    class="animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-both inline-flex items-center gap-3 rounded-full border border-border bg-card px-3 py-1 shadow-sm"
  >
    <div class="flex min-w-0 items-center gap-2">
      <Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      <span class="truncate text-[11px] font-semibold uppercase tracking-wider text-foreground">
        {{
          props.livePreview
            ? 'Live preview'
            : hasSteps
              ? label || props.fallbackLabel
              : props.loadingText
        }}
      </span>
    </div>

    <div class="min-w-16 flex-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        class="h-full rounded-full bg-primary transition-all"
        :style="{ width: percent + '%' }"
      ></div>
    </div>

    <div class="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-muted-foreground">
      <span>Step {{ hasSteps ? current : 0 }}/{{ hasSteps ? total : 0 }}</span>
      <span v-if="etaSeconds > 0" class="hidden sm:inline">ETA {{ formatETA(etaSeconds) }}</span>
      <span v-if="itPerSec > 0" class="hidden md:inline">{{ itPerSec.toFixed(2) }} it/s</span>
    </div>
  </div>
</template>
