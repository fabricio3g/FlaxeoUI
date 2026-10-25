<script setup lang="ts">
/** Sessions column: start a new one, switch, rename, delete. */
import { ref } from 'vue'
import { Image, MoreHorizontal, Plus } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getOutputUrl } from '@/services/api'
import { requestConfirm } from '@/composables/useConfirm'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/composables/useToast'
import type { SessionSummary } from '../../../../shared/sessions'

const sessions = useSessionsStore()
const toast = useToast()
const renaming = ref('')
const draftName = ref('')

function when(time: number): string {
  const days = Math.floor((Date.now() - time) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function startRename(summary: SessionSummary): void {
  renaming.value = summary.id
  draftName.value = summary.title
}

async function commitRename(): Promise<void> {
  const id = renaming.value
  renaming.value = ''
  if (!id) return
  if (sessions.activeId !== id) await sessions.open(id)
  await sessions.rename(draftName.value)
}

async function remove(summary: SessionSummary): Promise<void> {
  const ok = await requestConfirm({
    title: `Delete "${summary.title}"?`,
    message: 'The session is removed. Its images stay in Assets.',
    confirmLabel: 'Delete'
  })
  if (!ok) return
  try {
    await sessions.remove(summary.id)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not delete the session')
  }
}
</script>

<template>
  <nav class="flex h-full min-h-0 flex-col" aria-label="Sessions">
    <div class="flex h-10 shrink-0 items-center justify-between px-3 pt-2">
      <h2 class="text-[13px] font-medium">Sessions</h2>
      <button
        type="button"
        class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-accent"
        @click="sessions.start()"
      >
        <Plus class="size-3.5" /> New
      </button>
    </div>
    <ul class="min-h-0 flex-1 space-y-px overflow-y-auto px-2 pb-3">
      <li
        v-if="sessions.active && !sessions.summaries.some((s) => s.id === sessions.activeId)"
        class="flex items-center gap-2.5 rounded-md bg-accent px-2 py-1.5"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded bg-muted">
          <Image class="size-4 text-muted-foreground" />
        </span>
        <span class="min-w-0 text-[13px]">New session</span>
      </li>
      <li v-for="summary in sessions.summaries" :key="summary.id" class="group relative">
        <input
          v-if="renaming === summary.id"
          v-model="draftName"
          class="h-12 w-full rounded-md border border-input bg-background px-2 text-[13px]"
          aria-label="Session name"
          autofocus
          @keydown.enter="commitRename"
          @keydown.esc="renaming = ''"
          @blur="commitRename"
        />
        <button
          v-else
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 pr-8 text-left hover:bg-accent"
          :class="summary.id === sessions.activeId && 'bg-accent'"
          :aria-current="summary.id === sessions.activeId ? 'page' : undefined"
          @click="sessions.open(summary.id)"
        >
          <img
            v-if="summary.cover"
            :src="getOutputUrl(summary.cover)"
            alt=""
            loading="lazy"
            class="size-9 shrink-0 rounded object-cover"
          />
          <span v-else class="flex size-9 shrink-0 items-center justify-center rounded bg-muted">
            <Image class="size-4 text-muted-foreground" />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-[13px]">{{ summary.title }}</span>
            <span class="block text-xs text-muted-foreground"
              >{{ when(summary.updatedAt) }} · {{ summary.count }}</span
            >
          </span>
        </button>
        <Popover v-if="renaming !== summary.id">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="aui-icon-button absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              :aria-label="`Actions for ${summary.title}`"
              v-tip="'Rename or delete'"
            >
              <MoreHorizontal class="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" class="w-36 p-1 text-[13px]">
            <button
              type="button"
              class="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-accent"
              @click="startRename(summary)"
            >
              Rename
            </button>
            <button
              type="button"
              class="w-full rounded-md px-2.5 py-1.5 text-left text-destructive hover:bg-accent"
              @click="remove(summary)"
            >
              Delete
            </button>
          </PopoverContent>
        </Popover>
      </li>
    </ul>
  </nav>
</template>
