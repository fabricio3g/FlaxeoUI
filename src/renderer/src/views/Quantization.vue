<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useModels } from '@/composables/useModels'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Scale, ArrowUp, X, FileCode, CheckCircle2 } from 'lucide-vue-next'
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

// Computed options for source model
const sourceModelOptions = computed(() => [
  { label: 'Select source model...', value: '' },
  ...models.value.diffusion.map((m) => ({ label: m, value: m })),
  ...models.value.uncondDiffusion.map((m) => ({ label: m, value: m })),
  ...models.value.llm.map((m) => ({ label: m, value: m })),
  ...models.value.t5xxl.map((m) => ({ label: m, value: m }))
])

// Auto-generate output name
function autoOutputName(): string {
  if (!sourceModel.value || !targetFormat.value) return ''
  const base = sourceModel.value.replace(/\.[^.]+$/, '')
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
        sourceType: 'diffusion',
        sourceModel: sourceModel.value,
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
  <div class="flex flex-col h-full overflow-hidden bg-muted/30 text-foreground">
    <!-- Preview / Status Area -->
    <div class="flex-1 relative min-h-0 overflow-hidden border-b border-border/60 p-1.5 md:p-6">
      <div class="mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col">
        <div class="relative flex min-h-0 flex-1 items-center justify-center rounded-2xl metal-surface group overflow-hidden dot-grid-corners">
          <!-- Empty State -->
          <div v-if="!conversionResult && !isConverting" class="empty-preview-orb absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-white">
            <div class="empty-preview-noise"></div>
            <div class="empty-preview-glow empty-preview-glow-a"></div>
            <div class="empty-preview-glow empty-preview-glow-b"></div>
            <div class="empty-preview-glow empty-preview-glow-c"></div>
            <div class="relative z-10 flex max-w-lg flex-col items-center px-8 text-center">
              <span class="empty-preview-brand">FlaxeoUI</span>
              <span class="empty-preview-brand-subtitle">Model Quantization</span>
            </div>
          </div>

          <!-- Converting State -->
          <div v-if="isConverting" class="absolute inset-0 generating-halftone flex items-center justify-center">
            <div class="generating-status">
              <div class="generating-loader-mark" aria-hidden="true">
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
              </div>
              <span class="generating-status-title">Converting model</span>
              <p class="generating-status-subtitle">This may take a few minutes depending on model size.</p>
            </div>
          </div>

          <!-- Result State -->
          <div v-if="conversionResult && !isConverting" class="relative z-10 flex flex-col items-center px-8 text-center">
            <div v-if="conversionResult.success" class="flex flex-col items-center gap-3">
              <div class="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 class="w-8 h-8 text-green-500" />
              </div>
              <h3 class="text-xl font-semibold text-white">Conversion Complete</h3>
              <p class="text-sm text-white/70">Output: {{ conversionResult.outputPath }}</p>
              <button @click="resetForm" class="mt-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">
                Convert Another
              </button>
            </div>
            <div v-else class="flex flex-col items-center gap-3">
              <div class="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <X class="w-8 h-8 text-red-500" />
              </div>
              <h3 class="text-xl font-semibold text-white">Conversion Failed</h3>
              <p class="text-sm text-white/70">{{ conversionResult.error }}</p>
              <button @click="isConverting = false; conversionResult = null" class="mt-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Controls Panel -->
    <div class="shrink-0 bg-card/70 px-3 md:px-5 pb-3 md:pb-4 pt-2 md:pt-3">
      <div class="flaxeo-generation-controls relative overflow-visible rounded-3xl border border-border/70 bg-card/85 shadow-[0_12px_34px_rgba(130,130,255,0.14)] backdrop-blur">
        <!-- Quick Controls Row -->
        <div class="px-3 md:px-5 py-2 md:py-3 flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <Scale class="w-3.5 h-3.5" />
            <span class="font-medium">Quantization</span>
          </div>
          <div class="flex-1 hidden md:block"></div>
          <!-- Memory Table Toggle -->
          <Tooltip text="Memory Requirements" position="left">
            <button class="h-7 w-7 metal-icon-button flex items-center justify-center text-muted-foreground hover:text-foreground">
              <FileCode class="w-3 h-3" />
            </button>
          </Tooltip>
        </div>

        <!-- Conversion Form -->
        <div class="px-3 md:px-5 pb-3 md:pb-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label class="text-[11px] font-medium text-muted-foreground block mb-1.5">Source Model</label>
              <Select
                v-model="sourceModel"
                size="sm"
                placeholder="Select model..."
                :options="sourceModelOptions"
                @update:model-value="handleSourceChange"
              />
            </div>
            <div>
              <label class="text-[11px] font-medium text-muted-foreground block mb-1.5">Target Format</label>
              <Select
                v-model="targetFormat"
                size="sm"
                placeholder="Select format..."
                :options="formatOptions"
                @update:model-value="handleFormatChange"
              />
            </div>
            <div>
              <label class="text-[11px] font-medium text-muted-foreground block mb-1.5">Output Filename</label>
              <div class="flex items-center gap-2 bg-card border border-border rounded-lg px-2 py-1">
                <input
                  v-model="outputName"
                  type="text"
                  placeholder="model.q8_0.gguf"
                  class="w-full bg-transparent text-xs font-medium focus:outline-none text-foreground"
                />
              </div>
            </div>
          </div>

          <!-- Memory Requirements Table -->
          <div class="mt-3 rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
            <div class="px-3 py-2 border-b border-border/50 bg-muted/30">
              <h4 class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Memory Requirements (SD 1.x, 512×512)</h4>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-[11px]">
                <thead>
                  <tr class="border-b border-border/30 text-muted-foreground">
                    <th class="px-3 py-1.5 text-left font-medium">Precision</th>
                    <th class="px-3 py-1.5 text-left font-medium">Standard</th>
                    <th class="px-3 py-1.5 text-left font-medium">+ Flash Attention</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in memoryTable" :key="row.format" class="border-b border-border/20 text-foreground">
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
              @click="handleConvert"
              :disabled="!sourceModel || !targetFormat || !outputName"
              class="primary-metal-button px-5 py-2 rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <ArrowUp class="w-4 h-4" />
              Convert Model
            </button>
            <button
              v-else
              @click="handleCancel"
              class="flex items-center gap-2 px-5 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90"
            >
              <X class="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
