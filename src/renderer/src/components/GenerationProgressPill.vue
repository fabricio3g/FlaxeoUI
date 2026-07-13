<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from '@/lib/icons'
import {
  formatItPerSec,
  formatProgressTime,
  useGenerationProgress
} from '@/composables/useGenerationProgress'
import { useJobQueue } from '@/composables/useJobQueue'
import Tooltip from '@/components/ui/Tooltip.vue'

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

const {
  current,
  total,
  hasSteps,
  phaseLabel,
  phase,
  itPerSec,
  etaSeconds,
  elapsedSeconds,
  stageCurrent,
  stageTotal,
  stageLabel,
  percent
} = useGenerationProgress()
const { current: currentJob, pendingCount } = useJobQueue()

const statusText = computed(() => {
  if (stageLabel.value) return stageLabel.value
  if (props.livePreview) return 'Live preview'
  if (hasSteps.value) return props.fallbackLabel
  if (phase.value && phase.value !== 'starting' && phaseLabel.value) {
    return phaseLabel.value
  }
  return props.loadingText
})

/** Full prompt for hover — not shown inline */
const jobPrompt = computed(() => {
  const job = currentJob.value
  if (!job) return ''
  const text = (job.prompt || job.label || '').replace(/\s+/g, ' ').trim()
  return text
})

const speedText = computed(() => formatItPerSec(itPerSec.value))

const elapsedText = computed(() => formatProgressTime(elapsedSeconds.value))

const etaText = computed(() => {
  if (!hasSteps.value || etaSeconds.value <= 0) return ''
  if (current.value >= total.value && total.value > 0) return ''
  return formatProgressTime(etaSeconds.value)
})

const barWidth = computed(() => {
  if (hasSteps.value) return percent.value
  // Indeterminate-ish fill while loading phases
  return Math.min(28, 8 + elapsedSeconds.value * 1.2)
})
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="aui-progress-chip inline-flex max-w-[min(100%,28rem)] flex-col gap-1.5 rounded-2xl border border-border/60 bg-muted/30 px-3.5 py-2.5"
  >
    <div class="flex min-w-0 items-center gap-2.5">
      <Loader2 class="size-4 shrink-0 animate-spin text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate text-sm font-medium leading-5 text-foreground">
            {{ statusText }}
          </p>
          <Tooltip v-if="jobPrompt" :text="jobPrompt" position="top" :delay="80">
            <button
              type="button"
              class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
              aria-label="Show prompt"
            >
              Prompt
            </button>
          </Tooltip>
        </div>
        <p
          class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums leading-4 text-muted-foreground"
        >
          <span v-if="hasSteps && total > 0">{{ current }}/{{ total }}</span>
          <span v-if="stageTotal > 1">Stage {{ stageCurrent }}/{{ stageTotal }}</span>
          <span v-if="speedText">{{ speedText }}</span>
          <span>{{ elapsedText }}</span>
          <span v-if="etaText">ETA {{ etaText }}</span>
          <span v-if="pendingCount">+{{ pendingCount }} queued</span>
          <span
            v-if="!hasSteps && phaseLabel && phaseLabel !== statusText"
            class="truncate font-normal"
          >
            {{ phaseLabel }}
          </span>
        </p>
      </div>
    </div>
    <div
      class="h-1 w-full min-w-[10rem] overflow-hidden rounded-full bg-border/50"
      aria-hidden="true"
    >
      <div
        class="h-full rounded-full bg-foreground/70 transition-[width] duration-300 ease-out"
        :style="{ width: barWidth + '%' }"
      />
    </div>
  </div>
</template>
