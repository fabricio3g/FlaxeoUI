<script setup lang="ts">
/** Create or edit a style kit: style text, negatives, palette, LoRAs and preferred sizes. */
import { computed, ref, watch } from 'vue'
import { Plus, Trash2, X } from '@/lib/icons'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Combobox, { type ComboboxOption } from '@/components/ui/Combobox.vue'
import { useLibraryStore } from '@/stores/library'
import { useModels } from '@/composables/useModels'
import { useToast } from '@/composables/useToast'
import { requestConfirm } from '@/composables/useConfirm'
import { createLibraryId, paletteText, type StyleKit } from '../../../../shared/library'
import { modelLabel } from '../../../../shared/modelSetup'

const props = defineProps<{ open: boolean; kit: StyleKit | null }>()
const emit = defineEmits<{ close: []; saved: [kit: StyleKit] }>()

const library = useLibraryStore()
const { models } = useModels()
const toast = useToast()
const draft = ref<StyleKit>(blank())
const saving = ref(false)

function blank(): StyleKit {
  const now = Date.now()
  return {
    id: createLibraryId('kit'),
    name: '',
    description: '',
    stylePrompt: '',
    negativePrompt: '',
    palette: [],
    sizes: [],
    loras: [],
    createdAt: now,
    updatedAt: now,
    updatedBy: ''
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) draft.value = props.kit ? JSON.parse(JSON.stringify(props.kit)) : blank()
  },
  { immediate: true }
)

const loraOptions = computed<ComboboxOption[]>(() =>
  (models.value.loras || [])
    .map((file) => file.replace(/\.(safetensors|gguf|pt)$/i, ''))
    .filter((name) => !draft.value.loras.some((l) => l.path === name))
    .map((name) => ({ value: name, label: modelLabel(name) }))
)

const preview = computed(() =>
  ['your prompt', draft.value.stylePrompt.trim(), paletteText(draft.value.palette)]
    .filter(Boolean)
    .join(', ')
)

function addColor(): void {
  if (draft.value.palette.length < 8) draft.value.palette.push('#c8643c')
}

async function save(): Promise<void> {
  if (!draft.value.name.trim()) {
    toast.error('Give the style kit a name.')
    return
  }
  saving.value = true
  try {
    const saved = await library.saveStyleKit(draft.value)
    emit('saved', saved)
    emit('close')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save the style kit')
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.kit) return
  const ok = await requestConfirm({
    title: `Delete "${props.kit.name}"?`,
    message: 'Images made with it stay in Assets.',
    confirmLabel: 'Delete'
  })
  if (!ok) return
  await library.deleteItem('style-kits', props.kit.id)
  emit('close')
}
</script>

<template>
  <Dialog :open="open" :title="kit ? 'Edit style kit' : 'New style kit'" @close="emit('close')">
    <div class="space-y-4 pb-2 text-[13px]">
      <label class="block">
        <span class="mb-1 block text-muted-foreground">Name</span>
        <input
          v-model="draft.name"
          class="h-8 w-full rounded-md border border-input bg-background px-2.5"
          placeholder="e.g. Studio product shots"
        />
      </label>
      <label class="block">
        <span class="mb-1 block text-muted-foreground">Added to every prompt</span>
        <textarea
          v-model="draft.stylePrompt"
          rows="2"
          class="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5"
          placeholder="soft studio light, seamless backdrop, 85mm"
        />
      </label>
      <label class="block">
        <span class="mb-1 block text-muted-foreground">Added to every negative prompt</span>
        <textarea
          v-model="draft.negativePrompt"
          rows="2"
          class="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5"
          placeholder="watermark, text, blurry"
        />
      </label>

      <div>
        <span class="mb-1 block text-muted-foreground">Palette</span>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-for="(_, index) in draft.palette"
            :key="index"
            class="inline-flex items-center gap-1"
          >
            <input
              v-model="draft.palette[index]"
              type="color"
              class="size-7 cursor-pointer rounded-md border border-input bg-transparent"
              :aria-label="`Color ${index + 1}`"
            />
            <button
              type="button"
              class="aui-icon-button rounded p-0.5 text-muted-foreground hover:text-foreground"
              :aria-label="`Remove color ${index + 1}`"
              @click="draft.palette.splice(index, 1)"
            >
              <X class="size-3" />
            </button>
          </span>
          <Button v-if="draft.palette.length < 8" size="sm" @click="addColor">
            <Plus class="size-3.5" /> Color
          </Button>
        </div>
      </div>

      <div>
        <span class="mb-1 block text-muted-foreground">LoRAs</span>
        <div
          v-for="(lora, index) in draft.loras"
          :key="lora.path"
          class="flex items-center gap-2 py-0.5"
        >
          <span class="min-w-0 flex-1 truncate">{{ lora.path }}</span>
          <input
            v-model.number="lora.strength"
            type="number"
            step="0.05"
            class="h-7 w-20 rounded-md border border-input bg-background px-1.5 text-right tabular-nums"
            :aria-label="`${lora.path} strength`"
          />
          <button
            type="button"
            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            :aria-label="`Remove ${lora.path}`"
            @click="draft.loras.splice(index, 1)"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <Combobox
          model-value=""
          :options="loraOptions"
          size="sm"
          placeholder="Add LoRA"
          :empty-text="models.loras?.length ? 'All added' : 'No LoRAs in models/loras'"
          class="mt-1 w-full"
          @update:model-value="(v: string) => v && draft.loras.push({ path: v, strength: 0.8 })"
        />
      </div>

      <p class="text-xs text-muted-foreground">Prompts become: {{ preview }}</p>
    </div>
    <template #footer>
      <Button v-if="kit" variant="destructive" class="mr-auto" @click="remove">
        <Trash2 class="size-3.5" /> Delete
      </Button>
      <Button @click="emit('close')">Cancel</Button>
      <Button variant="primary" :disabled="saving" @click="save">Save</Button>
    </template>
  </Dialog>
</template>
