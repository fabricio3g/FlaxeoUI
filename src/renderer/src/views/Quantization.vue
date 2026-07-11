<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useModels } from '@/composables/useModels'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Scale, ArrowUp, X, FileCode, CheckCircle2, RefreshCw } from '@/lib/icons'
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
  {
    key: 'uncond_diffusion',
    label: 'Unconditional diffusion',
    getModels: () => models.value.uncondDiffusion
  },
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

function resetConversionError(): void {
  isConverting.value = false
  conversionResult.value = null
}

onMounted(() => {
  fetchModels()
})
</script>

<template>
  <div
    class="workspace-view flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
  >
    <div
      class="relative min-h-0 flex-1 overflow-hidden border-b border-border/70 bg-muted/10 p-3 md:p-5"
    >
      <div class="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col">
        <div
          class="aui-dialog-surface relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border"
          :class="
            !conversionResult && !isConverting
              ? 'flaxeo-hero border-transparent'
              : 'border-border/70 bg-card'
          "
        >
          <div
            v-if="!conversionResult && !isConverting"
            class="absolute inset-0 flex items-center justify-center px-6 text-center"
          >
            <div class="grok-hero-item flex max-w-sm flex-col items-center px-8 py-8">
              <h2 class="flaxeo-hero-copy text-2xl font-semibold tracking-[-0.03em]">
                Convert a model
              </h2>
              <p class="flaxeo-hero-muted mt-2 text-sm leading-6">
                Select a source model and output precision to create a quantized GGUF file.
              </p>
            </div>
          </div>

          <div v-if="isConverting" class="absolute inset-0 flex items-center justify-center px-6">
            <div
              class="aui-dialog-surface flex max-w-sm flex-col items-center rounded-lg border border-border bg-background/80 px-8 py-7 text-center shadow-sm backdrop-blur"
            >
              <div
                class="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-muted/30"
              >
                <RefreshCw class="size-4 animate-spin text-muted-foreground" />
              </div>
              <span class="text-sm font-medium">Converting model</span>
              <p class="mt-1.5 text-xs leading-5 text-muted-foreground">
                This may take a few minutes depending on model size.
              </p>
              <span
                class="aui-status-badge mt-3 rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                >In progress</span
              >
            </div>
          </div>

          <div
            v-if="conversionResult && !isConverting"
            class="relative z-10 flex flex-col items-center px-8 text-center"
          >
            <div v-if="conversionResult.success" class="flex max-w-md flex-col items-center">
              <div
                class="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-muted/30"
              >
                <CheckCircle2 class="size-4 text-foreground" />
              </div>
              <h3 class="text-sm font-medium tracking-tight">Conversion complete</h3>
              <p class="mt-1.5 break-all text-xs leading-5 text-muted-foreground">
                {{ conversionResult.outputPath }}
              </p>
              <button
                type="button"
                @click="resetForm"
                class="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                Convert another
              </button>
            </div>
            <div v-else class="flex max-w-md flex-col items-center">
              <div
                class="mb-4 flex size-10 items-center justify-center rounded-lg border border-destructive/25 bg-destructive/10"
              >
                <X class="size-4 text-destructive" />
              </div>
              <h3 class="text-sm font-medium tracking-tight">Conversion failed</h3>
              <p class="mt-1.5 text-xs leading-5 text-muted-foreground">
                {{ conversionResult.error }}
              </p>
              <button
                type="button"
                @click="resetConversionError"
                class="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3 pt-2.5 md:px-5 md:pb-5 md:pt-4">
      <div
        class="aui-dialog-surface mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border/70 bg-card"
      >
        <div class="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div class="flex items-center gap-2">
            <Scale class="size-3.5 text-muted-foreground" />
            <div>
              <h1 class="text-xs font-medium">Quantization</h1>
              <p class="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">
                Configure model precision and output.
              </p>
            </div>
          </div>
          <Tooltip text="Memory requirements" position="left">
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-label="Memory requirements"
            >
              <FileCode class="size-3.5" />
            </button>
          </Tooltip>
        </div>

        <div class="space-y-4 p-4">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
                >Source model</label
              >
              <Select
                v-model="sourceModel"
                size="sm"
                class="aui-field"
                placeholder="Select model..."
                :options="sourceModelOptions"
                @update:model-value="handleSourceChange"
              />
            </div>
            <div>
              <label class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
                >Target format</label
              >
              <Select
                v-model="targetFormat"
                size="sm"
                class="aui-field"
                placeholder="Select format..."
                :options="formatOptions"
                @update:model-value="handleFormatChange"
              />
            </div>
            <div>
              <label class="aui-label mb-1.5 block text-[11px] font-medium text-muted-foreground"
                >Output filename</label
              >
              <input
                v-model="outputName"
                type="text"
                placeholder="model.q8_0.gguf"
                class="aui-field h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:font-normal placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>

          <div class="overflow-hidden rounded-lg border border-border/70">
            <div
              class="flex items-center justify-between border-b border-border/70 bg-muted/20 px-3 py-2"
            >
              <h4 class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Memory requirements
              </h4>
              <span
                class="aui-status-badge rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium text-muted-foreground"
                >SD 1.x / 512 x 512</span
              >
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-[11px]">
                <thead>
                  <tr class="border-b border-border/70 text-muted-foreground">
                    <th class="px-3 py-2 text-left font-medium">Precision</th>
                    <th class="px-3 py-2 text-left font-medium">Standard</th>
                    <th class="px-3 py-2 text-left font-medium">Flash attention</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in memoryTable"
                    :key="row.format"
                    class="border-b border-border/60 transition-colors duration-200 last:border-b-0"
                    :class="row.format === targetFormat ? 'bg-muted/40' : 'hover:bg-muted/20'"
                  >
                    <td class="px-3 py-1.5 font-mono font-medium text-foreground">
                      {{ row.format }}
                    </td>
                    <td class="px-3 py-1.5 text-muted-foreground">{{ row.memory }}</td>
                    <td class="px-3 py-1.5 text-muted-foreground">{{ row.memoryFA }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2">
            <button
              v-if="!isConverting"
              type="button"
              @click="handleConvert"
              :disabled="!sourceModel || !targetFormat || !outputName"
              class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <ArrowUp class="size-4" />
              Convert model
            </button>
            <button
              v-else
              type="button"
              @click="handleCancel"
              class="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-4 text-xs font-medium text-destructive transition-colors duration-200 hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <X class="size-4" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
