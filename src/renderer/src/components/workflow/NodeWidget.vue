<script setup lang="ts">
/**
 * One node widget, drawn from its declaration in NODE_DEFS. Used compact on the canvas
 * and full-size in the Parameters panel. `inherited` is the model's own value, shown when
 * the widget is left empty.
 */
import { computed, ref } from 'vue'
import { Dices, Loader2, Upload, X } from '@/lib/icons'
import GalleryPicker from './GalleryPicker.vue'
import Select from '@/components/ui/Select.vue'
import Combobox, { type ComboboxOption } from '@/components/ui/Combobox.vue'
import { apiPostForm, getOutputUrl } from '@/services/api'
import { useModels } from '@/composables/useModels'
import { useSdOptions } from '@/composables/useSdOptions'
import { useToast } from '@/composables/useToast'
import { modelLabel } from '../../../../shared/modelSetup'
import {
  MAX_INPUT_IMAGES,
  type WidgetDef,
  type WidgetValue
} from '../../../../shared/workflowGraph'

const props = withDefaults(
  defineProps<{
    widget: WidgetDef
    value: WidgetValue
    inherited?: unknown
    compact?: boolean
  }>(),
  { inherited: undefined, compact: false }
)
const emit = defineEmits<{ update: [value: WidgetValue] }>()

const { models } = useModels()
const { help } = useSdOptions()
const toast = useToast()
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const inheritedText = computed(() =>
  props.inherited === undefined || props.inherited === null || props.inherited === ''
    ? 'sd.cpp default'
    : String(props.inherited)
)

const choices = computed(() => {
  const w = props.widget
  const list =
    w.choices ||
    (w.choicesFlag
      ? (help.value?.options.find((o) => o.flag === w.choicesFlag)?.choices || []).map((v) => ({
          value: v,
          label: v
        }))
      : [])
  return w.setupKey ? [{ value: '', label: `Recommended (${inheritedText.value})` }, ...list] : list
})

const files = computed(() =>
  props.widget.category
    ? (models.value as unknown as Record<string, string[]>)[props.widget.category] || []
    : []
)
const fileOptions = computed<ComboboxOption[]>(() =>
  files.value.map((file) => ({ value: file, label: modelLabel(file), hint: file }))
)
const images = computed(() => (Array.isArray(props.value) ? props.value : []))

const inputClass = computed(() =>
  props.compact
    ? 'nodrag h-6 w-full min-w-0 rounded border border-input bg-background px-1.5 text-[12px]'
    : 'h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-[13px]'
)

function setNumber(raw: string): void {
  if (raw.trim() === '')
    return emit('update', props.widget.setupKey ? null : (props.widget.default as WidgetValue))
  const n = Number(raw)
  if (Number.isFinite(n)) emit('update', n)
}

async function upload(list: FileList | null): Promise<void> {
  const chosen = Array.from(list || []).filter((f) => f.type.startsWith('image/'))
  if (!chosen.length) return
  uploading.value = true
  try {
    const form = new FormData()
    for (const file of chosen.slice(0, MAX_INPUT_IMAGES)) form.append('images', file, file.name)
    const { filenames } = await apiPostForm<{ filenames: string[] }>('/api/uploads', form)
    emit('update', [...images.value, ...filenames].slice(0, MAX_INPUT_IMAGES))
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not add the images')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function addImage(name: string): void {
  if (!images.value.includes(name))
    emit('update', [...images.value, name].slice(0, MAX_INPUT_IMAGES))
}
</script>

<template>
  <div v-if="widget.kind === 'images'" class="nodrag">
    <div class="grid grid-cols-4 gap-1">
      <div
        v-for="(file, index) in images"
        :key="file"
        class="group relative aspect-square overflow-hidden rounded bg-muted"
      >
        <img :src="getOutputUrl(file)" :alt="`Image ${index + 1}`" class="size-full object-cover" />
        <button
          type="button"
          class="aui-icon-button absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded bg-background/90 group-hover:inline-flex"
          :aria-label="`Remove image ${index + 1}`"
          @click="
            emit(
              'update',
              images.filter((f) => f !== file)
            )
          "
        >
          <X class="size-3" />
        </button>
      </div>
      <button
        v-if="images.length < MAX_INPUT_IMAGES"
        type="button"
        class="flex aspect-square items-center justify-center rounded border border-dashed border-input text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Add images from this device"
        @click="fileInput?.click()"
      >
        <Loader2 v-if="uploading" class="size-3.5 animate-spin" />
        <Upload v-else class="size-3.5" />
      </button>
    </div>
    <GalleryPicker
      label="From Assets"
      trigger-class="mt-1 !h-6 !px-2 !text-[11px]"
      @pick="addImage"
    />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="upload(($event.target as HTMLInputElement).files)"
    />
  </div>

  <textarea
    v-else-if="widget.kind === 'textarea'"
    class="nodrag nowheel w-full resize-y rounded border border-input bg-background px-1.5 py-1 leading-snug placeholder:text-muted-foreground"
    :class="compact ? 'text-[12px]' : 'rounded-md px-2 py-1.5 text-[13px]'"
    :rows="compact ? 2 : 4"
    :value="String(value ?? '')"
    :placeholder="widget.placeholder"
    :aria-label="widget.label"
    @input="emit('update', ($event.target as HTMLTextAreaElement).value)"
  />

  <Select
    v-else-if="widget.kind === 'select'"
    :model-value="String(value ?? '')"
    :options="choices"
    size="sm"
    :class="compact ? 'nodrag w-full !h-6 !text-[12px]' : 'nodrag w-full'"
    @update:model-value="emit('update', $event || null)"
  />

  <Combobox
    v-else-if="widget.kind === 'file'"
    :model-value="String(value ?? '')"
    :options="fileOptions"
    size="sm"
    clearable
    clear-label="None"
    :placeholder="files.length ? 'Choose…' : 'None installed'"
    :aria-label="widget.label"
    :class="compact ? 'nodrag w-full !h-6 !text-[12px]' : 'nodrag w-full'"
    @update:model-value="emit('update', $event)"
  />

  <button
    v-else-if="widget.kind === 'toggle'"
    type="button"
    role="switch"
    :aria-checked="!!value"
    :aria-label="widget.label"
    class="nodrag relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
    :class="value ? 'bg-brand' : 'bg-input'"
    @click="emit('update', !value)"
  >
    <span
      class="inline-block size-3 rounded-full bg-background transition-transform"
      :class="value ? 'translate-x-3.5' : 'translate-x-0.5'"
    />
  </button>

  <div v-else-if="widget.kind === 'seed'" class="nodrag flex min-w-0 items-center gap-1">
    <input
      type="number"
      min="-1"
      :class="inputClass"
      :value="Number(value) >= 0 ? value : ''"
      placeholder="Random"
      :aria-label="widget.label"
      @change="setNumber(($event.target as HTMLInputElement).value || '-1')"
    />
    <button
      type="button"
      class="aui-icon-button inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      :class="compact ? 'size-6' : 'size-8'"
      :aria-label="Number(value) >= 0 ? 'Use a random seed' : 'Fix a seed'"
      v-tip="Number(value) >= 0 ? 'Use a random seed' : 'Fix a seed'"
      @click="emit('update', Number(value) >= 0 ? -1 : Math.floor(Math.random() * 2 ** 31))"
    >
      <Dices class="size-3.5" />
    </button>
  </div>

  <div v-else-if="widget.kind === 'slider'" class="nodrag flex min-w-0 items-center gap-1.5">
    <input
      v-if="!compact"
      type="range"
      class="h-1 min-w-0 flex-1 accent-brand"
      :min="widget.min"
      :max="widget.max"
      :step="widget.step"
      :value="value ?? inherited ?? 0"
      :aria-label="widget.label"
      @input="setNumber(($event.target as HTMLInputElement).value)"
    />
    <input
      type="number"
      :class="[inputClass, !compact && '!w-20 shrink-0']"
      :min="widget.min"
      :max="widget.max"
      :step="widget.step"
      :value="value ?? ''"
      :placeholder="value === null ? inheritedText : ''"
      :aria-label="widget.label"
      @change="setNumber(($event.target as HTMLInputElement).value)"
    />
  </div>

  <input
    v-else-if="widget.kind === 'number'"
    type="number"
    :class="inputClass"
    :min="widget.min"
    :max="widget.max"
    :step="widget.step ?? 1"
    :value="value ?? ''"
    :placeholder="value === null ? inheritedText : ''"
    :aria-label="widget.label"
    @change="setNumber(($event.target as HTMLInputElement).value)"
  />

  <input
    v-else
    type="text"
    :class="inputClass"
    :value="String(value ?? '')"
    :placeholder="widget.placeholder"
    :aria-label="widget.label"
    @change="emit('update', ($event.target as HTMLInputElement).value)"
  />
</template>
