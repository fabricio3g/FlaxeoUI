<script setup lang="ts">
import { ChevronDown, ChevronUp, Square, X } from '@/lib/icons'
import { useJobQueue } from '@/composables/useJobQueue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

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

function statusClass(status: string): string {
  if (status === 'success') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'failed') return 'text-destructive'
  if (status === 'cancelled') return 'text-muted-foreground'
  if (status === 'running') return 'text-foreground'
  return 'text-muted-foreground'
}
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
        class="aui-float-panel fixed left-3 top-24 z-[110] flex max-h-[min(70vh,28rem)] w-[min(calc(100vw-1.5rem),22rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground titlebar-no-drag md:left-16 md:top-20"
        @pointerdown.stop
      >
        <header class="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-xs font-semibold tracking-tight">Queue</h2>
              <span class="text-[10px] tabular-nums text-muted-foreground">
                {{ current ? '1 running' : 'Idle'
                }}<template v-if="pendingCount"> · {{ pendingCount }} queued</template>
                <template v-if="paused"> · paused</template>
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              v-if="!paused"
              type="button"
              class="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              @click="pause"
            >
              Pause
            </button>
            <button
              v-else
              type="button"
              class="rounded-md px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted"
              @click="resume"
            >
              Resume
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="size-3.5" />
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
          <section v-if="current">
            <p class="mb-1 px-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Now
            </p>
            <div
              class="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/25 px-2.5 py-2"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-[11px] font-medium">{{ current.label }}</p>
                <p class="text-[9px] capitalize text-muted-foreground">{{ current.surface }}</p>
              </div>
              <button
                type="button"
                class="aui-icon-button inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Cancel current"
                @click="cancelCurrent"
              >
                <Square class="size-3 fill-current" />
              </button>
            </div>
          </section>

          <section>
            <div class="mb-1 flex items-center justify-between px-1">
              <p class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Up next
              </p>
              <button
                v-if="pending.length"
                type="button"
                class="text-[9px] text-muted-foreground hover:text-foreground"
                @click="clearPending"
              >
                Clear
              </button>
            </div>
            <p v-if="!pending.length" class="px-1 py-3 text-[11px] text-muted-foreground">
              Empty — generate while busy to queue more.
            </p>
            <ul v-else class="space-y-1">
              <li
                v-for="(job, index) in pending"
                :key="job.id"
                class="flex items-center gap-0.5 rounded-lg border border-border/40 bg-background px-1.5 py-1.5"
              >
                <div class="min-w-0 flex-1 px-1">
                  <p class="truncate text-[11px] font-medium">{{ job.label }}</p>
                  <p class="text-[9px] capitalize text-muted-foreground">{{ job.surface }}</p>
                </div>
                <button
                  type="button"
                  class="aui-icon-button size-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                  :disabled="index === 0"
                  @click="move(job.id, index - 1)"
                >
                  <ChevronUp class="size-3" />
                </button>
                <button
                  type="button"
                  class="aui-icon-button size-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                  :disabled="index >= pending.length - 1"
                  @click="move(job.id, index + 1)"
                >
                  <ChevronDown class="size-3" />
                </button>
                <button
                  type="button"
                  class="aui-icon-button size-6 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  @click="remove(job.id)"
                >
                  <X class="size-3" />
                </button>
              </li>
            </ul>
          </section>

          <section v-if="recentDone.length">
            <p class="mb-1 px-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Recent
            </p>
            <ul class="space-y-0.5">
              <li
                v-for="job in recentDone"
                :key="job.id"
                class="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[10px]"
              >
                <span class="min-w-0 truncate text-muted-foreground">{{ job.label }}</span>
                <span class="shrink-0 capitalize" :class="statusClass(job.status)">{{
                  job.status
                }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
