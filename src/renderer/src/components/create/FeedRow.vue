<script setup lang="ts">
/** One generation in the session feed: what was asked, with what, and the results. */
import { computed } from 'vue'
import {
  AlertTriangle,
  Download,
  Expand,
  Film,
  ImagePlus,
  Maximize2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2
} from '@/lib/icons'
import Tooltip from '@/components/ui/Tooltip.vue'
import { getOutputUrl } from '@/services/api'
import { isVideoFile } from '@/lib/graphUi'
import type { SessionRow } from '../../../../shared/sessions'

const props = defineProps<{
  row: SessionRow
  /** This row is the job running now */
  live: boolean
  previewImage: string | null
  progressLabel: string
  progressPercent: number
}>()

const emit = defineEmits<{
  view: [files: string[], index: number]
  edit: [file: string]
  animate: [file: string]
  upscale: [file: string]
  reference: [file: string]
  reuse: [row: SessionRow]
  retry: [row: SessionRow]
  remove: [row: SessionRow]
}>()

const MODE_LABEL = { image: 'Image', edit: 'Edit', video: 'Video' } as const

const meta = computed(() => {
  const r = props.row
  const parts = [MODE_LABEL[r.mode], r.model]
  if (r.width && r.height) parts.push(`${r.width}×${r.height}`)
  if (r.seed >= 0) parts.push(`seed ${r.seed}`)
  if (r.finishedAt && r.status === 'done') {
    parts.push(`${Math.max(1, Math.round((r.finishedAt - r.startedAt) / 1000))}s`)
  }
  if (r.by) parts.push(r.by)
  return parts.filter(Boolean).join(' · ')
})

const placeholders = computed(() =>
  props.row.status === 'running' ? Math.max(1, props.row.mode === 'video' ? 1 : props.row.count) : 0
)

function onDragStart(event: DragEvent, file: string): void {
  event.dataTransfer?.setData('application/x-flaxeo-output', file)
  event.dataTransfer?.setData('text/plain', file)
}
</script>

<template>
  <article class="group/row border-b border-border py-5 last:border-b-0">
    <header class="flex items-start gap-4">
      <div class="min-w-0 flex-1">
        <p
          class="line-clamp-2 text-[14px] leading-6"
          :class="!row.prompt && 'text-muted-foreground'"
        >
          {{ row.prompt || 'No prompt' }}
        </p>
        <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ meta }}</p>
      </div>
      <div
        v-if="row.inputs.length"
        class="hidden shrink-0 -space-x-2 sm:flex"
        :aria-label="`${row.inputs.length} attached images`"
      >
        <img
          v-for="input in row.inputs.slice(0, 4)"
          :key="input.file"
          :src="getOutputUrl(input.file)"
          :alt="input.role"
          :title="input.role"
          class="size-8 rounded-md border-2 border-background object-cover"
        />
      </div>
      <div
        class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100"
      >
        <Tooltip text="Load prompt and settings">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Reuse prompt and settings"
            @click="emit('reuse', row)"
          >
            <RotateCcw class="size-4" />
          </button>
        </Tooltip>
        <Tooltip text="Run again">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Run again"
            :disabled="row.status === 'running'"
            @click="emit('retry', row)"
          >
            <RefreshCw class="size-4" />
          </button>
        </Tooltip>
        <Tooltip text="Remove from session (files stay in Assets)">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
            aria-label="Remove from session"
            :disabled="row.status === 'running'"
            @click="emit('remove', row)"
          >
            <Trash2 class="size-4" />
          </button>
        </Tooltip>
      </div>
    </header>

    <div v-if="row.status === 'failed'" class="mt-3 flex items-start gap-2 text-[13px]">
      <AlertTriangle class="mt-0.5 size-4 shrink-0 text-destructive" />
      <p class="min-w-0 whitespace-pre-line text-destructive">{{ row.error || 'It failed.' }}</p>
    </div>
    <p v-else-if="row.status === 'cancelled'" class="mt-3 text-[13px] text-muted-foreground">
      Stopped.
    </p>

    <div v-if="row.outputs.length || placeholders" class="mt-3 flex gap-2 overflow-x-auto pb-1">
      <div
        v-for="(file, index) in row.outputs"
        :key="file"
        class="group/tile relative h-56 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-64"
        draggable="true"
        @dragstart="onDragStart($event, file)"
      >
        <video
          v-if="isVideoFile(file)"
          :src="getOutputUrl(file)"
          class="h-full w-auto"
          controls
          loop
          muted
          playsinline
        />
        <button
          v-else
          type="button"
          class="block h-full"
          :aria-label="`Open result ${index + 1}`"
          @click="emit('view', row.outputs, index)"
        >
          <img
            :src="getOutputUrl(file)"
            :alt="row.prompt"
            loading="lazy"
            class="h-full w-auto max-w-none object-contain"
          />
        </button>
        <div
          v-if="!isVideoFile(file)"
          class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-0.5 p-2 opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-within/tile:opacity-100"
        >
          <div
            class="pointer-events-auto flex rounded-lg bg-popover p-0.5 shadow-[var(--float-shadow)]"
          >
            <Tooltip text="View">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="View"
                @click="emit('view', row.outputs, index)"
              >
                <Expand class="size-4" />
              </button>
            </Tooltip>
            <Tooltip text="Edit">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Edit this image"
                @click="emit('edit', file)"
              >
                <Pencil class="size-4" />
              </button>
            </Tooltip>
            <Tooltip text="Animate">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Animate this image"
                @click="emit('animate', file)"
              >
                <Film class="size-4" />
              </button>
            </Tooltip>
            <Tooltip text="Upscale">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Upscale this image"
                @click="emit('upscale', file)"
              >
                <Maximize2 class="size-4" />
              </button>
            </Tooltip>
            <Tooltip text="Use as reference">
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Use as reference"
                @click="emit('reference', file)"
              >
                <ImagePlus class="size-4" />
              </button>
            </Tooltip>
            <Tooltip text="Download">
              <a
                :href="getOutputUrl(file)"
                :download="file"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Download"
              >
                <Download class="size-4" />
              </a>
            </Tooltip>
          </div>
        </div>
      </div>

      <div
        v-for="n in placeholders"
        :key="`pending-${n}`"
        class="relative flex h-56 shrink-0 items-end overflow-hidden rounded-lg bg-muted sm:h-64"
        :style="{ aspectRatio: `${row.width || 1} / ${row.height || 1}` }"
      >
        <img
          v-if="live && previewImage && n === 1"
          :src="previewImage"
          alt="Live preview"
          class="absolute inset-0 size-full object-cover"
        />
        <div v-else class="absolute inset-0 animate-pulse bg-accent" />
        <div class="relative w-full p-2.5">
          <p class="text-xs tabular-nums text-muted-foreground">
            {{ live ? progressLabel || 'Starting…' : 'Waiting in queue' }}
          </p>
          <div v-if="live" class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-border">
            <div
              class="h-full bg-brand transition-[width] duration-300"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
