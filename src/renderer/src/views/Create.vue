<script setup lang="ts">
/**
 * Create: one place for images, edits and video. A session feed of generations, the
 * composer docked below it, and every model option in the side panel.
 */
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  watch
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Brush,
  Contrast,
  Eraser,
  Eye,
  EyeOff,
  Redo2,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X
} from '@/lib/icons'
import Composer, { type ComposerSubmit } from '@/components/create/Composer.vue'
import FeedRow from '@/components/create/FeedRow.vue'
import MaskCanvas from '@/components/create/MaskCanvas.vue'
import ModelOptions from '@/components/options/ModelOptions.vue'
import ModelPicker from '@/components/create/ModelPicker.vue'
import SavedSetups from '@/components/options/SavedSetups.vue'
import OutputViewer from '@/components/workflow/OutputViewer.vue'
import { useConfigStore, type WorkspaceSurface } from '@/stores/config'
import { useSessionsStore } from '@/stores/sessions'
import { useLibraryStore } from '@/stores/library'
import { useCreateJob } from '@/composables/useCreateJob'
import { useConnection } from '@/composables/useConnection'
import { useModels } from '@/composables/useModels'
import { useToast } from '@/composables/useToast'
import { useJobQueue } from '@/composables/useJobQueue'
import { getOutputUrl } from '@/services/api'
import { setupFamily } from '../../../shared/modelFamilies'
import { pickSetup, type ModelSetup } from '../../../shared/modelSetup'
import type { CreateMode, RowInput, SessionRow } from '../../../shared/sessions'

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const sessions = useSessionsStore()
const library = useLibraryStore()
const job = useCreateJob()
const queue = useJobQueue()
const connection = useConnection()
const { models } = useModels()
const toast = useToast()

const MODES: CreateMode[] = ['image', 'edit', 'video']
const queryMode = (): CreateMode =>
  MODES.includes(route.query.mode as CreateMode) ? (route.query.mode as CreateMode) : 'image'

const mode = ref<CreateMode>(queryMode())
const inputs = ref<RowInput[]>([])
const prompt = ref('')
const optionsOpen = ref(readFlag('flaxeo-create-options', false))
/** Title controls live in the shell's top bar only while this page is shown. */
const pageActive = ref(true)
const editingFile = ref('')
const brushSize = ref(40)
const erasing = ref(false)
const maskPainted = ref(false)
const showMask = ref(true)

const toolClass = (active: boolean): string =>
  `aui-icon-button inline-flex size-8 items-center justify-center rounded-lg disabled:opacity-35 ${
    active
      ? 'bg-accent text-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }`
const viewer = ref<{ files: string[]; index: number | null }>({ files: [], index: null })
const feed = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof Composer> | null>(null)
const maskCanvas = ref<InstanceType<typeof MaskCanvas> | null>(null)

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* per-device convenience only */
  }
}

watch(optionsOpen, (value) => writeFlag('flaxeo-create-options', value))
watch(
  () => route.query.mode,
  (value) => {
    if (value) mode.value = queryMode()
  }
)
watch(mode, (value) => {
  if (route.query.mode !== value) void router.replace({ query: { ...route.query, mode: value } })
  if (value !== 'edit') editingFile.value = ''
})

const surface = computed<WorkspaceSurface>(() => mode.value)
const setup = computed<ModelSetup>(() => pickSetup(configStore.setupFor(surface.value)))
const family = computed(() => setupFamily(setup.value))
const rows = computed(() => sessions.active?.rows || [])
const busy = computed(() => !!queue.current.value || queue.pendingCount.value > 0)
const progressLabel = computed(() => {
  const p = job.progress
  if (p.hasSteps.value) return `Step ${p.current.value} of ${p.total.value}`
  return p.phaseLabel.value || ''
})

const emptyReason = computed(() => {
  if (connection.engineState.value === 'missing') return 'engine'
  if (!(models.value.diffusion || []).length) return 'models'
  return ''
})

function updateSetup(patch: Partial<ModelSetup>): void {
  configStore.updateSetup(surface.value, patch)
}

async function scrollToEnd(): Promise<void> {
  await nextTick()
  feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: 'smooth' })
}

watch(
  () => rows.value.length,
  () => void scrollToEnd()
)
watch(
  () => sessions.activeId,
  () => void scrollToEnd()
)

/** Natural size of an output image, rounded to what sd.cpp accepts. */
function imageSize(file: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () =>
      resolve({
        width: Math.max(64, Math.round(img.naturalWidth / 64) * 64),
        height: Math.max(64, Math.round(img.naturalHeight / 64) * 64)
      })
    img.onerror = () => resolve(null)
    img.src = getOutputUrl(file)
  })
}

async function onGenerate(request: ComposerSubmit): Promise<void> {
  let requestInputs = request.inputs
  let mask: Blob | null = null
  let { width, height } = setup.value
  if (mode.value === 'edit') {
    const start = requestInputs.find((input) => input.role === 'start')
    if (editingFile.value && maskPainted.value) mask = (await maskCanvas.value?.getMask()) || null
    if (!mask && family.value?.caps.refEdit) {
      // Reference-edit models (Kontext, Qwen Edit…) take the image as a reference.
      requestInputs = requestInputs.map((input) =>
        input.role === 'start' ? { ...input, role: 'reference' } : input
      )
    }
    // Inpaint and img2img follow the source image's size.
    if (start && (mask || !family.value?.caps.refEdit)) {
      const size = await imageSize(start.file)
      if (size) ({ width, height } = size)
    }
  }
  const error = job.submit({
    mode: mode.value,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt,
    inputs: requestInputs,
    mask,
    count: request.count,
    seed: request.seed,
    width,
    height
  })
  if (error) {
    toast.error(error)
    if (error.startsWith('Choose a model')) optionsOpen.value = false
    return
  }
  editingFile.value = ''
  void scrollToEnd()
}

function startEdit(file: string): void {
  mode.value = 'edit'
  inputs.value = [{ file, role: 'start' }]
  editingFile.value = file
  maskPainted.value = false
  void nextTick(() => composer.value?.focus())
}

function paintArea(): void {
  const start = inputs.value.find((input) => input.role === 'start')
  if (start) editingFile.value = start.file
}

function animate(file: string): void {
  mode.value = 'video'
  inputs.value = [{ file, role: 'start' }]
  void nextTick(() => composer.value?.focus())
}

function useAsReference(file: string): void {
  if (inputs.value.some((input) => input.file === file)) return
  inputs.value = [...inputs.value, { file, role: 'reference' }]
  toast.success('Added as a reference')
}

function upscale(file: string): void {
  const error = job.upscale(file)
  if (error) {
    toast.error(error)
    optionsOpen.value = true
  }
}

function reuse(row: SessionRow): void {
  mode.value = row.mode
  if (row.setup) configStore.updateSetup(row.mode, row.setup)
  inputs.value = row.inputs.filter((input) => input.role !== 'mask')
  composer.value?.reuse(row)
}

function retry(row: SessionRow): void {
  const error = job.retry(row)
  if (error) toast.error(error)
}

function goTo(name: string): void {
  void router.push({ name })
}

/** Hand-offs from Assets and onboarding: ?edit= / ?animate= / ?reference= / ?prompt= */
function consumeQuery(): void {
  const take = (key: string): string =>
    typeof route.query[key] === 'string' ? (route.query[key] as string) : ''
  const edit = take('edit')
  const animateFile = take('animate')
  const reference = take('reference')
  const text = take('prompt')
  if (!edit && !animateFile && !reference && !text) return
  if (edit) startEdit(edit)
  else if (animateFile) animate(animateFile)
  else if (reference) useAsReference(reference)
  if (text) prompt.value = text
  void router.replace({ query: { mode: mode.value } })
}

// Create may already be open when Assets hands a file over.
watch(
  () => [
    route.name,
    route.query.edit,
    route.query.animate,
    route.query.reference,
    route.query.prompt
  ],
  () => {
    if (route.name === 'Create') consumeQuery()
  }
)

/** Ctrl/Cmd+. toggles Options; while painting: B brush, E eraser, [ ] size, Esc closes. */
function onKeydown(event: KeyboardEvent): void {
  if (!pageActive.value) return
  if ((event.ctrlKey || event.metaKey) && event.key === '.') {
    event.preventDefault()
    optionsOpen.value = !optionsOpen.value
    return
  }
  if (!editingFile.value) return
  if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]'))
    return
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) maskCanvas.value?.redo()
    else maskCanvas.value?.undo()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (key === 'i') maskCanvas.value?.invert()
  else if (key === 'h') showMask.value = !showMask.value
  else if (key === 'b') erasing.value = false
  else if (key === 'e') erasing.value = true
  else if (key === '[') brushSize.value = Math.max(4, brushSize.value - 8)
  else if (key === ']') brushSize.value = Math.min(200, brushSize.value + 8)
  else if (key === 'escape') editingFile.value = ''
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  connection.start()
  void library.ensureLoaded()
  if (!sessions.active) void sessions.init()
  else void scrollToEnd()
  consumeQuery()
})
onActivated(() => {
  pageActive.value = true
  consumeQuery()
})
onDeactivated(() => (pageActive.value = false))
onUnmounted(() => {
  connection.stop()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="relative flex h-full min-h-0">
    <section class="relative flex min-w-0 flex-1 flex-col">
      <Teleport v-if="pageActive" to="#page-header" defer>
        <h1 class="min-w-0 truncate px-1 text-[13px] font-medium">
          {{ sessions.active?.rows.length ? sessions.title : 'New session' }}
        </h1>
        <button
          v-if="mode === 'edit' && !editingFile && inputs.some((i) => i.role === 'start')"
          type="button"
          class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] hover:bg-accent titlebar-no-drag"
          @click="paintArea"
        >
          <Brush class="size-3.5" /> Paint the area to change
        </button>
      </Teleport>

      <div v-if="editingFile" class="relative flex min-h-0 flex-1 flex-col">
        <div
          class="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border bg-popover p-1 text-[13px] shadow-[var(--float-shadow)]"
          role="toolbar"
          aria-label="Mask tools"
        >
          <button
            type="button"
            :class="toolClass(!erasing)"
            :aria-pressed="!erasing"
            aria-label="Brush"
            v-tip="{ text: 'Brush: paint what should change', keys: 'B' }"
            @click="erasing = false"
          >
            <Brush class="size-4" />
          </button>
          <button
            type="button"
            :class="toolClass(erasing)"
            :aria-pressed="erasing"
            aria-label="Eraser"
            v-tip="{ text: 'Eraser', keys: 'E' }"
            @click="erasing = true"
          >
            <Eraser class="size-4" />
          </button>
          <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <label class="flex items-center gap-2 px-1.5" v-tip="{ text: 'Brush size', keys: '[ ]' }">
            <input
              v-model.number="brushSize"
              type="range"
              min="4"
              max="200"
              class="w-24 accent-[var(--primary)]"
              aria-label="Brush size"
            />
            <span class="w-9 text-right text-xs tabular-nums text-muted-foreground"
              >{{ brushSize }}px</span
            >
          </label>
          <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <button
            type="button"
            :class="toolClass(false)"
            :disabled="!maskCanvas?.canUndo"
            aria-label="Undo stroke"
            v-tip="{ text: 'Undo', keys: 'Mod+Z' }"
            @click="maskCanvas?.undo()"
          >
            <Undo2 class="size-4" />
          </button>
          <button
            type="button"
            :class="toolClass(false)"
            :disabled="!maskCanvas?.canRedo"
            aria-label="Redo stroke"
            v-tip="{ text: 'Redo', keys: 'Mod+Shift+Z' }"
            @click="maskCanvas?.redo()"
          >
            <Redo2 class="size-4" />
          </button>
          <button
            type="button"
            :class="toolClass(false)"
            aria-label="Invert mask"
            v-tip="{ text: 'Invert: change everything except the painted area', keys: 'I' }"
            @click="maskCanvas?.invert()"
          >
            <Contrast class="size-4" />
          </button>
          <button
            type="button"
            :class="toolClass(!showMask)"
            :aria-pressed="!showMask"
            :aria-label="showMask ? 'Hide mask' : 'Show mask'"
            v-tip="{ text: showMask ? 'Hide the mask to compare' : 'Show the mask', keys: 'H' }"
            @click="showMask = !showMask"
          >
            <EyeOff v-if="showMask" class="size-4" />
            <Eye v-else class="size-4" />
          </button>
          <button
            type="button"
            :class="toolClass(false)"
            :disabled="!maskPainted"
            aria-label="Clear mask"
            v-tip="'Clear all paint'"
            @click="maskCanvas?.clear()"
          >
            <Trash2 class="size-4" />
          </button>
          <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <button
            type="button"
            class="h-8 min-w-12 rounded-lg px-2 text-xs tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
            v-tip="'Fit to view · scroll to zoom, Space+drag to pan'"
            @click="maskCanvas?.resetView()"
          >
            {{ Math.round((maskCanvas?.zoom ?? 1) * 100) }}%
          </button>
          <button
            type="button"
            class="ml-0.5 inline-flex h-8 items-center rounded-lg px-3 font-medium hover:bg-accent"
            v-tip="{ text: 'Close the editor', keys: 'Esc' }"
            @click="editingFile = ''"
          >
            Done
          </button>
        </div>
        <p
          class="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-popover px-3 py-1 text-xs text-muted-foreground shadow-[var(--float-shadow)]"
        >
          {{
            maskPainted
              ? 'Only the painted area will change. Describe the change below.'
              : 'Paint over what should change, or describe a change to the whole image.'
          }}
        </p>
        <div class="min-h-0 flex-1 px-4 pb-2 pt-16">
          <MaskCanvas
            ref="maskCanvas"
            :src="getOutputUrl(editingFile)"
            :brush-size="brushSize"
            :erase="erasing"
            :show-mask="showMask"
            @painted="maskPainted = $event"
          />
        </div>
      </div>

      <div v-else ref="feed" class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-5xl px-4 sm:px-6">
          <FeedRow
            v-for="row in rows"
            :key="row.id"
            :row="row"
            :live="row.id === job.runningRowId.value"
            :preview-image="job.previewImage.value"
            :progress-label="progressLabel"
            :progress-percent="job.progress.percent.value"
            @view="(files, index) => (viewer = { files, index })"
            @edit="startEdit"
            @animate="animate"
            @upscale="upscale"
            @reference="useAsReference"
            @reuse="reuse"
            @retry="retry"
            @remove="sessions.removeRow($event.id)"
          />

          <div
            v-if="!rows.length && !sessions.loading"
            class="flex min-h-[50vh] flex-col items-start justify-center gap-3 py-16"
          >
            <template v-if="emptyReason === 'engine'">
              <h2 class="text-xl font-semibold">Install the sd.cpp engine</h2>
              <p class="max-w-md text-[14px] text-muted-foreground">
                Flaxeo runs models with stable-diffusion.cpp. Install it once, then pick a model.
              </p>
              <button
                type="button"
                class="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                @click="goTo('Settings')"
              >
                Install engine
              </button>
            </template>
            <template v-else-if="emptyReason === 'models'">
              <h2 class="text-xl font-semibold">Get a model to start</h2>
              <p class="max-w-md text-[14px] text-muted-foreground">
                Download a ready pack from Models, or drop model files into the models folder.
              </p>
              <button
                type="button"
                class="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                @click="goTo('Models')"
              >
                Open Models
              </button>
            </template>
            <template v-else>
              <h2 class="text-xl font-semibold">Describe something below</h2>
              <p class="max-w-md text-[14px] text-muted-foreground">
                Each result lands here in this session. Hover an image to edit it, animate it or use
                it as a reference.
              </p>
            </template>
          </div>
        </div>
      </div>

      <div class="shrink-0 px-3 pb-3 pt-1 sm:px-6 sm:pb-5">
        <div class="mx-auto max-w-3xl">
          <Composer
            ref="composer"
            v-model:mode="mode"
            v-model:inputs="inputs"
            v-model:prompt="prompt"
            :setup="setup"
            :busy="busy"
            :options-open="optionsOpen"
            :masking="!!editingFile && maskPainted"
            @generate="onGenerate"
            @update-setup="updateSetup"
            @toggle-options="optionsOpen = !optionsOpen"
            @cancel="job.cancel()"
          />
        </div>
      </div>
    </section>

    <aside
      v-if="optionsOpen"
      class="absolute bottom-2 right-2 top-2 z-30 flex w-[22rem] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-[var(--float-shadow)]"
      aria-label="Model options"
    >
      <div class="flex h-12 shrink-0 items-center justify-between px-4">
        <h2 class="flex items-center gap-2 text-[13px] font-medium">
          <SlidersHorizontal class="size-3.5 text-muted-foreground" /> Options
          <span class="font-normal text-muted-foreground">{{ family?.name || '' }}</span>
        </h2>
        <span class="flex items-center gap-1">
          <SavedSetups :surface="surface" />
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close options"
            v-tip="{ text: 'Close options', keys: 'Mod+.' }"
            @click="optionsOpen = false"
          >
            <X class="size-4" />
          </button>
        </span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div class="flex items-center justify-between gap-3 pb-2">
          <span class="text-[13px] text-muted-foreground">Model</span>
          <ModelPicker
            :setup="setup"
            :kind="mode === 'video' ? 'video' : mode === 'edit' ? 'edit' : 'image'"
            @update="updateSetup"
          />
        </div>
        <ModelOptions :setup="setup" :mode="mode" @update="updateSetup" />
      </div>
    </aside>

    <OutputViewer
      :files="viewer.files"
      :index="viewer.index"
      @update:index="viewer.index = $event"
    />
  </div>
</template>
