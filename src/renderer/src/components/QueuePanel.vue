<script setup lang="ts">
import { ChevronDown, ChevronUp, Square, X } from '@/lib/icons'
import { useJobQueue } from '@/composables/useJobQueue'

const props = defineProps<{ open: boolean }>()
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

function close(): void {
  emit('close')
}

function onBackdrop(e: PointerEvent): void {
  if (e.target === e.currentTarget) close()
}

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
    <Transition name="modal">
      <div
        v-if="open"
        class="aui-dialog-backdrop fixed inset-0 z-[200] flex items-end justify-center bg-foreground/25 p-3 backdrop-blur-[2px] sm:items-center"
        @pointerdown="onBackdrop"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="queue-title"
          class="aui-dialog-surface flex max-h-[min(80vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-none"
          @pointerdown.stop
        >
          <header class="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div>
              <h2 id="queue-title" class="text-sm font-semibold">Job queue</h2>
              <p class="text-[11px] text-muted-foreground">
                {{ current ? '1 running' : 'Idle' }}
                <template v-if="pendingCount"> · {{ pendingCount }} queued</template>
                <template v-if="paused"> · paused</template>
              </p>
            </div>
            <div class="flex items-center gap-1">
              <button
                v-if="!paused"
                type="button"
                class="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                @click="pause"
              >
                Pause
              </button>
              <button
                v-else
                type="button"
                class="rounded-md px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                @click="resume"
              >
                Resume
              </button>
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label="Close"
                @click="close"
              >
                <X class="size-4" />
              </button>
            </div>
          </header>

          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            <section v-if="current">
              <p class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Now
              </p>
              <div
                class="flex items-start justify-between gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5"
              >
                <div class="min-w-0">
                  <p class="truncate text-xs font-medium">{{ current.label }}</p>
                  <p class="mt-0.5 text-[10px] capitalize text-muted-foreground">
                    {{ current.surface }} · running
                  </p>
                </div>
                <button
                  type="button"
                  class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Cancel current"
                  @click="cancelCurrent"
                >
                  <Square class="size-3.5 fill-current" />
                </button>
              </div>
            </section>

            <section>
              <div class="mb-1.5 flex items-center justify-between">
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Up next
                </p>
                <button
                  v-if="pending.length"
                  type="button"
                  class="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                  @click="clearPending"
                >
                  Clear
                </button>
              </div>
              <p v-if="!pending.length" class="text-[11px] text-muted-foreground">
                No jobs queued. Generate while busy to add more.
              </p>
              <ul v-else class="space-y-1.5">
                <li
                  v-for="(job, index) in pending"
                  :key="job.id"
                  class="flex items-center gap-1 rounded-xl border border-border/50 bg-background px-2 py-2"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium">{{ job.label }}</p>
                    <p class="text-[10px] capitalize text-muted-foreground">{{ job.surface }}</p>
                  </div>
                  <button
                    type="button"
                    class="aui-icon-button size-7 rounded-md text-muted-foreground hover:bg-muted"
                    :disabled="index === 0"
                    title="Move up"
                    @click="move(job.id, index - 1)"
                  >
                    <ChevronUp class="size-3.5" />
                  </button>
                  <button
                    type="button"
                    class="aui-icon-button size-7 rounded-md text-muted-foreground hover:bg-muted"
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
              <p class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Recent
              </p>
              <ul class="space-y-1">
                <li
                  v-for="job in recentDone"
                  :key="job.id"
                  class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px]"
                >
                  <span class="min-w-0 truncate">{{ job.label }}</span>
                  <span class="shrink-0 capitalize" :class="statusClass(job.status)">{{
                    job.status
                  }}</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
