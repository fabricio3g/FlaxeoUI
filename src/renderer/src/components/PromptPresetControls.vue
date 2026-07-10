<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Save, Search, Trash2, X } from '@/lib/icons'
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
  <div ref="root" class="relative">
    <button
      v-if="compact"
      type="button"
      class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      :class="showPresets ? 'bg-foreground text-background hover:bg-foreground hover:text-background' : ''"
      @click="showPresets = !showPresets"
      title="Prompt Presets"
      aria-label="Toggle prompt presets"
    >
      <Save class="size-3.5" />
    </button>
    <button
      v-else
      type="button"
      class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      :class="showPresets ? 'bg-accent text-accent-foreground' : ''"
      @click="showPresets = !showPresets"
    >
      <Save class="h-3.5 w-3.5" />
      Prompt Presets
      <span class="text-[10px] text-muted-foreground">{{ presets.length }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="showPresets"
        class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm"
        @click="showPresets = false"
      >
        <div
          class="flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-label="Prompt presets"
          @click.stop
        >
          <div class="flex items-center justify-between border-b border-border pb-2">
            <span class="flex items-center gap-2 text-sm font-semibold">
              <Save class="h-3.5 w-3.5" />
              Prompt Presets
              <span class="text-[10px] font-medium text-muted-foreground">({{ presets.length }})</span>
            </span>
            <button
              type="button"
              @click="showPresets = false"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Close"
              aria-label="Close"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="space-y-1.5">
            <label class="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Save current prompt</label>
            <div class="flex gap-2">
              <input
                v-model="presetName"
                type="text"
                placeholder="Preset name..."
                class="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
                @keyup.enter="saveCurrentPreset"
              />
              <button
                type="button"
                @click="saveCurrentPreset"
                :disabled="!presetName.trim()"
                class="inline-flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-medium transition-colors"
                :class="
                  presetName.trim()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                "
              >
                Save
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Load or manage</label>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
              <div class="relative">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  v-model="presetSearch"
                  type="text"
                  placeholder="Search presets..."
                  class="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
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
              type="button"
              @click="loadSelectedPreset"
              :disabled="!selectedPreset"
              class="inline-flex h-8 flex-1 items-center justify-center rounded-md text-xs font-medium transition-colors"
              :class="
                selectedPreset
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'cursor-not-allowed bg-muted text-muted-foreground'
              "
            >
              Load
            </button>
            <button
              type="button"
              @click="overwriteSelectedPreset"
              :disabled="!selectedPreset"
              class="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-input bg-background text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              Overwrite
            </button>
            <button
              type="button"
              @click="deleteSelectedPreset"
              :disabled="!selectedPreset"
              class="inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Delete prompt preset"
              aria-label="Delete prompt preset"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
