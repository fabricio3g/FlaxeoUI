<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, ExternalLink, Loader2, X } from '@/lib/icons'
import { useConfigStore } from '@/stores/config'
import { apiPost } from '@/services/api'
import { hubModels, type HubModel, type HubFile } from '@/lib/starterPacks'

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()
const activeModelId = ref('flux1-dev')
const downloading = ref<string | null>(null)
const downloadStatus = ref<Record<string, string>>({})

const activeModel = computed(
  () => hubModels.find((model) => model.id === activeModelId.value) || hubModels[0]
)

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
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="aui-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm titlebar-no-drag sm:p-5"
      >
        <Transition name="modal-surface" appear>
          <div
            v-if="open"
            class="aui-dialog-surface model-hub-surface flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-foreground/10 md:max-h-[86vh] md:flex-row"
          >
            <aside
            class="w-full shrink-0 border-b border-border/80 bg-muted/20 p-3 md:w-52 md:border-b-0 md:border-r"
          >
            <div class="mb-2 flex items-center justify-between gap-3 px-1 py-1">
              <div class="min-w-0">
                <h2 class="truncate text-sm font-semibold tracking-tight">Model Hub</h2>
                <p class="text-[11px] text-muted-foreground">Presets and model files</p>
              </div>
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                @click="emit('close')"
                aria-label="Close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <nav
              class="no-scrollbar flex gap-1 overflow-x-auto md:flex-col"
              aria-label="Model families"
            >
              <button
                v-for="model in hubModels"
                :key="model.id"
                type="button"
                class="shrink-0 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all duration-150 md:w-full"
                :class="
                  activeModelId === model.id
                    ? 'border-border bg-background text-foreground shadow-sm'
                    : 'border-transparent text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                "
                @click="activeModelId = model.id"
              >
                {{ model.name }}
              </button>
            </nav>
          </aside>

          <section class="flex min-h-0 min-w-0 flex-1 flex-col">
            <header class="border-b border-border/80 px-5 py-4 sm:px-6 sm:py-5">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p
                    class="aui-label text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Active preset
                  </p>
                  <h3 class="mt-1 text-xl font-semibold tracking-tight">{{ activeModel.name }}</h3>
                  <p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {{ activeModel.description }}
                  </p>
                </div>
                <a
                  :href="activeModel.docsUrl"
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  Docs
                  <ExternalLink class="h-3.5 w-3.5" />
                </a>
              </div>
            </header>

            <div class="flex-1 overflow-y-auto p-4 sm:p-6">
              <div class="mb-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  @click="applyPreset()"
                >
                  Apply configuration
                </button>
                <button
                  type="button"
                  class="inline-flex h-8 items-center justify-center rounded-lg border border-input bg-background px-4 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  :disabled="activeModel.files.length === 0 || !!downloading"
                  @click="downloadPack"
                >
                  <Loader2 v-if="downloading" class="mr-2 h-3.5 w-3.5 animate-spin" />
                  Download files + apply
                </button>
              </div>

              <div
                v-if="activeModel.files.length === 0"
                class="aui-alert rounded-xl border border-border border-l-2 border-l-amber-500 bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground"
              >
                This model family has gated or variable filenames in the docs. Apply the
                configuration, then download the listed weights from the docs into the shown folders
                manually.
              </div>

              <div
                v-else
                class="overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm"
              >
                <div
                  v-for="file in activeModel.files"
                  :key="`${file.category}/${file.filename}`"
                  class="flex items-center justify-between gap-3 border-b border-border/70 px-3.5 py-3 last:border-b-0 sm:px-4"
                >
                  <div class="min-w-0">
                    <div class="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <span class="truncate">{{ file.label }}</span>
                      <span
                        class="aui-status-badge shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                        :class="
                          file.required
                            ? 'border-foreground/15 bg-muted text-foreground'
                            : 'border-border bg-background text-muted-foreground'
                        "
                      >
                        {{ file.required ? 'Required' : 'Optional' }}
                      </span>
                    </div>
                    <div class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      models/{{ file.category }}/{{ file.filename }}
                    </div>
                    <div
                      v-if="downloadStatus[`${file.category}/${file.filename}`]"
                      class="mt-1 truncate text-[11px] font-medium text-muted-foreground"
                    >
                      {{ downloadStatus[`${file.category}/${file.filename}`] }}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    :disabled="!!downloading"
                    @click="downloadFile(file)"
                  >
                    <Loader2
                      v-if="downloading === `${file.category}/${file.filename}`"
                      class="h-3.5 w-3.5 animate-spin"
                    />
                    <Download v-else class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">Download</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
          </Transition>
        </div>
    </Transition>
  </Teleport>
</template>
