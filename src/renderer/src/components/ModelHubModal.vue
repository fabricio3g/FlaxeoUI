<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  Check,
  ChevronLeft,
  Download,
  ExternalLink,
  Loader2,
  Search,
  X
} from '@/lib/icons'
import { useConfigStore } from '@/stores/config'
import { apiPost } from '@/services/api'
import { useModels } from '@/composables/useModels'
import {
  enrichHubModel,
  filterHubModels,
  hubModels,
  type HubFile,
  type HubFilterKind,
  type HubModel
} from '@/lib/starterPacks'
import { getPackInstallStatus, isHubFileInstalled } from '@/lib/hubInstall'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()
const toast = useToast()
const configStore = useConfigStore()
const { models, fetchModels } = useModels()

const query = ref('')
const filter = ref<HubFilterKind>('all')
const activeModelId = ref(hubModels[0]?.id || 'flux1-dev')
const mobileShowDetail = ref(false)
const downloading = ref<string | null>(null)
const downloadStatus = ref<Record<string, string>>({})

const packs = computed(() => hubModels.map(enrichHubModel))

const filteredPacks = computed(() =>
  filterHubModels(packs.value, {
    query: query.value,
    filter: filter.value,
    isReady: (m) => getPackInstallStatus(m, models.value).ready
  })
)

const featuredPacks = computed(() =>
  filteredPacks.value.filter((m) => m.featured && filter.value === 'all' && !query.value.trim())
)

const gridPacks = computed(() => {
  if (filter.value === 'all' && !query.value.trim()) {
    return filteredPacks.value.filter((m) => !m.featured)
  }
  return filteredPacks.value
})

const activeModel = computed(
  () => packs.value.find((model) => model.id === activeModelId.value) || packs.value[0]
)

const activePackStatus = computed(() => getPackInstallStatus(activeModel.value, models.value))

const filterChips: { id: HubFilterKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Image' },
  { id: 'edit', label: 'Edit' },
  { id: 'video', label: 'Video' },
  { id: 'installed', label: 'Installed' }
]

function kindLabel(kind?: string): string {
  if (kind === 'edit') return 'Edit'
  if (kind === 'video') return 'Video'
  if (kind === 'image') return 'Image'
  return 'Other'
}

function fileInstalled(file: HubFile): boolean {
  return isHubFileInstalled(file, models.value)
}

function packReady(model: HubModel): boolean {
  return getPackInstallStatus(model, models.value).ready
}

function packStatus(model: HubModel) {
  return getPackInstallStatus(model, models.value)
}

function selectPack(id: string): void {
  activeModelId.value = id
  mobileShowDetail.value = true
}

function close(): void {
  mobileShowDetail.value = false
  emit('close')
}

function onBackdropPointerDown(event: PointerEvent): void {
  if (event.target === event.currentTarget) close()
}

function applyPreset(model = activeModel.value): void {
  configStore.applyPreset(model.presetId)
  toast.success(`Applied ${model.name}`)
}

async function downloadFile(file: HubFile): Promise<void> {
  const key = `${file.category}/${file.filename}`
  downloading.value = key
  downloadStatus.value[key] = 'Downloading…'
  try {
    await apiPost('/api/models/download', file)
    downloadStatus.value[key] = 'Downloaded'
    await fetchModels({ force: true })
  } catch (error) {
    downloadStatus.value[key] = error instanceof Error ? error.message : 'Download failed'
  } finally {
    downloading.value = null
  }
}

async function downloadPack(): Promise<void> {
  applyPreset()
  for (const file of activeModel.value.files) {
    if (fileInstalled(file)) continue
    await downloadFile(file)
  }
  await fetchModels({ force: true })
  if (packReady(activeModel.value)) {
    toast.success(`${activeModel.value.name} ready`)
  }
}

async function downloadMissing(): Promise<void> {
  const missing = activeModel.value.files.filter((f) => !fileInstalled(f))
  if (!missing.length) {
    toast.info('All files already on disk')
    return
  }
  for (const file of missing) {
    await downloadFile(file)
  }
  await fetchModels({ force: true })
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (mobileShowDetail.value) {
      mobileShowDetail.value = false
      return
    }
    close()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onKeydown)
      fetchModels({ force: true }).catch(() => undefined)
      mobileShowDetail.value = false
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="aui-dialog-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-foreground/30 p-3 backdrop-blur-sm titlebar-no-drag sm:p-6"
        @pointerdown="onBackdropPointerDown"
      >
        <Transition name="modal-surface" appear>
          <div
            v-if="open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-hub-title"
            class="aui-dialog-surface relative flex h-[min(92vh,880px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-xl shadow-black/15 dark:shadow-black/40"
            @pointerdown.stop
          >
            <!-- Top bar -->
            <header class="flex shrink-0 flex-col gap-3 px-5 pb-4 pt-5 sm:px-6">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2
                    id="model-hub-title"
                    class="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  >
                    Model Hub
                  </h2>
                  <p class="mt-1.5 max-w-2xl text-base leading-6 text-muted-foreground">
                    A curated list based on the
                    <a
                      href="https://github.com/leejet/stable-diffusion.cpp/tree/master/docs"
                      target="_blank"
                      rel="noreferrer"
                      class="font-medium text-foreground underline-offset-2 hover:underline"
                      >stable-diffusion.cpp documentation</a
                    >
                    — not a full marketplace. Download installs into your models folders.
                  </p>
                </div>
                <Tooltip text="Close" position="bottom">
                  <button
                    type="button"
                    class="aui-icon-button inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close model hub"
                    @click="close"
                  >
                    <X class="size-5" />
                  </button>
                </Tooltip>
              </div>

              <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div
                  class="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-muted/40 px-3.5 dark:bg-muted/70"
                >
                  <Search class="size-5 shrink-0 text-muted-foreground" />
                  <input
                    v-model="query"
                    type="search"
                    autocomplete="off"
                    placeholder="Search packs…"
                    class="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    aria-label="Search packs"
                  />
                </div>
                <div
                  class="no-scrollbar flex shrink-0 gap-2 overflow-x-auto"
                  role="tablist"
                  aria-label="Pack filters"
                >
                  <button
                    v-for="chip in filterChips"
                    :key="chip.id"
                    type="button"
                    role="tab"
                    class="inline-flex h-10 shrink-0 items-center rounded-full px-4 text-base font-medium transition-colors"
                    :class="
                      filter === chip.id
                        ? 'bg-foreground text-background'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground dark:bg-muted/80 dark:hover:bg-muted'
                    "
                    :aria-selected="filter === chip.id"
                    @click="filter = chip.id"
                  >
                    {{ chip.label }}
                  </button>
                </div>
              </div>
            </header>

            <!-- Body: grid + detail -->
            <div class="flex min-h-0 flex-1">
              <!-- Browse column -->
              <section
                class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                :class="mobileShowDetail ? 'hidden md:flex' : 'flex'"
              >
                <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-6">
                  <p
                    v-if="!filteredPacks.length"
                    class="py-16 text-center text-base text-muted-foreground"
                  >
                    No packs match your search.
                  </p>

                  <template v-else>
                    <div v-if="featuredPacks.length" class="mb-7">
                      <p class="mb-3 text-sm font-medium text-muted-foreground">Recommended</p>
                      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <button
                          v-for="model in featuredPacks"
                          :key="'f-' + model.id"
                          type="button"
                          class="rounded-2xl p-4 text-left transition-colors"
                          :class="
                            activeModelId === model.id
                              ? 'bg-accent text-accent-foreground dark:bg-card dark:text-card-foreground dark:ring-1 dark:ring-foreground/20'
                              : 'bg-muted/40 hover:bg-muted/60 dark:bg-card dark:hover:bg-white/[0.08]'
                          "
                          @click="selectPack(model.id)"
                        >
                          <div class="flex items-start justify-between gap-2">
                            <span class="text-lg font-semibold tracking-tight">{{
                              model.name
                            }}</span>
                            <Check
                              v-if="packReady(model)"
                              class="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                              aria-label="Installed"
                            />
                          </div>
                          <p
                            class="mt-2 line-clamp-2 text-base leading-6"
                            :class="
                              activeModelId === model.id
                                ? 'text-accent-foreground/80 dark:text-muted-foreground'
                                : 'text-muted-foreground'
                            "
                          >
                            {{ model.blurb || model.description }}
                          </p>
                          <div
                            class="mt-3 flex flex-wrap items-center gap-2 text-sm"
                            :class="
                              activeModelId === model.id
                                ? 'text-accent-foreground/70 dark:text-muted-foreground'
                                : 'text-muted-foreground'
                            "
                          >
                            <span>{{ kindLabel(model.kind) }}</span>
                            <span v-if="model.minVramGb">≥{{ model.minVramGb }} GB VRAM</span>
                            <span v-if="model.sizeGb">~{{ model.sizeGb }} GB</span>
                            <span v-if="packStatus(model).total">
                              {{ packStatus(model).installed }}/{{ packStatus(model).total }} files
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>

                    <p
                      v-if="gridPacks.length && featuredPacks.length"
                      class="mb-3 text-sm font-medium text-muted-foreground"
                    >
                      All packs
                    </p>
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <button
                        v-for="model in gridPacks"
                        :key="model.id"
                        type="button"
                        class="rounded-2xl p-4 text-left transition-colors"
                        :class="
                          activeModelId === model.id
                            ? 'bg-accent text-accent-foreground dark:bg-card dark:text-card-foreground dark:ring-1 dark:ring-foreground/20'
                            : 'bg-muted/35 hover:bg-muted/55 dark:bg-card dark:hover:bg-white/[0.08]'
                        "
                        @click="selectPack(model.id)"
                      >
                        <div class="flex items-start justify-between gap-2">
                          <span class="text-lg font-semibold tracking-tight">{{
                            model.name
                          }}</span>
                          <Check
                            v-if="packReady(model)"
                            class="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-label="Installed"
                          />
                        </div>
                        <p
                          class="mt-2 line-clamp-2 text-base leading-6"
                          :class="
                            activeModelId === model.id
                              ? 'text-accent-foreground/80 dark:text-muted-foreground'
                              : 'text-muted-foreground'
                          "
                        >
                          {{ model.blurb || model.description }}
                        </p>
                        <div
                          class="mt-3 flex flex-wrap items-center gap-2 text-sm"
                          :class="
                            activeModelId === model.id
                              ? 'text-accent-foreground/70 dark:text-muted-foreground'
                              : 'text-muted-foreground'
                          "
                        >
                          <span>{{ kindLabel(model.kind) }}</span>
                          <span v-if="model.minVramGb">≥{{ model.minVramGb }} GB VRAM</span>
                          <span v-if="packStatus(model).total">
                            {{ packStatus(model).installed }}/{{ packStatus(model).total }} files
                          </span>
                        </div>
                      </button>
                    </div>
                  </template>
                </div>
              </section>

              <!-- Detail column -->
              <section
                class="flex min-h-0 w-full flex-col overflow-hidden md:w-[min(42%,28rem)] md:shrink-0"
                :class="mobileShowDetail ? 'flex' : 'hidden md:flex'"
              >
                <div class="flex items-center gap-1 px-4 py-2.5 md:hidden">
                  <button
                    type="button"
                    class="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    @click="mobileShowDetail = false"
                  >
                    <ChevronLeft class="size-5" />
                    Packs
                  </button>
                </div>

                <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 sm:px-6">
                  <div
                    v-if="activeModel"
                    class="space-y-5 rounded-2xl bg-muted/40 p-4 dark:bg-card sm:p-5"
                  >
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-2xl font-semibold tracking-tight">
                          {{ activeModel.name }}
                        </h3>
                        <span
                          v-if="activePackStatus.ready"
                          class="text-sm font-medium text-emerald-600 dark:text-emerald-400"
                        >
                          Installed
                        </span>
                        <span
                          v-else-if="activePackStatus.total"
                          class="text-sm text-muted-foreground"
                        >
                          {{ activePackStatus.installed }}/{{ activePackStatus.total }} on disk
                        </span>
                      </div>
                      <p class="mt-2.5 text-base leading-7 text-muted-foreground">
                        {{ activeModel.description }}
                      </p>
                      <p
                        v-if="activeModel.minVramGb || activeModel.sizeGb"
                        class="mt-2 text-sm text-muted-foreground"
                      >
                        <span v-if="activeModel.minVramGb"
                          >≥{{ activeModel.minVramGb }} GB VRAM</span
                        >
                        <span v-if="activeModel.minVramGb && activeModel.sizeGb"> · </span>
                        <span v-if="activeModel.sizeGb">~{{ activeModel.sizeGb }} GB download</span>
                      </p>
                      <p class="mt-2.5 text-sm leading-6 text-muted-foreground">
                        From this curated list based on the
                        <a
                          :href="activeModel.docsUrl"
                          target="_blank"
                          rel="noreferrer"
                          class="font-medium text-foreground underline-offset-2 hover:underline"
                          >stable-diffusion.cpp documentation</a
                        >
                        for this model family.
                      </p>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        v-if="activePackStatus.ready"
                        type="button"
                        class="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90"
                        @click="applyPreset()"
                      >
                        Apply configuration
                      </button>
                      <button
                        v-else
                        type="button"
                        class="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                        :disabled="!activeModel.files.length || !!downloading"
                        @click="downloadPack"
                      >
                        <Loader2 v-if="downloading" class="size-4 animate-spin" />
                        Download pack
                      </button>
                      <button
                        v-if="activeModel.files.length && !activePackStatus.ready"
                        type="button"
                        class="inline-flex h-11 items-center justify-center rounded-full bg-muted/50 px-4 text-base font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                        :disabled="!!downloading"
                        @click="applyPreset()"
                      >
                        Apply only
                      </button>
                      <button
                        v-if="
                          activeModel.files.length &&
                          activePackStatus.installed > 0 &&
                          !activePackStatus.ready
                        "
                        type="button"
                        class="inline-flex h-11 items-center justify-center rounded-full bg-muted/50 px-4 text-base font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                        :disabled="!!downloading"
                        @click="downloadMissing"
                      >
                        Download missing
                      </button>
                      <a
                        :href="activeModel.docsUrl"
                        target="_blank"
                        rel="noreferrer"
                        class="inline-flex h-11 items-center gap-1.5 px-2 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Docs
                        <ExternalLink class="size-4" />
                      </a>
                    </div>

                    <div
                      v-if="!activeModel.files.length"
                      class="rounded-2xl bg-muted/40 px-4 py-4 text-base leading-7 text-muted-foreground dark:bg-white/[0.06]"
                    >
                      This pack has gated or variable filenames. Apply the configuration, then place
                      weights into the model folders (Settings → Storage).
                    </div>

                    <div v-else class="space-y-1.5">
                      <p class="mb-2.5 text-sm font-medium text-muted-foreground">Files</p>
                      <div
                        v-for="file in activeModel.files"
                        :key="`${file.category}/${file.filename}`"
                        class="flex items-center gap-3 rounded-xl bg-muted/30 px-2.5 py-3 transition-colors hover:bg-muted/50 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                      >
                        <div class="min-w-0 flex-1">
                          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span class="truncate text-base font-medium">{{ file.label }}</span>
                            <span
                              class="text-sm"
                              :class="
                                file.required ? 'text-foreground/70' : 'text-muted-foreground'
                              "
                            >
                              {{ file.required ? 'Required' : 'Optional' }}
                            </span>
                            <span
                              v-if="fileInstalled(file)"
                              class="inline-flex items-center gap-0.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"
                            >
                              <Check class="size-4" />
                              On disk
                            </span>
                          </div>
                          <p class="mt-0.5 truncate font-mono text-sm text-muted-foreground">
                            models/{{ file.category }}/{{ file.filename }}
                          </p>
                          <p
                            v-if="downloadStatus[`${file.category}/${file.filename}`]"
                            class="mt-0.5 text-sm text-muted-foreground"
                          >
                            {{ downloadStatus[`${file.category}/${file.filename}`] }}
                          </p>
                        </div>
                        <Tooltip text="Download this file" position="left">
                          <button
                            type="button"
                            class="aui-icon-button inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                            :disabled="!!downloading"
                            :aria-label="`Download ${file.label}`"
                            @click="downloadFile(file)"
                          >
                            <Loader2
                              v-if="downloading === `${file.category}/${file.filename}`"
                              class="size-4 animate-spin"
                            />
                            <Download v-else class="size-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    <p class="text-sm leading-6 text-muted-foreground">
                      Files install under Settings → Storage → Models. Manual drops work after
                      Refresh models.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
