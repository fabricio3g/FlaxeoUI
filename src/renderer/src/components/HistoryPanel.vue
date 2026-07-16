<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { History, Trash2, X, Play, Image as ImageIcon } from '@/lib/icons'
import {
  useGenerationHistory,
  type GenerationHistoryEntry
} from '@/composables/useGenerationHistory'
import { useConfigStore } from '@/stores/config'
import { isConfigSnapshot } from '@/lib/configSnapshot'
import { useToast } from '@/composables/useToast'
import { requestStarterPrompt } from '@/lib/appEvents'
import { requestConfirm } from '@/composables/useConfirm'

const props = defineProps<{
  open: boolean
  anchor?: { top: number; left: number; right: number; bottom: number; width: number }
}>()

const emit = defineEmits<{ close: [] }>()

const PANEL_WIDTH = 360
const GAP = 6

const router = useRouter()
const toast = useToast()
const configStore = useConfigStore()
const { entries, clearHistory, removeEntry } = useGenerationHistory()

const list = computed(() => entries.value.slice(0, 40))

const panelStyle = computed(() => {
  const a = props.anchor
  if (!a || typeof window === 'undefined') {
    return { top: '5.5rem', right: '1rem', left: 'auto' }
  }
  const width = Math.min(PANEL_WIDTH, window.innerWidth - 16)
  // Prefer aligning under the trigger; clamp so the panel stays on-screen
  let left = a.left
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, a.right - width)
  }
  left = Math.max(8, left)

  const preferredTop = a.bottom + GAP
  const maxTop = Math.max(8, window.innerHeight - 160)
  // Drop below the button when possible; if near the bottom edge, still prefer below
  // but keep a minimum viewport gap so content remains usable
  const top = Math.min(preferredTop, maxTop)

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(180, window.innerHeight - top - 16)}px`
  }
})

function surfaceLabel(surface: string): string {
  const map: Record<string, string> = {
    text2image: 'Image',
    edit: 'Edit',
    video: 'Video',
    upscale: 'Upscale'
  }
  return map[surface] || surface
}

function statusLabel(status: string): string {
  if (status === 'success') return 'Done'
  if (status === 'failed') return 'Failed'
  if (status === 'cancelled') return 'Cancelled'
  return status
}

function statusClass(status: string): string {
  if (status === 'success') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'failed') return 'text-destructive'
  if (status === 'cancelled') return 'text-muted-foreground'
  return 'text-muted-foreground'
}

function formatHistoryTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function preview(text?: string, max = 100): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return '—'
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function openInGallery(entry: GenerationHistoryEntry): void {
  if (!entry.filename) return
  try {
    sessionStorage.setItem('galleryFocusFile', entry.filename)
  } catch {
    /* ignore */
  }
  emit('close')
  router.push({ name: 'Gallery' })
}

function rerun(entry: GenerationHistoryEntry): void {
  if (entry.configSnapshot && isConfigSnapshot(entry.configSnapshot)) {
    configStore.applyConfigSnapshot(entry.configSnapshot)
  }

  if (entry.surface === 'upscale' && entry.filename) {
    try {
      sessionStorage.setItem('galleryFocusFile', entry.filename)
      sessionStorage.setItem('galleryOpenUpscale', '1')
    } catch {
      /* ignore */
    }
    toast.info('Open Gallery to re-run upscale')
    emit('close')
    router.push({ name: 'Gallery' })
    return
  }

  if (entry.prompt) {
    try {
      sessionStorage.setItem('text2imagePrompt', entry.prompt)
    } catch {
      /* ignore */
    }
  }
  if (entry.negativePrompt) {
    try {
      sessionStorage.setItem('text2imageNegativePrompt', entry.negativePrompt)
    } catch {
      /* ignore */
    }
  }

  const routeName =
    entry.surface === 'edit' ? 'Edit' : entry.surface === 'video' ? 'Video' : 'Text2Image'

  if (entry.surface === 'text2image' && entry.prompt) {
    requestStarterPrompt({ prompt: entry.prompt, fromOnboarding: false })
  }

  toast.success('Settings restored — ready to re-run')
  emit('close')
  router.push({ name: routeName })
}

function remove(id: string): void {
  removeEntry(id)
}

async function clearAll(): Promise<void> {
  if (!list.value.length) return
  const ok = await requestConfirm({
    title: 'Clear history',
    message: 'Clear all generation history? This only removes the list, not gallery files.',
    confirmLabel: 'Clear all',
    danger: true
  })
  if (!ok) return
  clearHistory()
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
        aria-label="Generation history"
        class="aui-float-panel fixed z-[110] flex max-h-[min(72vh,28rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground titlebar-no-drag"
        :style="panelStyle"
        @pointerdown.stop
      >
        <header
          class="aui-scroll-header aui-scroll-header--popover aui-scroll-header--compact flex items-center justify-between gap-2 bg-popover px-3.5 py-3"
        >
          <div class="min-w-0">
            <h2
              class="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
            >
              <History class="size-4 text-muted-foreground" />
              History
            </h2>
            <p class="mt-0.5 text-xs leading-4 text-muted-foreground">
              <template v-if="list.length"
                >{{ list.length }} recent job{{ list.length === 1 ? '' : 's' }}</template
              >
              <template v-else>No jobs yet</template>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              v-if="list.length"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="clearAll"
            >
              Clear
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
          <div class="aui-scroll-header__fade" aria-hidden="true" />
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <p
            v-if="!list.length"
            class="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm leading-5 text-muted-foreground"
          >
            Generations will show up here. Re-run restores settings.
          </p>
          <ul v-else class="space-y-1.5">
            <li
              v-for="entry in list"
              :key="entry.id"
              class="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2.5"
            >
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span class="text-xs font-medium" :class="statusClass(entry.status)">
                      {{ statusLabel(entry.status) }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {{ surfaceLabel(entry.surface) }}
                    </span>
                    <span class="text-xs tabular-nums text-muted-foreground">
                      {{ formatHistoryTime(entry.timestamp) }}
                    </span>
                    <span
                      v-if="entry.durationMs"
                      class="text-xs tabular-nums text-muted-foreground"
                    >
                      · {{ formatDuration(entry.durationMs) }}
                    </span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-sm leading-5 text-foreground/90">
                    {{ preview(entry.prompt || entry.filename || entry.error) }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      v-if="entry.configSnapshot || entry.prompt"
                      type="button"
                      class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      @click="rerun(entry)"
                    >
                      <Play class="size-3" />
                      Re-run
                    </button>
                    <button
                      v-if="entry.filename"
                      type="button"
                      class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      @click="openInGallery(entry)"
                    >
                      <ImageIcon class="size-3" />
                      Open
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove"
                  @click="remove(entry.id)"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
