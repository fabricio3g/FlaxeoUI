<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useModels } from '@/composables/useModels'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Scale, ArrowUp, X, CheckCircle2, RefreshCw } from '@/lib/icons'
import Select from '@/components/ui/Select.vue'

const toast = useToast()
const { models, fetchModels } = useModels()

// Form state
const sourceModel = ref('')
const targetFormat = ref('q8_0')
const outputName = ref('')
const isConverting = ref(false)
const isCancelling = ref(false)
const cancelToken = ref(0)
const conversionResult = ref<{ success: boolean; outputPath?: string; error?: string } | null>(null)
const showMemory = ref(false)

// Quantization options (legacy + K-quants used widely for DiT/LLM weights)
const formatOptions = [
  { label: 'f32 (32-bit float)', value: 'f32' },
  { label: 'f16 (16-bit float)', value: 'f16' },
  { label: 'bf16 (bfloat16)', value: 'bf16' },
  { label: 'q8_0 (8-bit)', value: 'q8_0' },
  { label: 'q6_K (6-bit K-quant)', value: 'q6_K' },
  { label: 'q5_0 (5-bit)', value: 'q5_0' },
  { label: 'q5_1 (5-bit)', value: 'q5_1' },
  { label: 'q5_K (5-bit K-quant)', value: 'q5_K' },
  { label: 'q4_0 (4-bit)', value: 'q4_0' },
  { label: 'q4_1 (4-bit)', value: 'q4_1' },
  { label: 'q4_K (4-bit K-quant)', value: 'q4_K' },
  { label: 'q3_K (3-bit K-quant)', value: 'q3_K' },
  { label: 'q2_K (2-bit K-quant)', value: 'q2_K' }
]

// Approximate memory for SD 1.x @ 512² (classic quants); K-quants vary by model family
const memoryTable = [
  { format: 'f32', memory: '~2.8G', memoryFA: '~2.4G' },
  { format: 'f16 / bf16', memory: '~2.3G', memoryFA: '~1.9G' },
  { format: 'q8_0', memory: '~2.1G', memoryFA: '~1.6G' },
  { format: 'q6_K', memory: '~1.9G*', memoryFA: '~1.5G*' },
  { format: 'q5_0 / q5_1 / q5_K', memory: '~2.0G', memoryFA: '~1.5G' },
  { format: 'q4_0 / q4_1 / q4_K', memory: '~2.0G', memoryFA: '~1.5G' },
  { format: 'q3_K / q2_K', memory: 'lower*', memoryFA: 'lower*' }
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
  { label: 'Select source model…', value: '' },
  ...sourceModelGroups.flatMap((group) =>
    group.getModels().map((model) => ({
      label: `${group.label} · ${model}`,
      value: `${group.key}/${model}`
    }))
  )
])

const sourceModelCategory = computed(() => sourceModel.value.split('/')[0] || '')
const sourceModelFilename = computed(() => sourceModel.value.split('/').slice(1).join('/'))

function autoOutputName(): string {
  if (!sourceModelFilename.value || !targetFormat.value) return ''
  const base = sourceModelFilename.value.replace(/\.[^.]+$/, '')
  return `${base}.${targetFormat.value}.gguf`
}

function handleFormatChange(): void {
  if (!outputName.value || outputName.value === autoOutputName()) {
    outputName.value = autoOutputName()
  }
}

function handleSourceChange(): void {
  outputName.value = autoOutputName()
}

async function handleConvert(): Promise<void> {
  if (!sourceModel.value || !targetFormat.value || !outputName.value) {
    toast.error('Please fill in all fields')
    return
  }

  isConverting.value = true
  isCancelling.value = false
  conversionResult.value = null
  const token = ++cancelToken.value

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

    if (cancelToken.value !== token) return

    conversionResult.value = result
    if (result.success) {
      toast.success(`Converted to ${outputName.value}`)
      await fetchModels({ force: true })
    } else {
      toast.error(result.error || 'Conversion failed')
    }
  } catch (e) {
    if (cancelToken.value !== token) return
    const msg = e instanceof Error ? e.message : 'Conversion failed'
    conversionResult.value = { success: false, error: msg }
    toast.error(msg)
  } finally {
    if (cancelToken.value === token) {
      isConverting.value = false
    }
  }
}

async function handleCancel(): Promise<void> {
  if (isCancelling.value) return
  isCancelling.value = true
  cancelToken.value++

  try {
    await apiPost('/api/cancel-cli', {})
  } catch {
    // best-effort
  }

  isConverting.value = false
  conversionResult.value = null
  toast.warning('Conversion cancelled')
}

function resetForm(): void {
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
      class="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col overflow-y-auto px-4 py-6 md:px-6 md:py-8"
    >
      <!-- Header -->
      <header class="mb-8">
        <div class="flex items-center gap-2.5">
          <Scale class="size-5 text-muted-foreground" />
          <h1 class="text-xl font-semibold tracking-tight text-foreground">Quantize</h1>
        </div>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">
          Convert a model to a smaller GGUF precision for lower VRAM use.
        </p>
      </header>

      <!-- Status (idle / progress / result) — flat, no nested cards -->
      <section v-if="isConverting" class="mb-8 flex items-start gap-3">
        <RefreshCw class="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground" />
        <div>
          <p class="text-base font-medium text-foreground">Converting…</p>
          <p class="mt-1 text-sm leading-5 text-muted-foreground">
            This can take a few minutes depending on model size.
          </p>
        </div>
      </section>

      <section v-else-if="conversionResult" class="mb-8 flex items-start gap-3">
        <CheckCircle2
          v-if="conversionResult.success"
          class="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
        />
        <X v-else class="mt-0.5 size-5 shrink-0 text-destructive" />
        <div class="min-w-0 flex-1">
          <p class="text-base font-medium text-foreground">
            {{ conversionResult.success ? 'Conversion complete' : 'Conversion failed' }}
          </p>
          <p
            v-if="conversionResult.success && conversionResult.outputPath"
            class="mt-1 break-all text-sm leading-5 text-muted-foreground"
          >
            {{ conversionResult.outputPath }}
          </p>
          <p
            v-else-if="conversionResult.error"
            class="mt-1 text-sm leading-5 text-muted-foreground"
          >
            {{ conversionResult.error }}
          </p>
          <button
            type="button"
            class="mt-3 text-sm font-medium text-primary hover:underline"
            @click="conversionResult.success ? resetForm() : resetConversionError()"
          >
            {{ conversionResult.success ? 'Convert another' : 'Try again' }}
          </button>
        </div>
      </section>

      <!-- Form -->
      <section class="space-y-5">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-foreground">Source model</label>
          <Select
            v-model="sourceModel"
            size="md"
            class="aui-field"
            placeholder="Select model…"
            :options="sourceModelOptions"
            :disabled="isConverting"
            @update:model-value="handleSourceChange"
          />
        </div>

        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-foreground">Target format</label>
            <Select
              v-model="targetFormat"
              size="md"
              class="aui-field"
              placeholder="Select format…"
              :options="formatOptions"
              :disabled="isConverting"
              @update:model-value="handleFormatChange"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-foreground">Output filename</label>
            <input
              v-model="outputName"
              type="text"
              placeholder="model.q8_0.gguf"
              :disabled="isConverting"
              class="aui-field h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </div>
        </div>

        <!-- Memory reference — optional, no card chrome -->
        <div>
          <button
            type="button"
            class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            @click="showMemory = !showMemory"
          >
            {{ showMemory ? 'Hide' : 'Show' }} memory guide
          </button>
          <div v-if="showMemory" class="mt-3">
            <p class="mb-2 text-xs text-muted-foreground">
              Approximate VRAM for SD 1.x @ 512×512 (* K-quants vary by family)
            </p>
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="text-muted-foreground">
                  <th class="pb-2 pr-3 font-medium">Precision</th>
                  <th class="pb-2 pr-3 font-medium">Standard</th>
                  <th class="pb-2 font-medium">Flash attn</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in memoryTable"
                  :key="row.format"
                  class="border-t border-border/40"
                  :class="
                    row.format.includes(targetFormat) ? 'text-foreground' : 'text-muted-foreground'
                  "
                >
                  <td class="py-2 pr-3 font-mono text-[13px]">{{ row.format }}</td>
                  <td class="py-2 pr-3">{{ row.memory }}</td>
                  <td class="py-2">{{ row.memoryFA }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex justify-end pt-1">
          <button
            v-if="!isConverting"
            type="button"
            :disabled="!sourceModel || !targetFormat || !outputName"
            class="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            @click="handleConvert"
          >
            <ArrowUp class="size-4" />
            Convert model
          </button>
          <button
            v-else
            type="button"
            :disabled="isCancelling"
            class="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            @click="handleCancel"
          >
            <RefreshCw v-if="isCancelling" class="size-4 animate-spin" />
            <X v-else class="size-4" />
            Cancel
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
