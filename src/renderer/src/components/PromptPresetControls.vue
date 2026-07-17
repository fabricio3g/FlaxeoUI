<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { FileText, Search, Trash2 } from '@/lib/icons'
import Select from '@/components/ui/Select.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePromptPresetStore } from '@/stores/promptPresets'
import { useToast } from '@/composables/useToast'
import { requestConfirm } from '@/composables/useConfirm'
import { notifyComposerPopoverOpen, onComposerPopoverOpen } from '@/lib/appEvents'

const prompt = defineModel<string>('prompt', { required: true })
const negativePrompt = defineModel<string>('negativePrompt', { required: true })

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: false }
)

const toast = useToast()
const promptPresetStore = usePromptPresetStore()
const { presets, selectedPresetId } = storeToRefs(promptPresetStore)

const presetName = ref('')
const presetSearch = ref('')
const open = ref(false)

watch(open, (isOpen) => {
  if (isOpen) notifyComposerPopoverOpen('prompt-presets')
})

let unsubPopover: (() => void) | null = null
onMounted(() => {
  unsubPopover = onComposerPopoverOpen((id) => {
    if (id !== 'prompt-presets') open.value = false
  })
})
onUnmounted(() => {
  unsubPopover?.()
})

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

const canSave = computed(
  () =>
    Boolean(presetName.value.trim()) && Boolean(prompt.value.trim() || negativePrompt.value.trim())
)

const matchingNamePreset = computed(() => {
  const name = presetName.value.trim().toLowerCase()
  if (!name) return null
  return presets.value.find((preset) => preset.name.toLowerCase() === name) || null
})

const presetOptions = computed(() => [
  { label: presets.value.length ? 'Select preset…' : 'No presets yet', value: '' },
  ...filteredPresets.value.map((preset) => ({
    label: preset.name,
    value: preset.id
  }))
])

function previewText(text: string, max = 72): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Empty prompt'
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned
}

function saveCurrentPreset(): void {
  if (!canSave.value) return

  const result = promptPresetStore.saveOrUpdateByName(
    presetName.value,
    prompt.value,
    negativePrompt.value
  )
  if (!result) return

  presetName.value = ''
  toast.success(
    result.updated ? `Updated “${result.preset.name}”` : `Saved “${result.preset.name}”`
  )
}

function selectPreset(id: string): void {
  selectedPresetId.value = id
}

function loadSelectedPreset(): void {
  const preset = presets.value.find((item) => item.id === selectedPresetId.value)
  if (!preset) return

  prompt.value = preset.prompt
  negativePrompt.value = preset.negativePrompt
  toast.success(`Loaded “${preset.name}”`)
  open.value = false
}

function overwriteSelectedPreset(): void {
  if (!selectedPresetId.value) return
  if (!prompt.value.trim() && !negativePrompt.value.trim()) {
    toast.error('Nothing to save — write a prompt first')
    return
  }
  const preset = presets.value.find((item) => item.id === selectedPresetId.value)
  promptPresetStore.updatePreset(selectedPresetId.value, prompt.value, negativePrompt.value)
  toast.success(preset ? `Updated “${preset.name}”` : 'Preset updated')
}

async function deleteSelectedPreset(): Promise<void> {
  if (!selectedPresetId.value) return
  const preset = presets.value.find((item) => item.id === selectedPresetId.value)
  if (preset) {
    const ok = await requestConfirm({
      title: 'Delete preset',
      message: `Delete prompt preset “${preset.name}”?`,
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
  }
  promptPresetStore.deletePreset(selectedPresetId.value)
  toast.success(preset ? `Deleted “${preset.name}”` : 'Preset deleted')
}

const selectedPreset = computed(() =>
  presets.value.find((preset) => preset.id === selectedPresetId.value)
)
</script>

<template>
  <Popover v-model:open="open">
    <!-- Do not wrap PopoverTrigger in Tooltip — breaks as-child click handling -->
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex items-center text-muted-foreground transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        :class="
          compact
            ? [
                'aui-icon-button relative size-10 shrink-0 justify-center rounded-full border border-transparent hover:border-border hover:bg-background hover:text-foreground',
                open ? 'border-border bg-background text-foreground shadow-sm' : ''
              ]
            : [
                'h-9 gap-1.5 rounded-full border border-border/80 bg-background/80 px-3.5 text-xs font-medium shadow-sm hover:border-foreground/20 hover:bg-background hover:text-foreground',
                open ? 'border-border bg-background text-foreground' : ''
              ]
        "
        title="Prompt presets — save and reuse positive/negative prompts"
        aria-label="Prompt presets"
      >
        <FileText :class="compact ? 'size-4' : 'h-3.5 w-3.5'" />
        <template v-if="!compact">
          Prompt presets
          <span class="text-[10px] text-muted-foreground">{{ presets.length }}</span>
        </template>
        <span
          v-else-if="presets.length"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-semibold tabular-nums text-background"
        >
          {{ presets.length > 99 ? '99+' : presets.length }}
        </span>
      </button>
    </PopoverTrigger>

    <PopoverContent
      side="top"
      align="end"
      :side-offset="8"
      :collision-padding="12"
      class="flex w-80 max-h-[min(70vh,36rem)] flex-col overflow-hidden p-0"
    >
      <div class="shrink-0 border-b border-border/60 px-3 py-2.5">
        <p class="text-sm font-semibold">Prompt presets</p>
        <p class="mt-0.5 text-[11px] text-muted-foreground">
          Save and reuse positive / negative prompts
        </p>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">

      <!-- Save -->
      <label class="block text-[10px] font-medium text-muted-foreground">
        Save current
        <span v-if="matchingNamePreset" class="font-normal text-muted-foreground/80">
          · updates existing
        </span>
        <div class="mt-1 flex gap-1.5">
          <input
            v-model="presetName"
            type="text"
            placeholder="Preset name…"
            class="aui-field h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
            @keyup.enter="saveCurrentPreset"
          />
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center rounded-md px-2.5 text-[11px] font-medium transition-colors"
            :class="
              canSave
                ? 'bg-foreground text-background hover:bg-foreground/85'
                : 'cursor-not-allowed bg-muted text-muted-foreground'
            "
            :disabled="!canSave"
            @click="saveCurrentPreset"
          >
            {{ matchingNamePreset ? 'Update' : 'Save' }}
          </button>
        </div>
      </label>

      <!-- Load / manage -->
      <div class="mt-3 space-y-2 border-t border-border/60 pt-3">
        <label class="block text-[10px] font-medium text-muted-foreground">
          Search
          <div class="relative mt-1">
            <Search
              class="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            />
            <input
              v-model="presetSearch"
              type="search"
              placeholder="Filter presets…"
              class="aui-field h-8 w-full rounded-md border border-input bg-background py-0 pl-7 pr-2 text-xs text-foreground outline-none"
            />
          </div>
        </label>

        <label class="block text-[10px] font-medium text-muted-foreground">
          Load preset
          <Select
            :model-value="selectedPresetId"
            size="sm"
            aria-label="Select prompt preset"
            class="mt-1"
            :options="presetOptions"
            @update:model-value="selectPreset"
          />
        </label>

        <p
          v-if="selectedPreset"
          class="line-clamp-2 rounded-md bg-muted/40 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground"
        >
          {{ previewText(selectedPreset.prompt) }}
        </p>
      </div>

      <div class="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          class="inline-flex h-8 flex-1 items-center justify-center rounded-md text-[11px] font-medium transition-colors"
          :class="
            selectedPreset
              ? 'bg-foreground text-background hover:bg-foreground/85'
              : 'cursor-not-allowed bg-muted text-muted-foreground'
          "
          :disabled="!selectedPreset"
          @click="loadSelectedPreset"
        >
          Load
        </button>
        <button
          type="button"
          class="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-input bg-background text-[11px] font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!selectedPreset"
          @click="overwriteSelectedPreset"
        >
          Overwrite
        </button>
        <button
          type="button"
          class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!selectedPreset"
          title="Delete preset"
          aria-label="Delete preset"
          @click="deleteSelectedPreset"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
