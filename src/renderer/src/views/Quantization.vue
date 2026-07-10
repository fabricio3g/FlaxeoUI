<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useModels } from '@/composables/useModels'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Scale, ArrowUp, X, FileCode, CheckCircle2 } from '@/lib/icons'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

const toast = useToast()
const { models, fetchModels } = useModels()

// Form state
const sourceModel = ref('')
const targetFormat = ref('q8_0')
const outputName = ref('')
const isConverting = ref(false)
const conversionResult = ref<{ success: boolean; outputPath?: string; error?: string } | null>(null)

// Quantization options
const formatOptions = [
  { label: 'f32 (32-bit float)', value: 'f32' },
  { label: 'f16 (16-bit float)', value: 'f16' },
  { label: 'q8_0 (8-bit int)', value: 'q8_0' },
  { label: 'q5_0 (5-bit int)', value: 'q5_0' },
  { label: 'q5_1 (5-bit int)', value: 'q5_1' },
  { label: 'q4_0 (4-bit int)', value: 'q4_0' },
  { label: 'q4_1 (4-bit int)', value: 'q4_1' }
]

// Memory requirements table (Stable Diffusion 1.x, 512x512)
const memoryTable = [
  { format: 'f32', memory: '~2.8G', memoryFA: '~2.4G' },
  { format: 'f16', memory: '~2.3G', memoryFA: '~1.9G' },
  { format: 'q8_0', memory: '~2.1G', memoryFA: '~1.6G' },
  { format: 'q5_0', memory: '~2.0G', memoryFA: '~1.5G' },
  { format: 'q5_1', memory: '~2.0G', memoryFA: '~1.5G' },
  { format: 'q4_0', memory: '~2.0G', memoryFA: '~1.5G' },
  { format: 'q4_1', memory: '~2.0G', memoryFA: '~1.5G' }
]

const sourceModelGroups = [
  { key: 'diffusion', label: 'Diffusion', getModels: () => models.value.diffusion },
  { key: 'uncond_diffusion', label: 'Unconditional diffusion', getModels: () => models.value.uncondDiffusion },
  { key: 'vae', label: 'VAE', getModels: () => models.value.vae },
  { key: 'llm', label: 'LLM', getModels: () => models.value.llm },
  { key: 't5xxl', label: 'T5XXL', getModels: () => models.value.t5xxl },
  { key: 'clip', label: 'CLIP', getModels: () => models.value.clip },
  { key: 'clip_vision', label: 'CLIP Vision', getModels: () => models.value.clipVision }
]

// Values carry the model directory so the CLI conversion route can resolve the same file.
const sourceModelOptions = computed(() => [
  { label: 'Select source model...', value: '' },
  ...sourceModelGroups.flatMap((group) =>
    group.getModels().map((model) => ({
      label: `${group.label} · ${model}`,
      value: `${group.key}/${model}`
    }))
  )
])

const sourceModelCategory = computed(() => sourceModel.value.split('/')[0] || '')
const sourceModelFilename = computed(() => sourceModel.value.split('/').slice(1).join('/'))

// Auto-generate output name
function autoOutputName(): string {
  if (!sourceModelFilename.value || !targetFormat.value) return ''
  const base = sourceModelFilename.value.replace(/\.[^.]+$/, '')
  return `${base}.${targetFormat.value}.gguf`
}

function handleFormatChange() {
  if (!outputName.value || outputName.value === autoOutputName()) {
    outputName.value = autoOutputName()
  }
}

function handleSourceChange() {
  outputName.value = autoOutputName()
}

async function handleConvert() {
  if (!sourceModel.value || !targetFormat.value || !outputName.value) {
    toast.error('Please fill in all fields')
    return
  }

  isConverting.value = true
  conversionResult.value = null

  try {
    const result = await apiPost<{ success: boolean; outputPath?: string; error?: string }>(
      '/api/convert',
      {
        sourceType: sourceModelCategory.value,
        sourceModel: sourceModelFilename.value,
        outputFormat: targetFormat.value,
        outputName: outputName.value
      }
    )

    conversionResult.value = result
    if (result.success) {
      toast.success(`Converted to ${outputName.value}`)
    } else {
      toast.error(result.error || 'Conversion failed')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Conversion failed'
    conversionResult.value = { success: false, error: msg }
    toast.error(msg)
  } finally {
    isConverting.value = false
  }
}

function handleCancel() {
  // Conversion can't be cancelled easily via the current API,
  // but we can reset the UI state
  isConverting.value = false
  toast.warning('Conversion state reset')
}

function resetForm() {
  sourceModel.value = ''
  targetFormat.value = 'q8_0'
  outputName.value = ''
  conversionResult.value = null
}

onMounted(() => {
  fetchModels()
})
</script>

<template>
  <div class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <!-- Preview / Status Area -->
    <div class="relative flex-1 min-h-0 overflow-hidden border-b border-border p-1.5 md:p-6">
      <div class="mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col">
        <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <!-- Empty State -->
          <div v-if="!conversionResult && !isConverting" class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div class="flex max-w-sm flex-col items-center">
              <div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                <Scale class="h-5 w-5" />
              </div>
              <h2 class="text-xl font-semibold tracking-tight">Convert a model</h2>
              <p class="mt-1 text-sm text-muted-foreground">Choose a source model and target format below.</p>
            </div>
          </div>

          <!-- Converting State -->
          <div v-if="isConverting" class="absolute inset-0 flex items-center justify-center">
            <div class="flex max-w-sm flex-col items-center rounded-lg border border-border bg-card px-8 py-6 text-center shadow-sm">
              <div class="mb-4 inline-flex h-10 w-10 items-center justify-center">
                <RefreshCw class="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
              <span class="text-base font-semibold">Converting model</span>
              <p class="mt-1 text-xs text-muted-foreground">This may take a few minutes depending on model size.</p>
            </div>
          </div>

          <!-- Result State -->
          <div v-if="conversionResult && !isConverting" class="relative z-10 flex flex-col items-center px-8 text-center">
            <div v-if="conversionResult.success" class="flex flex-col items-center gap-3">
              <div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 class="h-8 w-8 text-emerald-600" />
              </div>
              <h3 class="text-xl font-semibold tracking-tight">Conversion Complete</h3>
              <p class="max-w-md text-sm text-muted-foreground">Output: {{ conversionResult.outputPath }}</p>
              <button
                type="button"
                @click="resetForm"
                class="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Convert Another
              </button>
            </div>
            <div v-else class="flex flex-col items-center gap-3">
              <div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15">
                <X class="h-8 w-8 text-destructive" />
              </div>
              <h3 class="text-xl font-semibold tracking-tight">Conversion Failed</h3>
              <p class="max-w-md text-sm text-muted-foreground">{{ conversionResult.error }}</p>
              <button
                type="button"
                @click="isConverting = false; conversionResult = null"
                class="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Controls Panel -->
    <div class="shrink-0 px-3 pb-3 pt-2 md:px-5 md:pb-4 md:pt-3">
      <div class="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <!-- Quick Controls Row -->
        <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs md:px-5 md:py-3">
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <Scale class="h-3.5 w-3.5" />
            <span class="font-medium">Quantization</span>
          </div>
          <div class="hidden flex-1 md:block"></div>
          <!-- Memory Table Toggle -->
          <Tooltip text="Memory Requirements" position="left">
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <FileCode class="h-3 h-3" />
            </button>
          </Tooltip>
        </div>

        <!-- Conversion Form -->
        <div class="space-y-3 px-3 pb-3 md:px-5 md:pb-4">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label class="mb-1.5 block text-[11px] font-medium text-muted-foreground">Source Model</label>
              <Select
                v-model="sourceModel"
                size="sm"
                placeholder="Select model..."
                :options="sourceModelOptions"
                @update:model-value="handleSourceChange"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-[11px] font-medium text-muted-foreground">Target Format</label>
              <Select
                v-model="targetFormat"
                size="sm"
                placeholder="Select format..."
                :options="formatOptions"
                @update:model-value="handleFormatChange"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-[11px] font-medium text-muted-foreground">Output Filename</label>
              <div class="flex items-center gap-2 rounded-md border border-input bg-transparent px-2 py-1 focus-within:ring-1 focus-within:ring-ring/40">
                <input
                  v-model="outputName"
                  type="text"
                  placeholder="model.q8_0.gguf"
                  class="h-6 w-full bg-transparent text-xs font-medium text-foreground focus:outline-none"
                />
              </div>
            </div>
          </div>

          <!-- Memory Requirements Table -->
          <div class="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            <div class="border-b border-border bg-muted/40 px-3 py-2">
              <h4 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Memory Requirements (SD 1.x, 512×512)</h4>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-[11px]">
                <thead>
                  <tr class="border-b border-border text-muted-foreground">
                    <th class="px-3 py-1.5 text-left font-medium">Precision</th>
                    <th class="px-3 py-1.5 text-left font-medium">Standard</th>
                    <th class="px-3 py-1.5 text-left font-medium">+ Flash Attention</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in memoryTable" :key="row.format" class="border-b border-border text-foreground last:border-b-0">
                    <td class="px-3 py-1.5 font-medium">{{ row.format }}</td>
                    <td class="px-3 py-1.5 text-muted-foreground">{{ row.memory }}</td>
                    <td class="px-3 py-1.5 text-muted-foreground">{{ row.memoryFA }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Convert Button -->
          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              v-if="!isConverting"
              type="button"
              @click="handleConvert"
              :disabled="!sourceModel || !targetFormat || !outputName"
              class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <ArrowUp class="h-4 w-4" />
              Convert Model
            </button>
            <button
              v-else
              type="button"
              @click="handleCancel"
              class="inline-flex h-9 items-center gap-2 rounded-md bg-destructive px-5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X class="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
