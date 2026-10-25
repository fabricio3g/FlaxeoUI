<script setup lang="ts">
/**
 * The prompt box docked under the session feed: mode, attached images (each with a role),
 * prompt, and the chips that matter per generation. Every other option lives in the
 * Options panel. Emits `generate`; the view adds the mask and submits.
 */
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowUp,
  Ban,
  Check,
  Dices,
  Images,
  Loader2,
  Lock,
  LockOpen,
  Palette,
  Paperclip,
  SlidersHorizontal,
  Upload,
  X
} from '@/lib/icons'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import PromptPresetControls from '@/components/PromptPresetControls.vue'
import GalleryPicker from '@/components/workflow/GalleryPicker.vue'
import ModelPicker from './ModelPicker.vue'
import SizeMenu from './SizeMenu.vue'
import StyleKitDialog from './StyleKitDialog.vue'
import { apiPostForm, getOutputUrl } from '@/services/api'
import { useLibraryStore } from '@/stores/library'
import { useToast } from '@/composables/useToast'
import type { ModelSetup } from '../../../../shared/modelSetup'
import type { CreateMode, InputRole, RowInput } from '../../../../shared/sessions'
import type { StyleKit } from '../../../../shared/library'

export interface ComposerSubmit {
  prompt: string
  negativePrompt: string
  inputs: RowInput[]
  count: number
  seed: number
}

const props = defineProps<{
  setup: ModelSetup
  /** Generation in progress (Generate still queues more) */
  busy: boolean
  optionsOpen: boolean
  /** Edit mode with a painted mask: the start image becomes the inpaint source */
  masking: boolean
}>()

const mode = defineModel<CreateMode>('mode', { required: true })
const inputs = defineModel<RowInput[]>('inputs', { required: true })
const prompt = defineModel<string>('prompt', { required: true })

const emit = defineEmits<{
  generate: [request: ComposerSubmit]
  updateSetup: [setup: Partial<ModelSetup>]
  toggleOptions: []
  cancel: []
}>()

const library = useLibraryStore()
const toast = useToast()
const negativePrompt = ref('')
const showNegative = ref(false)
const count = ref(1)
const seed = ref(-1)
const seedLocked = ref(false)
const uploading = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const promptBox = ref<HTMLTextAreaElement | null>(null)
const kitDialog = ref<{ open: boolean; kit: StyleKit | null }>({ open: false, kit: null })

const COUNTS = Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

const MODES = [
  { value: 'image', label: 'Image' },
  { value: 'edit', label: 'Edit' },
  { value: 'video', label: 'Video' }
]

interface RoleInfo {
  value: InputRole
  label: string
  /** What sd.cpp does with it, in plain words */
  description: string
  /** Model file the role needs (setup key) and how to name it */
  needs?: { key: 'controlNetModel' | 'ipAdapterModel' | 'photoMakerModel'; label: string }
}

/**
 * Attached-image uses, matching how sd.cpp consumes them:
 * reference → -r · start → -i (+ --strength) · control → --control-image ·
 * style → --ip-adapter-image · identity → PhotoMaker id images · end → --end-img
 */
const ROLES: Record<CreateMode, RoleInfo[]> = {
  image: [
    {
      value: 'reference',
      label: 'Reference',
      description:
        'Edit models (FLUX Kontext, FLUX.2/3, Qwen Image Edit…) look at it and follow it. Add several to combine them.'
    },
    {
      value: 'start',
      label: 'Start from this image',
      description: 'Redraws this image with your prompt. Strength in Options sets how much changes.'
    },
    {
      value: 'control',
      label: 'Pose / edges guide',
      description: 'Keeps its pose, edges or depth (ControlNet).',
      needs: { key: 'controlNetModel', label: 'a ControlNet model' }
    },
    {
      value: 'style',
      label: 'Style reference',
      description: 'Borrows its look and colors (IP-Adapter, SD 1.5 / SDXL).',
      needs: { key: 'ipAdapterModel', label: 'an IP-Adapter model' }
    },
    {
      value: 'identity',
      label: 'Face to keep',
      description: "Keeps this person's face (PhotoMaker, SDXL).",
      needs: { key: 'photoMakerModel', label: 'a PhotoMaker model' }
    }
  ],
  edit: [
    {
      value: 'start',
      label: 'Image to edit',
      description: 'The picture that changes. Paint a mask to change only part of it.'
    },
    {
      value: 'reference',
      label: 'Extra reference',
      description: 'Something to bring into the edit, like a product, outfit or face.'
    }
  ],
  video: [
    {
      value: 'start',
      label: 'First frame',
      description: 'The video starts from this image.'
    },
    {
      value: 'end',
      label: 'Last frame',
      description: 'The video ends on this image. Needs a first frame too (Wan first-last-frame).'
    },
    {
      value: 'reference',
      label: 'Reference',
      description: 'Characters or objects to keep in the video (MiniMax-H3 and similar).'
    }
  ]
}

const roleInfo = (role: InputRole): RoleInfo | undefined =>
  ROLES[mode.value].find((r) => r.value === role)
const roleLabel = (role: InputRole): string => roleInfo(role)?.label || role

/** One word for the tile; the menu has the full name and explanation. */
const SHORT: Record<CreateMode, Partial<Record<InputRole, string>>> = {
  image: {
    reference: 'Reference',
    start: 'Start',
    control: 'Pose',
    style: 'Style',
    identity: 'Face'
  },
  edit: { start: 'Edit this', reference: 'Reference' },
  video: { start: 'First', end: 'Last', reference: 'Reference' }
}
const roleShort = (role: InputRole): string => SHORT[mode.value][role] || roleLabel(role)

/** Why a role will be ignored with the current model setup, or ''. */
function roleWarning(role: InputRole): string {
  const info = roleInfo(role)
  if (info?.needs && !props.setup[info.needs.key]) return `Needs ${info.needs.label} (Options).`
  return ''
}

const placeholder = computed(() =>
  mode.value === 'edit'
    ? 'Describe the change'
    : mode.value === 'video'
      ? 'Describe the shot and the motion'
      : 'Describe what you want to see'
)

/** Keep roles valid when the mode changes (e.g. a ControlNet image moving to Video). */
watch(mode, (next) => {
  const allowed = ROLES[next].map((r) => r.value)
  inputs.value = inputs.value.map((input, index) =>
    allowed.includes(input.role) ? input : { ...input, role: defaultRole(next, index) }
  )
})

function defaultRole(target: CreateMode, index: number): InputRole {
  const taken = (role: InputRole): boolean =>
    inputs.value.some((input, i) => i !== index && input.role === role)
  if (target === 'edit') return taken('start') ? 'reference' : 'start'
  if (target === 'video') return !taken('start') ? 'start' : !taken('end') ? 'end' : 'reference'
  return 'reference'
}

function addFiles(names: string[]): void {
  const next = [...inputs.value]
  for (const file of names) {
    if (next.length >= 16) break
    next.push({ file, role: 'reference' })
    next[next.length - 1].role = defaultRoleFor(next)
  }
  inputs.value = next
}

function defaultRoleFor(list: RowInput[]): InputRole {
  const has = (role: InputRole): boolean => list.slice(0, -1).some((i) => i.role === role)
  if (mode.value === 'edit') return has('start') ? 'reference' : 'start'
  if (mode.value === 'video') return !has('start') ? 'start' : !has('end') ? 'end' : 'reference'
  return 'reference'
}

async function upload(files: File[]): Promise<void> {
  const images = files.filter((file) => file.type.startsWith('image/'))
  if (!images.length) return
  uploading.value = true
  try {
    const form = new FormData()
    for (const file of images.slice(0, 16)) form.append('images', file, file.name)
    const { filenames } = await apiPostForm<{ filenames: string[] }>('/api/uploads', form)
    addFiles(filenames)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not attach the images')
  } finally {
    uploading.value = false
  }
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  void upload(Array.from(input.files || []))
  input.value = ''
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length) return void upload(files)
  // Dragged from the feed: an output file name
  const name = event.dataTransfer?.getData('application/x-flaxeo-output')
  if (name) addFiles([name])
}

function onPaste(event: ClipboardEvent): void {
  const files = Array.from(event.clipboardData?.files || [])
  if (files.length) {
    event.preventDefault()
    void upload(files)
  }
}

function setRole(index: number, role: InputRole): void {
  inputs.value = inputs.value.map((input, i) => (i === index ? { ...input, role } : input))
}

function removeInput(index: number): void {
  inputs.value = inputs.value.filter((_, i) => i !== index)
}

function autoResize(): void {
  const el = promptBox.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

watch(prompt, () => void nextTick(autoResize))

function generate(): void {
  emit('generate', {
    prompt: prompt.value.trim(),
    negativePrompt: negativePrompt.value.trim(),
    inputs: inputs.value,
    count: count.value,
    seed: seedLocked.value ? seed.value : -1
  })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    generate()
  }
}

function randomizeSeed(): void {
  seed.value = Math.floor(Math.random() * 2 ** 31)
  seedLocked.value = true
}

function focus(): void {
  promptBox.value?.focus()
}

function openKit(kit: StyleKit | null): void {
  kitDialog.value = { open: true, kit }
}

/** Load a row's prompt/seed back in ("Reuse"). */
function reuse(values: {
  prompt: string
  negativePrompt: string
  seed: number
  count: number
}): void {
  prompt.value = values.prompt
  negativePrompt.value = values.negativePrompt
  showNegative.value = !!values.negativePrompt
  count.value = values.count
  if (values.seed >= 0) {
    seed.value = values.seed
    seedLocked.value = true
  }
  void nextTick(() => {
    autoResize()
    focus()
  })
}

defineExpose({ focus, reuse, addFiles })
</script>

<template>
  <div
    class="aui-composer rounded-xl border border-border bg-card"
    :class="dragging && 'border-brand'"
    @dragover.prevent="dragging = true"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <div v-if="inputs.length || uploading" class="flex gap-2.5 overflow-x-auto px-3 pb-1 pt-3">
      <div
        v-for="(input, index) in inputs"
        :key="input.file + index"
        class="group relative size-16 shrink-0"
      >
        <Popover>
          <PopoverTrigger as-child>
            <button
              type="button"
              class="relative block size-16 overflow-hidden rounded-lg bg-muted ring-1 ring-border"
              :class="roleWarning(input.role) && 'ring-warning'"
              :aria-label="`Image ${index + 1}: ${roleLabel(input.role)}. Change its use`"
              v-tip="roleWarning(input.role) || `${roleLabel(input.role)} · click to change`"
            >
              <img :src="getOutputUrl(input.file)" alt="" class="size-full object-cover" />
              <span
                class="absolute inset-x-1 bottom-1 truncate rounded bg-background/90 px-1 py-px text-center text-[10px] font-medium leading-4"
                :class="roleWarning(input.role) ? 'text-warning' : 'text-foreground'"
                >{{ roleShort(input.role) }}</span
              >
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" class="w-72 p-1">
            <p class="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">Use this image as</p>
            <button
              v-for="role in ROLES[mode]"
              :key="role.value"
              type="button"
              class="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-accent"
              :class="input.role === role.value && 'bg-accent'"
              @click="setRole(index, role.value)"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-[13px] font-medium">{{ role.label }}</span>
                <span class="block text-xs leading-snug text-muted-foreground">{{
                  role.description
                }}</span>
                <span
                  v-if="role.needs && !setup[role.needs.key]"
                  class="mt-0.5 block text-xs text-warning"
                  >Needs {{ role.needs.label }} in Options.</span
                >
              </span>
              <Check v-if="input.role === role.value" class="mt-0.5 size-3.5 shrink-0" />
            </button>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          class="aui-icon-button absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full border border-border bg-popover text-foreground shadow-sm group-hover:inline-flex group-focus-within:inline-flex"
          :aria-label="`Remove image ${index + 1}`"
          v-tip="'Remove'"
          @click="removeInput(index)"
        >
          <X class="size-3" />
        </button>
      </div>
      <div v-if="uploading" class="flex size-16 items-center justify-center rounded-md bg-muted">
        <Loader2 class="size-4 animate-spin text-muted-foreground" />
      </div>
    </div>

    <p v-if="masking && mode === 'edit'" class="px-4 pt-2 text-xs text-muted-foreground">
      Only the painted area will change.
    </p>

    <textarea
      ref="promptBox"
      v-model="prompt"
      rows="2"
      :placeholder="placeholder"
      aria-label="Prompt"
      class="block max-h-52 w-full resize-none bg-transparent px-4 pt-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
      @keydown="onKeydown"
      @paste="onPaste"
      @input="autoResize"
    />
    <textarea
      v-if="showNegative"
      v-model="negativePrompt"
      rows="1"
      placeholder="What to avoid"
      aria-label="Negative prompt"
      class="block w-full resize-none bg-transparent px-4 pt-1 text-[13px] text-muted-foreground outline-none placeholder:text-muted-foreground/70"
      @keydown="onKeydown"
    />

    <div class="flex items-center gap-2 px-2 pb-2 pt-1.5">
      <div
        class="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&>*]:shrink-0"
      >
        <SegmentedControl
          :model-value="mode"
          :options="MODES"
          size="sm"
          aria-label="What to make"
          class="mr-1"
          @update:model-value="mode = $event as CreateMode"
        />
        <ModelPicker
          :setup="setup"
          :kind="mode === 'video' ? 'video' : mode === 'edit' ? 'edit' : 'image'"
          @update="emit('updateSetup', $event)"
        />

        <SizeMenu
          :width="setup.width"
          :height="setup.height"
          :multiple="mode === 'video' ? 16 : 64"
          :extra="library.activeKit?.sizes"
          @update="emit('updateSetup', $event)"
        />

        <label
          v-if="mode !== 'video'"
          class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-accent"
        >
          <Images v-tip="'Images per run'" class="size-3.5 text-muted-foreground" />
          <span class="sr-only">Images per run</span>
          <Select
            :model-value="String(count)"
            :options="COUNTS"
            size="sm"
            class="!h-7 !w-12 !border-0 !bg-transparent !px-1 tabular-nums"
            @update:model-value="count = Number($event) || 1"
          />
        </label>
        <label
          v-else
          class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-accent"
        >
          <input
            type="number"
            min="1"
            max="1025"
            class="w-12 bg-transparent text-right tabular-nums outline-none"
            :value="setup.videoFrames"
            aria-label="Frames"
            @change="
              emit('updateSetup', {
                videoFrames: Number(($event.target as HTMLInputElement).value) || 1
              })
            "
          />
          <span class="text-muted-foreground">frames</span>
        </label>

        <Popover>
          <PopoverTrigger as-child>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-accent"
              :aria-label="seedLocked ? `Seed ${seed}` : 'Random seed'"
              v-tip="seedLocked ? `Seed ${seed}` : 'Random seed'"
            >
              <Lock v-if="seedLocked" class="size-3.5 text-muted-foreground" />
              <Dices v-else class="size-3.5 text-muted-foreground" />
              <span v-if="seedLocked" class="tabular-nums">{{ seed }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" class="w-60 p-3 text-[13px]">
            <div class="flex items-center gap-2">
              <input
                v-model.number="seed"
                type="number"
                min="0"
                class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 tabular-nums"
                aria-label="Seed"
                @input="seedLocked = true"
              />
              <button
                type="button"
                class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="New random seed"
                v-tip="'New random seed'"
                @click="randomizeSeed"
              >
                <Dices class="size-4" />
              </button>
            </div>
            <button
              type="button"
              class="mt-2 inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              @click="seedLocked = !seedLocked"
            >
              <LockOpen v-if="seedLocked" class="size-3.5" />
              <Lock v-else class="size-3.5" />
              {{ seedLocked ? 'Use a random seed each time' : 'Keep this seed' }}
            </button>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger as-child>
            <button
              type="button"
              class="inline-flex h-8 max-w-[10rem] items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-accent"
              :class="library.activeKit ? 'text-foreground' : 'text-muted-foreground'"
              :aria-label="library.activeKit ? `Style kit ${library.activeKit.name}` : 'Style kit'"
              v-tip="'Style kit'"
            >
              <Palette class="size-3.5 shrink-0" />
              <span v-if="library.activeKit" class="truncate">{{ library.activeKit.name }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" class="w-64 p-1 text-[13px]">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent"
              @click="library.setActiveKit('')"
            >
              No style kit
              <Check v-if="!library.activeKit" class="size-3.5 text-brand" />
            </button>
            <div
              v-for="kit in library.styleKits"
              :key="kit.id"
              class="flex items-center rounded-md hover:bg-accent"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
                @click="library.setActiveKit(kit.id)"
              >
                <span class="flex shrink-0 -space-x-1">
                  <span
                    v-for="color in kit.palette.slice(0, 4)"
                    :key="color"
                    class="size-3 rounded-full border border-background"
                    :style="{ background: color }"
                  />
                </span>
                <span class="truncate">{{ kit.name }}</span>
                <Check v-if="library.activeKitId === kit.id" class="ml-auto size-3.5 text-brand" />
              </button>
              <button
                type="button"
                class="mr-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                @click="openKit(kit)"
              >
                Edit
              </button>
            </div>
            <button
              type="button"
              class="mt-1 w-full rounded-md border-t border-border px-2.5 py-1.5 text-left font-medium hover:bg-accent"
              @click="openKit(null)"
            >
              New style kit…
            </button>
          </PopoverContent>
        </Popover>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="onPick"
        />

        <button
          type="button"
          class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          :class="showNegative ? 'bg-accent text-foreground' : 'text-muted-foreground'"
          :aria-pressed="showNegative"
          aria-label="Negative prompt"
          v-tip="'Negative prompt'"
          @click="showNegative = !showNegative"
        >
          <Ban class="size-4" />
        </button>

        <PromptPresetControls
          v-model:prompt="prompt"
          v-model:negative-prompt="negativePrompt"
          compact
        />
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Popover>
          <PopoverTrigger as-child>
            <button
              type="button"
              class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Attach images"
              v-tip="'Attach images'"
            >
              <Paperclip class="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" class="w-56 p-1 text-[13px]">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent"
              @click="fileInput?.click()"
            >
              <Upload class="size-3.5 text-muted-foreground" /> From this device
            </button>
            <GalleryPicker
              label="From Assets"
              trigger-class="!h-auto w-full justify-start !rounded-md !border-0 !px-2.5 !py-1.5 !text-[13px] !font-normal"
              @pick="addFiles([$event])"
            />
          </PopoverContent>
        </Popover>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-accent"
          :class="optionsOpen ? 'bg-accent text-foreground' : 'text-muted-foreground'"
          :aria-pressed="optionsOpen"
          aria-label="Model options"
          v-tip="{ text: 'Model options', keys: 'Mod+.' }"
          @click="emit('toggleOptions')"
        >
          <SlidersHorizontal class="size-4" />
          <span class="hidden xl:inline">Options</span>
        </button>
        <button
          v-if="busy"
          type="button"
          class="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="emit('cancel')"
        >
          Stop
        </button>
        <button
          type="button"
          v-tip="{ text: busy ? 'Add to the queue' : 'Generate', keys: 'Enter' }"
          class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand pl-3.5 pr-3 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
          @click="generate"
        >
          {{ busy ? 'Queue' : 'Generate' }}
          <ArrowUp class="size-4" />
        </button>
      </div>
    </div>

    <StyleKitDialog
      :open="kitDialog.open"
      :kit="kitDialog.kit"
      @close="kitDialog.open = false"
      @saved="library.setActiveKit($event.id)"
    />
  </div>
</template>
