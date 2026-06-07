<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Save, Search, Trash2 } from 'lucide-vue-next'
import Select from '@/components/ui/Select.vue'
import { usePromptPresetStore } from '@/stores/promptPresets'

const prompt = defineModel<string>('prompt', { required: true })
const negativePrompt = defineModel<string>('negativePrompt', { required: true })

const promptPresetStore = usePromptPresetStore()
const { presets, selectedPresetId } = storeToRefs(promptPresetStore)

const presetName = ref('')
const presetSearch = ref('')
const showPresets = ref(false)
const root = ref<HTMLElement | null>(null)

const filteredPresets = computed(() => {
  const query = presetSearch.value.trim().toLowerCase()
  if (!query) return presets.value

  return presets.value.filter(
    (preset) =>
      preset.name.toLowerCase().includes(query) ||
      preset.prompt.toLowerCase().includes(query) ||
      preset.negativePrompt.toLowerCase().includes(query)
  )
})

const selectedPreset = computed(() =>
  presets.value.find((preset) => preset.id === selectedPresetId.value)
)

const presetOptions = computed(() => [
  { label: 'Select prompt...', value: '' },
  ...(
    selectedPreset.value && !filteredPresets.value.some((preset) => preset.id === selectedPreset.value?.id)
      ? [selectedPreset.value, ...filteredPresets.value]
      : filteredPresets.value
  ).map((preset) => ({
    label: preset.name,
    value: preset.id
  }))
])

function saveCurrentPreset(): void {
  const savedPreset = promptPresetStore.savePreset(
    presetName.value,
    prompt.value,
    negativePrompt.value
  )
  if (savedPreset) {
    presetName.value = ''
    presetSearch.value = ''
  }
}

function selectPreset(id: string): void {
  selectedPresetId.value = id
}

function loadSelectedPreset(): void {
  if (!selectedPreset.value) return

  prompt.value = selectedPreset.value.prompt
  negativePrompt.value = selectedPreset.value.negativePrompt
  showPresets.value = false
}

function overwriteSelectedPreset(): void {
  if (!selectedPresetId.value) return
  promptPresetStore.updatePreset(selectedPresetId.value, prompt.value, negativePrompt.value)
}

function deleteSelectedPreset(): void {
  if (!selectedPresetId.value) return
  promptPresetStore.deletePreset(selectedPresetId.value)
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!showPresets.value || !root.value) return
  if (root.value.contains(event.target as Node)) return
  showPresets.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<template>
  <div ref="root" class="prompt-preset-controls relative h-8 w-fit">
    <button
      type="button"
      class="prompt-preset-trigger h-8 px-3 text-xs font-medium rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
      :class="showPresets ? 'bg-muted text-foreground' : ''"
      @click="showPresets = !showPresets"
    >
      <Save class="w-3.5 h-3.5" />
      Prompt Presets
      <span class="text-[10px] text-muted-foreground">{{ presets.length }}</span>
    </button>

    <div
      v-if="showPresets"
      class="absolute left-0 bottom-full z-50 mb-2 w-[min(520px,calc(100vw-2rem))] rounded-xl border border-border/70 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur space-y-2"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Save class="w-3.5 h-3.5" />
        Prompt Presets
        </span>
        <span class="text-[10px] text-muted-foreground">{{ presets.length }} saved</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <input
          v-model="presetName"
          type="text"
          placeholder="Preset name..."
          class="h-8 min-w-0 px-2 text-xs rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          @keyup.enter="saveCurrentPreset"
        />
        <button
          @click="saveCurrentPreset"
          :disabled="!presetName.trim()"
          class="h-8 text-xs font-medium rounded-md transition-colors"
          :class="
            presetName.trim()
              ? 'primary-metal-button text-white'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          "
        >
          Save
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div class="relative">
          <Search class="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="presetSearch"
            type="text"
            placeholder="Search prompts..."
            class="h-8 w-full pl-7 pr-2 text-xs rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>

        <Select
          :model-value="selectedPresetId"
          size="sm"
          placeholder="Select prompt..."
          :options="presetOptions"
          class="h-8"
          @update:model-value="selectPreset"
        />
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="loadSelectedPreset"
          :disabled="!selectedPreset"
          class="h-8 flex-1 text-xs font-medium rounded-md transition-colors"
          :class="
            selectedPreset
              ? 'primary-metal-button text-white'
              : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
          "
        >
          Load
        </button>
        <button
          @click="overwriteSelectedPreset"
          :disabled="!selectedPreset"
          class="h-8 flex-1 text-xs font-medium rounded-md transition-colors"
          :class="
            selectedPreset
              ? 'bg-muted/60 hover:bg-muted text-foreground'
              : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
          "
        >
          Overwrite
        </button>
        <button
          @click="deleteSelectedPreset"
          :disabled="!selectedPreset"
          class="h-8 flex-1 rounded-md transition-colors flex items-center justify-center"
          :class="
            selectedPreset
              ? 'bg-muted/60 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground'
              : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
          "
          title="Delete prompt preset"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
