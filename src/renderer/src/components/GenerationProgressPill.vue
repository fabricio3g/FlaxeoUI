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

const statusText = computed(() => {
  if (props.livePreview) return 'Live preview'
  if (hasSteps.value) return label.value || props.fallbackLabel
  return props.loadingText
})

const phaseHint = computed(() => {
  if (props.livePreview) return 'Updating as steps complete'
  if (!hasSteps.value) return 'Weights and text encoder may take a minute'
  return null
})

function formatETA(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '…'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="aui-progress-chip fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border/70 bg-muted/40 px-3.5 py-2.5 duration-200 motion-reduce:animate-none"
  >
    <div class="flex min-w-0 items-center gap-2.5">
      <Loader2 class="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-[12px] font-medium tracking-wide text-foreground">
          {{ statusText }}
        </p>
        <p v-if="phaseHint" class="mt-0.5 truncate text-[10px] text-muted-foreground">
          {{ phaseHint }}
        </p>
      </div>
      <div
        class="flex shrink-0 items-center gap-2 text-[11px] font-medium tabular-nums text-muted-foreground"
      >
        <span>Step {{ hasSteps ? current : 0 }}/{{ hasSteps ? total : 0 }}</span>
        <span v-if="etaSeconds > 0" class="hidden sm:inline">ETA {{ formatETA(etaSeconds) }}</span>
        <span v-if="itPerSec > 0" class="hidden md:inline">{{ itPerSec.toFixed(2) }} it/s</span>
      </div>
    </div>

    <div class="h-1 w-full overflow-hidden rounded-full bg-border/60" aria-hidden="true">
      <div
        class="h-full rounded-full bg-foreground/70 transition-[width] duration-300 ease-out"
        :style="{ width: (hasSteps ? percent : 8) + '%' }"
      ></div>
    </div>
  </div>
</template>
