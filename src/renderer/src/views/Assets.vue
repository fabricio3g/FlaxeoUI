<script setup lang="ts">
/**
 * Assets: every file in the output folder. Open one to inspect its settings, or hand it to
 * Create to edit, animate or use as a reference.
 */
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Download,
  Film,
  FolderOpen,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2
} from '@/lib/icons'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { apiGet, apiPost, getOutputUrl } from '@/services/api'
import { requestConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { useRemoteSession } from '@/composables/useRemoteSession'
import { useConfigStore } from '@/stores/config'
import { isVideoFile } from '@/lib/graphUi'
import type { ImageGenerationParams } from '@/lib/imageParams'

const router = useRouter()
const toast = useToast()
const configStore = useConfigStore()
const { isRemote, canControl } = useRemoteSession()

const files = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const filter = ref<'all' | 'images' | 'videos' | 'uploads'>('all')
const query = ref('')
const shown = ref(120)
const viewerIndex = ref<number | null>(null)

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
  { value: 'uploads', label: 'Uploads' }
]

const isUpload = (file: string): boolean => /^(input|upload)_/i.test(file)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return files.value.filter((file) => {
    if (q && !file.toLowerCase().includes(q)) return false
    if (filter.value === 'videos') return isVideoFile(file)
    if (filter.value === 'uploads') return isUpload(file)
    if (filter.value === 'images') return !isVideoFile(file) && !isUpload(file)
    return !isUpload(file)
  })
})
const visible = computed(() => filtered.value.slice(0, shown.value))
const viewerFile = computed(() =>
  viewerIndex.value === null ? '' : filtered.value[viewerIndex.value] || ''
)

async function load(): Promise<void> {
  loading.value = true
  try {
    files.value = await apiGet<string[]>('/api/gallery')
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Assets are unavailable'
  } finally {
    loading.value = false
  }
}

function open(file: string): void {
  viewerIndex.value = filtered.value.indexOf(file)
}

function step(delta: number): void {
  if (viewerIndex.value === null || !filtered.value.length) return
  viewerIndex.value = (viewerIndex.value + delta + filtered.value.length) % filtered.value.length
}

function toCreate(key: 'edit' | 'animate' | 'reference', file: string): void {
  const mode = key === 'edit' ? 'edit' : key === 'animate' ? 'video' : 'image'
  void router.push({ name: 'Create', query: { mode, [key]: file } })
}

async function remove(file: string): Promise<void> {
  const ok = await requestConfirm({
    title: 'Delete this file?',
    message: `${file} will be removed from the output folder. This cannot be undone.`,
    confirmLabel: 'Delete'
  })
  if (!ok) return
  try {
    await apiPost('/api/delete', { filename: file })
    files.value = files.value.filter((f) => f !== file)
    if (viewerFile.value === file) viewerIndex.value = null
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not delete the file')
  }
}

function reuse(params: ImageGenerationParams, mode: 'seed' | 'all'): void {
  configStore.applyImageParams(params, mode)
  viewerIndex.value = null
  void router.push({
    name: 'Create',
    query: { mode: 'image', ...(params.prompt ? { prompt: params.prompt } : {}) }
  })
}

function openFolder(): void {
  window.electronAPI?.openGalleryFolder()
}

onMounted(load)
onActivated(load)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
      <h1 class="mr-2 text-base font-semibold">Assets</h1>
      <SegmentedControl v-model="filter" :options="FILTERS" size="sm" />
      <label class="flex h-8 w-48 items-center gap-2 rounded-md bg-muted px-2.5">
        <Search class="size-3.5 shrink-0 text-muted-foreground" />
        <input
          v-model="query"
          type="search"
          placeholder="File name"
          aria-label="Search assets"
          class="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      <span class="text-xs tabular-nums text-muted-foreground">{{ filtered.length }}</span>
      <div class="ml-auto flex items-center gap-1">
        <Tooltip text="Refresh the list">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Refresh"
            @click="load"
          >
            <RefreshCw class="size-4" :class="loading && 'animate-spin'" />
          </button>
        </Tooltip>
        <Tooltip v-if="!isRemote" text="Open the output folder">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Open the output folder"
            @click="openFolder"
          >
            <FolderOpen class="size-4" />
          </button>
        </Tooltip>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
      <p v-if="error" class="py-16 text-center text-[13px] text-destructive">{{ error }}</p>
      <div
        v-else-if="loading && !files.length"
        class="flex justify-center py-16 text-muted-foreground"
      >
        <Loader2 class="size-5 animate-spin" />
      </div>
      <p v-else-if="!filtered.length" class="py-16 text-center text-[14px] text-muted-foreground">
        {{
          files.length
            ? 'Nothing matches.'
            : 'Nothing here yet. What you make in Create lands here.'
        }}
      </p>

      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
        <div
          v-for="file in visible"
          :key="file"
          class="group relative aspect-square overflow-hidden rounded-lg bg-muted"
        >
          <video
            v-if="isVideoFile(file)"
            :src="getOutputUrl(file)"
            class="size-full object-cover"
            muted
            loop
            playsinline
            @mouseenter="($event.target as HTMLVideoElement).play()"
            @mouseleave="($event.target as HTMLVideoElement).pause()"
          />
          <button
            v-else
            type="button"
            class="block size-full"
            :aria-label="`Open ${file}`"
            @click="open(file)"
          >
            <img
              :src="getOutputUrl(file)"
              :alt="file"
              loading="lazy"
              class="size-full object-cover"
            />
          </button>
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <div
              class="pointer-events-auto flex rounded-lg bg-popover p-0.5 shadow-[var(--float-shadow)]"
            >
              <template v-if="!isVideoFile(file)">
                <button
                  type="button"
                  class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
                  aria-label="Edit in Create"
                  v-tip="'Edit'"
                  @click="toCreate('edit', file)"
                >
                  <Pencil class="size-3.5" />
                </button>
                <button
                  type="button"
                  class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
                  aria-label="Animate in Create"
                  v-tip="'Animate'"
                  @click="toCreate('animate', file)"
                >
                  <Film class="size-3.5" />
                </button>
                <button
                  type="button"
                  class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
                  aria-label="Use as reference in Create"
                  v-tip="'Use as reference'"
                  @click="toCreate('reference', file)"
                >
                  <ImagePlus class="size-3.5" />
                </button>
              </template>
              <a
                :href="getOutputUrl(file)"
                :download="file"
                class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Download"
                v-tip="'Download'"
              >
                <Download class="size-3.5" />
              </a>
              <button
                v-if="canControl"
                type="button"
                class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-destructive hover:bg-accent"
                aria-label="Delete"
                v-tip="'Delete'"
                @click="remove(file)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filtered.length > shown" class="flex justify-center pt-4">
        <button
          type="button"
          class="h-8 rounded-md px-3 text-[13px] hover:bg-accent"
          @click="shown += 120"
        >
          Show more
        </button>
      </div>
    </div>

    <Teleport to="body">
      <ImageViewer
        v-if="viewerFile"
        :src="getOutputUrl(viewerFile)"
        :filename="viewerFile"
        :alt="viewerFile"
        @close="viewerIndex = null"
        @prev="step(-1)"
        @next="step(1)"
        @reuse-seed="reuse($event, 'seed')"
        @reuse-all="reuse($event, 'all')"
      />
    </Teleport>
  </div>
</template>
