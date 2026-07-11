<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Download, ExternalLink, Loader2, X } from '@/lib/icons'
import { useConfigStore } from '@/stores/config'
import { apiPost } from '@/services/api'
import { hubModels, type HubModel, type HubFile } from '@/lib/starterPacks'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()
const activeModelId = ref(hubModels[0]?.id || 'flux1-dev')
const downloading = ref<string | null>(null)
const downloadStatus = ref<Record<string, string>>({})

const activeModel = computed(
  () => hubModels.find((model) => model.id === activeModelId.value) || hubModels[0]
)

function close(): void {
  emit('close')
}

function onBackdropPointerDown(event: PointerEvent): void {
  if (event.target === event.currentTarget) close()
}

function applyPreset(model = activeModel.value): void {
  configStore.applyPreset(model.presetId)
}

async function downloadFile(file: HubFile): Promise<void> {
  const key = `${file.category}/${file.filename}`
  downloading.value = key
  downloadStatus.value[key] = 'Downloading...'
  try {
    await apiPost('/api/models/download', file)
    downloadStatus.value[key] = 'Downloaded'
  } catch (error) {
    downloadStatus.value[key] = error instanceof Error ? error.message : 'Download failed'
  } finally {
    downloading.value = null
  }
}

async function downloadPack(): Promise<void> {
  applyPreset()
  for (const file of activeModel.value.files) {
    await downloadFile(file)
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
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
        class="aui-dialog-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm titlebar-no-drag sm:p-6"
        @pointerdown="onBackdropPointerDown"
      >
        <Transition name="modal-surface" appear>
          <div
            v-if="open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-hub-title"
            class="aui-dialog-surface relative flex h-[min(82vh,680px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/15 dark:shadow-black/40"
            @pointerdown.stop
          >
            <div class="flex h-full min-h-0 flex-col bg-background text-foreground md:flex-row">
              <!-- Sidebar — scrollable model list -->
              <aside
                class="flex max-h-[40vh] shrink-0 flex-col border-b border-border/80 bg-muted/15 px-3 py-4 md:max-h-none md:h-full md:w-48 md:min-h-0 md:border-b-0 md:border-r md:px-4 md:py-5"
              >
                <div class="mb-3 flex shrink-0 items-center justify-between gap-2 px-1 md:mb-4">
                  <p
                    class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Model Hub
                  </p>
                  <button
                    type="button"
                    class="aui-icon-button titlebar-no-drag inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
                    aria-label="Close model hub"
                    @click.stop="close"
                  >
                    <X class="size-4" />
                  </button>
                </div>
                <nav
                  class="flex min-h-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden md:flex-col md:overflow-x-hidden md:overflow-y-auto"
                  aria-label="Model families"
                >
                  <button
                    v-for="model in hubModels"
                    :key="model.id"
                    type="button"
                    class="inline-flex h-9 shrink-0 items-center gap-2.5 rounded-md px-3 text-left text-sm font-normal transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:w-full"
                    :class="
                      activeModelId === model.id
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    "
                    :aria-current="activeModelId === model.id ? 'page' : undefined"
                    @click="activeModelId = model.id"
                  >
                    <span class="truncate">{{ model.name }}</span>
                  </button>
                </nav>
              </aside>

              <!-- Content -->
              <section class="flex min-h-0 min-w-0 flex-1 flex-col">
                <header
                  class="relative z-10 flex shrink-0 items-start justify-between gap-3 px-5 py-5 md:px-6 md:py-6"
                >
                  <div class="min-w-0 flex-1 pr-2">
                    <h2
                      id="model-hub-title"
                      class="text-lg font-semibold tracking-[-0.02em]"
                    >
                      {{ activeModel.name }}
                    </h2>
                    <p class="mt-1.5 text-sm leading-5 text-muted-foreground">
                      {{ activeModel.description }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="aui-icon-button titlebar-no-drag hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:inline-flex"
                    aria-label="Close model hub"
                    @click.stop="close"
                  >
                    <X class="size-4" />
                  </button>
                </header>

                <div class="flex-1 overflow-y-auto px-5 pb-6 pt-1 md:px-6 md:pb-7">
                  <div class="mx-auto w-full max-w-2xl space-y-5">
                    <div class="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        @click="applyPreset()"
                      >
                        Apply configuration
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        :disabled="activeModel.files.length === 0 || !!downloading"
                        @click="downloadPack"
                      >
                        <Loader2 v-if="downloading" class="size-3.5 animate-spin" />
                        Download files + apply
                      </button>
                      <a
                        :href="activeModel.docsUrl"
                        target="_blank"
                        rel="noreferrer"
                        class="inline-flex h-9 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        Docs
                        <ExternalLink class="size-3.5" />
                      </a>
                    </div>

                    <div
                      v-if="activeModel.files.length === 0"
                      class="rounded-lg border border-border/70 bg-card px-4 py-4 text-sm leading-6 text-muted-foreground"
                    >
                      This pack has gated or variable filenames. Apply the configuration, then place
                      weights from the docs into the model folders manually.
                    </div>

                    <div
                      v-else
                      class="overflow-hidden rounded-lg border border-border/70 bg-card"
                    >
                      <div
                        v-for="file in activeModel.files"
                        :key="`${file.category}/${file.filename}`"
                        class="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 last:border-b-0"
                      >
                        <div class="min-w-0">
                          <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate text-sm font-medium">{{ file.label }}</span>
                            <span
                              class="aui-status-badge shrink-0 text-[10px] font-medium"
                              :class="
                                file.required ? 'text-foreground' : 'text-muted-foreground'
                              "
                            >
                              {{ file.required ? 'Required' : 'Optional' }}
                            </span>
                          </div>
                          <p class="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                            models/{{ file.category }}/{{ file.filename }}
                          </p>
                          <p
                            v-if="downloadStatus[`${file.category}/${file.filename}`]"
                            class="mt-1 text-[11px] text-muted-foreground"
                          >
                            {{ downloadStatus[`${file.category}/${file.filename}`] }}
                          </p>
                        </div>
                        <button
                          type="button"
                          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                          :disabled="!!downloading"
                          @click="downloadFile(file)"
                        >
                          <Loader2
                            v-if="downloading === `${file.category}/${file.filename}`"
                            class="size-3.5 animate-spin"
                          />
                          <Download v-else class="size-3.5" />
                          <span class="hidden sm:inline">Download</span>
                        </button>
                      </div>
                    </div>
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
