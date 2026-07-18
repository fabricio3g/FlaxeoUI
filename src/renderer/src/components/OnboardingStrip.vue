<script setup lang="ts">
import { Check, X } from '@/lib/icons'
import { useSetup } from '@/composables/useSetup'

const emit = defineEmits<{
  dismiss: []
  fixBackend: []
  fixModels: []
  firstImage: []
}>()

const { checklist, checklistComplete } = useSetup()

function onItemClick(id: string): void {
  if (id === 'backend') emit('fixBackend')
  else if (id === 'models') emit('fixModels')
  else if (id === 'firstImage') emit('firstImage')
}
</script>

<template>
  <div
    v-if="!checklistComplete"
    class="aui-onboarding-strip flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 md:px-4"
    role="region"
    aria-label="Getting started"
  >
    <p
      class="hidden text-xs font-medium uppercase tracking-wider text-muted-foreground sm:block"
    >
      Getting started
    </p>
    <ul class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <li v-for="item in checklist" :key="item.id">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors"
          :class="
            item.done
              ? 'border-border/50 bg-background/60 text-muted-foreground'
              : 'border-border bg-background text-foreground hover:bg-accent'
          "
          :title="item.done ? item.label : `Complete: ${item.label}`"
          @click="onItemClick(item.id)"
        >
          <Check
            class="size-3"
            :class="item.done ? 'text-emerald-600 dark:text-emerald-400' : 'opacity-30'"
          />
          {{ item.label }}
        </button>
      </li>
    </ul>
    <button
      v-if="!checklist.find((c) => c.id === 'firstImage')?.done"
      type="button"
      class="hidden shrink-0 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90 sm:inline-flex"
      @click="emit('firstImage')"
    >
      Try sample
    </button>
    <button
      type="button"
      class="aui-icon-button inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label="Dismiss getting started"
      title="Dismiss (won't show again)"
      @click="emit('dismiss')"
    >
      <X class="size-3.5" />
    </button>
  </div>
</template>
