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

const props = withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: false }
)

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
  <div ref="root" class="prompt-preset-controls relative">
    <button
      v-if="compact"
      type="button"
      class="h-9 w-9 md:h-7 md:w-7 metal-icon-button flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      :class="showPresets ? 'primary-metal-button text-white' : ''"
      @click="showPresets = !showPresets"
      title="Prompt Presets"
    >
      <Save class="w-4 h-4 md:w-3 md:h-3" />
    </button>
    <button
      v-else
      type="button"
      class="prompt-preset-trigger h-8 px-3 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
      :class="showPresets ? 'bg-muted text-foreground' : ''"
      @click="showPresets = !showPresets"
    >
      <Save class="w-3.5 h-3.5" />
      Prompt Presets
      <span class="text-[10px] text-muted-foreground">{{ presets.length }}</span>
    </button>

    <div
      v-if="showPresets"
      class="preset-modal absolute right-0 bottom-full z-50 mb-2 w-[min(420px,calc(100vw-2rem))] p-4 space-y-3"
    >
      <div class="preset-modal-header">
        <span class="preset-modal-title">
          <Save class="w-3.5 h-3.5" />
          Prompt Presets
          <span class="text-[10px] font-medium text-muted-foreground">({{ presets.length }})</span>
        </span>
        <button
          @click="showPresets = false"
          class="preset-modal-close"
          title="Close"
          type="button"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="space-y-1.5">
        <label class="preset-modal-label">Save current prompt</label>
        <div class="flex gap-2">
          <input
            v-model="presetName"
            type="text"
            placeholder="Preset name..."
            class="preset-modal-input flex-1 min-w-0"
            @keyup.enter="saveCurrentPreset"
          />
          <button
            @click="saveCurrentPreset"
            :disabled="!presetName.trim()"
            class="h-8 px-3 text-xs font-medium rounded-lg transition-colors shrink-0"
            :class="
              presetName.trim()
                ? 'primary-metal-button text-white'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            "
          >
            Save
          </button>
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="preset-modal-label">Load or manage</label>
        <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <div class="relative">
            <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="presetSearch"
              type="text"
              placeholder="Search presets..."
              class="preset-modal-input w-full pl-8"
            />
          </div>

          <Select
            :model-value="selectedPresetId"
            size="sm"
            placeholder="Select..."
            :options="presetOptions"
            class="h-8 min-w-[8rem]"
            @update:model-value="selectPreset"
          />
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <button
          @click="loadSelectedPreset"
          :disabled="!selectedPreset"
          class="h-8 flex-1 text-xs font-medium rounded-lg transition-colors"
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
          class="h-8 flex-1 text-xs font-medium rounded-lg transition-colors"
          :class="
            selectedPreset
              ? 'bg-muted hover:bg-muted/80 text-foreground border border-border/50'
              : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
          "
        >
          Overwrite
        </button>
        <button
          @click="deleteSelectedPreset"
          :disabled="!selectedPreset"
          class="h-8 w-8 rounded-lg transition-colors flex items-center justify-center"
          :class="
            selectedPreset
              ? 'bg-muted hover:bg-destructive hover:text-destructive-foreground text-muted-foreground border border-border/50'
              : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
          "
          title="Delete prompt preset"
          type="button"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
