<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import { panelMotion } from '@/lib/motion'

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
    v-motion
    :initial="panelMotion.initial"
    :enter="panelMotion.enter"
    class="generation-progress-pill"
  >
    <div class="flex min-w-0 items-center gap-2">
      <Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      <span class="generation-progress-label truncate">
        {{
          props.livePreview
            ? 'Live preview'
            : hasSteps
              ? label || props.fallbackLabel
              : props.loadingText
        }}
      </span>
    </div>

    <div class="generation-progress-meter" aria-hidden="true">
      <div :style="{ width: percent + '%' }"></div>
    </div>

    <div class="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-muted-foreground">
      <span>Step {{ hasSteps ? current : 0 }}/{{ hasSteps ? total : 0 }}</span>
      <span v-if="etaSeconds > 0" class="hidden sm:inline">ETA {{ formatETA(etaSeconds) }}</span>
      <span v-if="itPerSec > 0" class="hidden md:inline">{{ itPerSec.toFixed(2) }} it/s</span>
    </div>
  </div>
</template>
