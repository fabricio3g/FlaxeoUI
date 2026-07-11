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
const dialog = ref<HTMLElement | null>(null)

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
  ...(selectedPreset.value &&
  !filteredPresets.value.some((preset) => preset.id === selectedPreset.value?.id)
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
  const target = event.target as HTMLElement
  if (
    root.value.contains(target) ||
    dialog.value?.contains(target) ||
    target.closest('[data-slot="select-content"]')
  )
    return
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
  <div ref="root" class="relative inline-flex">
    <button
      v-if="compact"
      type="button"
      class="aui-icon-button inline-flex size-10 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all duration-150 hover:border-border hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      :class="showPresets ? 'border-border bg-background text-foreground shadow-sm' : ''"
      @click="showPresets = !showPresets"
      title="Prompt Presets"
      aria-label="Toggle prompt presets"
    >
      <Save class="size-4" />
    </button>
    <button
      v-else
      type="button"
      class="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-3.5 text-xs font-medium text-muted-foreground shadow-sm transition-all duration-150 hover:border-foreground/20 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      :class="showPresets ? 'border-foreground/20 bg-background text-foreground' : ''"
      @click="showPresets = !showPresets"
    >
      <Save class="h-3.5 w-3.5" />
      Prompt Presets
      <span class="text-[10px] text-muted-foreground">{{ presets.length }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="showPresets"
        class="aui-dialog-backdrop fade-in animate-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm duration-200 motion-reduce:animate-none"
        @click.self="showPresets = false"
      >
        <div
          ref="dialog"
          class="aui-dialog-surface fade-in slide-in-from-bottom-2 zoom-in-95 animate-in fill-mode-both flex max-h-[min(42rem,calc(100vh-2rem))] w-[min(27rem,calc(100vw-2rem))] flex-col gap-0 overflow-y-auto rounded-[24px] border border-border/70 bg-popover/95 text-popover-foreground shadow-[0_2px_4px_rgb(0_0_0/0.06),0_24px_64px_rgb(0_0_0/0.18)] backdrop-blur-xl duration-200 motion-reduce:animate-none"
          role="dialog"
          aria-modal="true"
          aria-label="Prompt presets"
          @click.stop
        >
          <div class="flex items-center justify-between px-5 pb-3 pt-5">
            <span class="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <span
                class="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <Save class="h-3.5 w-3.5" />
              </span>
              Prompt Presets
              <span
                class="aui-status-badge rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >{{ presets.length }}</span
              >
            </span>
            <button
              type="button"
              @click="showPresets = false"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Close"
              aria-label="Close"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="space-y-2 px-5 pb-5 pt-2">
            <label class="aui-label block text-xs font-medium text-muted-foreground"
              >Save current prompt</label
            >
            <div class="flex gap-2">
              <input
                v-model="presetName"
                type="text"
                placeholder="Preset name..."
                class="aui-field h-10 min-w-0 flex-1 rounded-xl border border-input bg-background/70 px-3 text-sm text-foreground shadow-sm transition-colors duration-150 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                @keyup.enter="saveCurrentPreset"
              />
              <button
                type="button"
                @click="saveCurrentPreset"
                :disabled="!presetName.trim()"
                class="inline-flex h-10 shrink-0 items-center rounded-full px-4 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                :class="
                  presetName.trim()
                    ? 'bg-foreground text-background shadow-sm hover:bg-foreground/85'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                "
              >
                Save
              </button>
            </div>
          </div>

          <div class="space-y-2 border-t border-border/60 px-5 py-5">
            <label class="aui-label block text-xs font-medium text-muted-foreground"
              >Load or manage</label
            >
            <div class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
              <div class="relative">
                <Search
                  class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  v-model="presetSearch"
                  type="text"
                  placeholder="Search presets..."
                  class="aui-field h-10 w-full rounded-xl border border-input bg-background/70 pl-9 pr-3 text-sm text-foreground shadow-sm transition-colors duration-150 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <Select
                :model-value="selectedPresetId"
                size="sm"
                placeholder="Select..."
                :options="presetOptions"
                class="h-10 min-w-[8rem] rounded-xl bg-background/70"
                @update:model-value="selectPreset"
              />
            </div>
          </div>

          <div class="flex items-center gap-2 border-t border-border/60 bg-muted/30 px-5 py-4">
            <button
              type="button"
              @click="loadSelectedPreset"
              :disabled="!selectedPreset"
              class="inline-flex h-9 flex-1 items-center justify-center rounded-full text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :class="
                selectedPreset
                  ? 'bg-foreground text-background shadow-sm hover:bg-foreground/85'
                  : 'cursor-not-allowed bg-muted text-muted-foreground'
              "
            >
              Load
            </button>
            <button
              type="button"
              @click="overwriteSelectedPreset"
              :disabled="!selectedPreset"
              class="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-input bg-background text-xs font-medium shadow-sm transition-all duration-150 hover:border-foreground/20 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              Overwrite
            </button>
            <button
              type="button"
              @click="deleteSelectedPreset"
              :disabled="!selectedPreset"
              class="aui-icon-button inline-flex size-9 items-center justify-center rounded-full border border-input bg-background text-muted-foreground shadow-sm transition-all duration-150 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
