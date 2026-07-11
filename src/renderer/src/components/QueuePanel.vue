<script setup lang="ts">
import { computed, watch } from 'vue'
import { ChevronDown, ChevronUp, Square, X } from '@/lib/icons'
import { useJobQueue } from '@/composables/useJobQueue'

const props = defineProps<{
  open: boolean
  /** Viewport coords for the trigger button (getBoundingClientRect) */
  anchor?: { top: number; left: number; right: number; bottom: number; width: number }
}>()

const emit = defineEmits<{ close: [] }>()

const PANEL_WIDTH = 320
const GAP = 6

const {
  current,
  pending,
  recentDone,
  pendingCount,
  paused,
  pause,
  resume,
  remove,
  move,
  clearPending,
  cancelCurrent
} = useJobQueue()

const panelStyle = computed(() => {
  const a = props.anchor
  if (!a || typeof window === 'undefined') {
    return { top: '5.5rem', left: '1rem' }
  }
  const width = Math.min(PANEL_WIDTH, window.innerWidth - 16)
  let left = a.left
  // Prefer align under button start; keep fully on screen
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, a.right - width)
  }
  left = Math.max(8, left)
  const top = Math.min(a.bottom + GAP, window.innerHeight - 120)
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`
  }
})

function statusLabel(status: string): string {
  if (status === 'success') return 'Done'
  if (status === 'failed') return 'Failed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'running') return 'Running'
  return status
}

function statusClass(status: string): string {
  if (status === 'success') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'failed') return 'text-destructive'
  if (status === 'cancelled') return 'text-muted-foreground'
  if (status === 'running') return 'text-foreground font-medium'
  return 'text-muted-foreground'
}

function surfaceLabel(surface: string): string {
  const map: Record<string, string> = {
    text2image: 'Image',
    edit: 'Edit',
    video: 'Video',
    upscale: 'Upscale'
  }
  return map[surface] || surface
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    // Reposition if window scrolled while open (rare)
  }
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] titlebar-no-drag"
      aria-hidden="true"
      @pointerdown="emit('close')"
    />
    <Transition name="float-panel">
      <div
        v-if="open"
        role="dialog"
        aria-label="Job queue"
        class="aui-float-panel fixed z-[110] flex max-h-[min(72vh,26rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground titlebar-no-drag"
        :style="panelStyle"
        @pointerdown.stop
      >
        <header
          class="flex items-center justify-between gap-2 border-b border-border/70 px-3.5 py-3"
        >
          <div class="min-w-0">
            <h2 class="text-sm font-semibold tracking-tight text-foreground">Queue</h2>
            <p class="mt-0.5 text-xs leading-4 text-muted-foreground">
              <template v-if="current">Running</template>
              <template v-else>Idle</template>
              <template v-if="pendingCount"> · {{ pendingCount }} waiting</template>
              <template v-if="paused"> · paused</template>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              v-if="!paused"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="pause"
            >
              Pause
            </button>
            <button
              v-else
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              @click="resume"
            >
              Resume
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
          <section v-if="current">
            <p class="mb-1.5 text-[11px] font-medium text-muted-foreground">Now running</p>
            <div
              class="flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium leading-5 text-foreground">
                  {{ current.label }}
                </p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ surfaceLabel(current.surface) }}
                </p>
              </div>
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Cancel current"
                @click="cancelCurrent"
              >
                <Square class="size-3.5 fill-current" />
              </button>
            </div>
          </section>

          <section>
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <p class="text-[11px] font-medium text-muted-foreground">Waiting</p>
              <button
                v-if="pending.length"
                type="button"
                class="text-xs text-muted-foreground transition-colors hover:text-foreground"
                @click="clearPending"
              >
                Clear all
              </button>
            </div>
            <p
              v-if="!pending.length"
              class="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs leading-5 text-muted-foreground"
            >
              Nothing waiting. Press Generate while a job runs to add more.
            </p>
            <ul v-else class="space-y-1.5">
              <li
                v-for="(job, index) in pending"
                :key="job.id"
                class="flex items-center gap-1 rounded-lg border border-border/60 bg-background px-2 py-2"
              >
                <span
                  class="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-[11px] font-medium tabular-nums text-muted-foreground"
                >
                  {{ index + 1 }}
                </span>
                <div class="min-w-0 flex-1 px-1">
                  <p class="truncate text-sm font-medium leading-5 text-foreground">
                    {{ job.label }}
                  </p>
                  <p class="text-xs text-muted-foreground">{{ surfaceLabel(job.surface) }}</p>
                </div>
                <button
                  type="button"
                  class="aui-icon-button size-7 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                  :disabled="index === 0"
                  title="Move up"
                  @click="move(job.id, index - 1)"
                >
                  <ChevronUp class="size-3.5" />
                </button>
                <button
                  type="button"
                  class="aui-icon-button size-7 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                  :disabled="index >= pending.length - 1"
                  title="Move down"
                  @click="move(job.id, index + 1)"
                >
                  <ChevronDown class="size-3.5" />
                </button>
                <button
                  type="button"
                  class="aui-icon-button size-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove"
                  @click="remove(job.id)"
                >
                  <X class="size-3.5" />
                </button>
              </li>
            </ul>
          </section>

          <section v-if="recentDone.length">
            <p class="mb-1.5 text-[11px] font-medium text-muted-foreground">Recent</p>
            <ul class="divide-y divide-border/50 rounded-lg border border-border/50">
              <li
                v-for="job in recentDone"
                :key="job.id"
                class="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <span class="min-w-0 truncate text-foreground/90">{{ job.label }}</span>
                <span class="shrink-0" :class="statusClass(job.status)">{{
                  statusLabel(job.status)
                }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
