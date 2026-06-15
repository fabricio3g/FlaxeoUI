<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, ExternalLink, Loader2, X } from 'lucide-vue-next'
import { useConfigStore } from '@/stores/config'
import { apiPost } from '@/services/api'
import { hubModels, type HubModel, type HubFile } from '@/lib/starterPacks'

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()
const activeModelId = ref('flux1-dev')
const downloading = ref<string | null>(null)
const downloadStatus = ref<Record<string, string>>({})

const activeModel = computed(() => hubModels.find((model) => model.id === activeModelId.value) || hubModels[0])

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
    <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm titlebar-no-drag">
      <div class="flex max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <aside class="w-56 shrink-0 border-r border-border/70 bg-muted/30 p-3">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">Model Hub</h2>
          <button class="metal-icon-button p-1.5 text-muted-foreground hover:text-foreground" @click="emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
        <button
          v-for="model in hubModels"
          :key="model.id"
          class="mb-1 w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
          :class="activeModelId === model.id ? 'primary-metal-button' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeModelId = model.id"
        >
          {{ model.name }}
        </button>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col">
        <div class="border-b border-border/70 p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-semibold">{{ activeModel.name }}</h3>
              <p class="mt-1 max-w-2xl text-sm text-muted-foreground">{{ activeModel.description }}</p>
            </div>
            <a :href="activeModel.docsUrl" target="_blank" class="metal-icon-button flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
              Docs
              <ExternalLink class="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <div class="mb-4 flex flex-wrap gap-2">
            <button class="primary-metal-button rounded-lg px-4 py-2 text-xs font-medium" @click="applyPreset()">
              Apply Configuration
            </button>
            <button
              class="rounded-lg bg-muted px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="activeModel.files.length === 0 || !!downloading"
              @click="downloadPack"
            >
              Download Listed Files + Apply
            </button>
          </div>

          <div v-if="activeModel.files.length === 0" class="rounded-xl border border-border/70 bg-muted/25 p-4 text-sm text-muted-foreground">
            This model family has gated or variable filenames in the docs. Apply the configuration, then download the listed weights from the docs into the shown folders manually.
          </div>

          <div v-else class="space-y-2">
            <div v-for="file in activeModel.files" :key="`${file.category}/${file.filename}`" class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 truncate text-sm font-medium">
                  <span class="truncate">{{ file.label }}</span>
                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    :class="file.required ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
                  >
                    {{ file.required ? 'Required' : 'Optional' }}
                  </span>
                </div>
                <div class="truncate text-xs text-muted-foreground">models/{{ file.category }}/{{ file.filename }}</div>
                <div v-if="downloadStatus[`${file.category}/${file.filename}`]" class="mt-1 truncate text-[11px] text-muted-foreground">
                  {{ downloadStatus[`${file.category}/${file.filename}`] }}
                </div>
              </div>
              <button
                class="metal-icon-button flex shrink-0 items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!!downloading"
                @click="downloadFile(file)"
              >
                <Loader2 v-if="downloading === `${file.category}/${file.filename}`" class="h-3.5 w-3.5 animate-spin" />
                <Download v-else class="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  </Teleport>
</template>
