<script setup lang="ts">
/**
 * Browse online: search Hugging Face or Civitai, see a model's pictures (shown from the
 * source, never saved), pick a file and quantization, and download it into the right
 * models/ folder through the regular download queue.
 */
import { computed, ref, watch } from 'vue'
import { ArrowLeft, Download, ExternalLink, Loader2, Search } from '@/lib/icons'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import { apiGet } from '@/services/api'
import { useModels } from '@/composables/useModels'
import { useModelDownloads, downloadKey } from '@/composables/useModelDownloads'
import { useToast } from '@/composables/useToast'
import type { HubFile } from '@/lib/starterPacks'
import { isHubFileInstalled } from '@/lib/hubInstall'
import {
  CIVITAI_TYPES,
  quantOf,
  type HubFileEntry,
  type HubItem,
  type HubSource
} from '../../../../shared/modelHub'

const props = defineProps<{
  categoryOptions: Array<{ label: string; value: string }>
  canDownload: boolean
}>()

const toast = useToast()
const { models, fetchModels } = useModels()
const downloads = useModelDownloads()

const source = ref<HubSource>('huggingface')
const query = ref('')
const civitaiType = ref('Checkpoint')
const items = ref<HubItem[]>([])
const loading = ref(false)
const error = ref('')
const selected = ref<HubItem | null>(null)
const hfFiles = ref<HubFileEntry[]>([])
const filesLoading = ref(false)
const versionId = ref('')
/** Folder per file, editable before downloading */
const categories = ref<Record<string, string>>({})

let searchSeq = 0
async function search(): Promise<void> {
  const seq = ++searchSeq
  error.value = ''
  selected.value = null
  if (source.value === 'huggingface' && !query.value.trim()) {
    items.value = []
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams({ source: source.value, q: query.value.trim() })
    if (source.value === 'civitai') params.set('type', civitaiType.value)
    const data = await apiGet<{ items: HubItem[] }>(`/api/hub/search?${params}`)
    if (seq === searchSeq) items.value = data.items
  } catch (e) {
    if (seq === searchSeq) {
      items.value = []
      error.value = e instanceof Error ? e.message : 'Search failed'
    }
  } finally {
    if (seq === searchSeq) loading.value = false
  }
}

watch(source, () => {
  items.value = []
  void search()
})
watch(civitaiType, () => void search())

async function open(item: HubItem): Promise<void> {
  selected.value = item
  versionId.value = item.versions[0]?.id || ''
  hfFiles.value = []
  if (item.source !== 'huggingface') return
  filesLoading.value = true
  try {
    const data = await apiGet<{ files: HubFileEntry[] }>(
      `/api/hub/hf-files?repo=${encodeURIComponent(item.id)}`
    )
    if (selected.value?.id === item.id) hfFiles.value = data.files
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not list the files')
  } finally {
    filesLoading.value = false
  }
}

const version = computed(() => selected.value?.versions.find((v) => v.id === versionId.value))
const files = computed<HubFileEntry[]>(() =>
  selected.value?.source === 'civitai' ? version.value?.files || [] : hfFiles.value
)

const fileName = (f: HubFileEntry): string => f.name.split('/').pop() || f.name
const categoryOf = (f: HubFileEntry): string => categories.value[f.url] || f.category

function asHubFile(f: HubFileEntry): HubFile {
  return {
    label: fileName(f),
    category: categoryOf(f),
    filename: fileName(f),
    url: f.url,
    required: true
  }
}

const installed = (f: HubFileEntry): boolean => isHubFileInstalled(asHubFile(f), models.value)

async function download(f: HubFileEntry): Promise<void> {
  const file = asHubFile(f)
  const result = await downloads.downloadFiles([file])
  if (result.ok) {
    toast.success(`Downloaded ${file.filename}`)
    void fetchModels({ force: true })
  } else toast.error(downloads.fileStatus.value[downloadKey(file)] || 'Download failed')
}

function size(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

const count = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <section
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8"
      :class="selected ? 'hidden lg:block' : ''"
    >
      <form class="flex flex-wrap items-center gap-2" @submit.prevent="search">
        <SegmentedControl
          v-model="source"
          :options="[
            { label: 'Hugging Face', value: 'huggingface' },
            { label: 'Civitai', value: 'civitai' }
          ]"
          aria-label="Source"
        />
        <label class="relative flex min-w-0 max-w-sm flex-1 items-center">
          <Search class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <input
            v-model="query"
            :placeholder="
              source === 'huggingface' ? 'Search repos (flux gguf, wan, qwen…)' : 'Search Civitai'
            "
            aria-label="Search online"
            class="h-8 w-full rounded-full border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/25"
          />
        </label>
        <Select
          v-if="source === 'civitai'"
          v-model="civitaiType"
          size="sm"
          :options="CIVITAI_TYPES.map((t) => ({ label: t.label, value: t.id }))"
          class="w-40"
        />
        <button
          type="submit"
          class="inline-flex h-8 items-center rounded-full bg-foreground px-4 text-xs font-medium text-background"
        >
          Search
        </button>
      </form>
      <p class="mt-2 text-xs text-muted-foreground">
        <template v-if="source === 'huggingface'"
          >GGUF and single-file repos sd.cpp can load. Pick a quantization that fits your VRAM: Q4
          for 6–8 GB, Q5–Q6 for 10–12 GB, Q8 or F16 for 16 GB and up.</template
        >
        <template v-else
          >Checkpoints and LoRAs for SD 1.5, SDXL, FLUX and more. Safe-for-work results
          only.</template
        >
      </p>

      <p v-if="error" class="mt-6 text-sm text-destructive">{{ error }}</p>
      <p v-else-if="loading" class="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 class="size-4 animate-spin" /> Searching…
      </p>
      <p v-else-if="!items.length" class="py-16 text-center text-sm text-muted-foreground">
        {{
          source === 'huggingface' && !query.trim()
            ? 'Search Hugging Face for a model.'
            : 'Nothing found. Try other words.'
        }}
      </p>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="item in items"
          :key="item.source + item.id"
          type="button"
          class="overflow-hidden rounded-xl border text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          :class="selected?.id === item.id ? 'border-foreground/40' : 'border-border/70'"
          @click="open(item)"
        >
          <div class="aspect-[16/9] bg-muted">
            <img
              v-if="item.image"
              :src="item.image"
              :alt="item.name"
              loading="lazy"
              referrerpolicy="no-referrer"
              class="size-full object-cover"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
          </div>
          <div class="p-3">
            <p class="truncate text-sm font-medium" :title="item.name">{{ item.name }}</p>
            <p class="truncate text-xs text-muted-foreground">
              {{ item.type }} · {{ item.author }} · {{ count(item.downloads) }} downloads
            </p>
          </div>
        </button>
      </div>
    </section>

    <aside
      v-if="selected"
      class="min-h-0 w-full overflow-y-auto border-l border-border/70 px-4 py-4 md:px-6 lg:w-[30rem] lg:shrink-0"
      :aria-label="`${selected.name} files`"
    >
      <button
        type="button"
        class="mb-3 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-muted-foreground hover:bg-accent"
        @click="selected = null"
      >
        <ArrowLeft class="size-4" /> Results
      </button>
      <div class="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
        <img
          v-if="selected.image"
          :src="selected.image"
          :alt="selected.name"
          referrerpolicy="no-referrer"
          class="size-full object-cover"
        />
      </div>
      <h2 class="mt-3 text-lg font-semibold">{{ selected.name }}</h2>
      <p class="text-sm text-muted-foreground">
        {{ selected.type }} · {{ selected.author }}
        <template v-if="selected.baseModel"> · from {{ selected.baseModel }}</template>
      </p>
      <a
        :href="selected.page"
        target="_blank"
        rel="noopener"
        class="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        Open on {{ selected.source === 'civitai' ? 'Civitai' : 'Hugging Face' }}
        <ExternalLink class="size-3.5" />
      </a>

      <label v-if="selected.versions.length > 1" class="mt-4 block">
        <span class="mb-1 block text-xs text-muted-foreground">Version</span>
        <Select
          v-model="versionId"
          size="sm"
          :options="
            selected.versions.map((v) => ({
              label: `${v.name}${v.baseModel ? ` · ${v.baseModel}` : ''}`,
              value: v.id
            }))
          "
        />
      </label>
      <p v-else-if="version?.baseModel" class="mt-3 text-xs text-muted-foreground">
        For {{ version.baseModel }}
      </p>

      <h3 class="mt-5 text-sm font-medium">Files</h3>
      <p v-if="filesLoading" class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 class="size-4 animate-spin" /> Listing files…
      </p>
      <p v-else-if="!files.length" class="mt-2 text-sm text-muted-foreground">
        No model files sd.cpp can load here.
      </p>
      <ul class="mt-2 divide-y divide-border border-y border-border">
        <li v-for="f in files" :key="f.url" class="space-y-1.5 py-2.5">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm" :title="f.name">{{ fileName(f) }}</span>
            <span
              v-if="quantOf(fileName(f))"
              class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium"
              >{{ quantOf(fileName(f)) }}</span
            >
            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{
              size(f.size)
            }}</span>
          </div>
          <div class="flex items-center gap-2">
            <Select
              :model-value="categoryOf(f)"
              size="sm"
              class="min-w-0 flex-1"
              :options="props.categoryOptions"
              aria-label="Save into"
              @update:model-value="(v) => (categories[f.url] = String(v))"
            />
            <span v-if="installed(f)" class="shrink-0 text-xs font-medium text-success"
              >Installed</span
            >
            <span
              v-else-if="downloads.fileStatus.value[downloadKey(asHubFile(f))]"
              class="shrink-0 text-xs tabular-nums"
              :class="
                downloads.failed.value[downloadKey(asHubFile(f))]
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              "
              >{{ downloads.fileStatus.value[downloadKey(asHubFile(f))] }}</span
            >
            <button
              v-else-if="canDownload"
              type="button"
              class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"
              @click="download(f)"
            >
              <Download class="size-3.5" /> Download
            </button>
          </div>
        </li>
      </ul>
      <p v-if="!canDownload" class="mt-2 text-xs text-muted-foreground">
        Downloads can only be started on the desktop app.
      </p>
    </aside>
  </div>
</template>
