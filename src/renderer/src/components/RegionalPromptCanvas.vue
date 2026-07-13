<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import type { RegionalPromptRegion } from '../../../shared/regionalPrompting'
import { MAX_REGIONAL_PROMPTS } from '../../../shared/regionalPrompting'

const props = withDefaults(
  defineProps<{
    modelValue: RegionalPromptRegion[]
    disabled?: boolean
  }>(),
  { disabled: false }
)

const emit = defineEmits<{
  'update:modelValue': [regions: RegionalPromptRegion[]]
}>()

type Point = { x: number; y: number }
type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Geometry = Pick<RegionalPromptRegion, 'x' | 'y' | 'width' | 'height'>
type Interaction =
  | { kind: 'create'; pointerId: number; start: Point; current: Point }
  | {
      kind: 'move'
      pointerId: number
      index: number
      start: Point
      original: Geometry
    }
  | {
      kind: 'resize'
      pointerId: number
      index: number
      corner: Corner
      original: Geometry
    }

const CARD_WIDTH = 304
const CARD_HEIGHT = 184
const VIEWPORT_GAP = 8
const MIN_REGION_PIXELS = 16

const canvasRef = ref<HTMLElement | null>(null)
const selectedIndex = ref<number | null>(null)
const interaction = ref<Interaction | null>(null)
const draftRegion = ref<Geometry | null>(null)
const cardStyle = ref<CSSProperties>({})

const selectedRegion = computed(() => {
  if (selectedIndex.value === null) return null
  return props.modelValue[selectedIndex.value] ?? null
})

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function pointFromEvent(event: PointerEvent): Point | null {
  const bounds = canvasRef.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return null

  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height)
  }
}

function geometryFromPoints(start: Point, end: Point): Geometry {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

function createRegionId(): string {
  const base = `region-${Date.now().toString(36)}`
  const ids = new Set(props.modelValue.map((region) => region.id))
  let id = base
  let suffix = 2
  while (ids.has(id)) id = `${base}-${suffix++}`
  return id
}

function regionStyle(region: Geometry): CSSProperties {
  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`
  }
}

function updateRegion(index: number, changes: Partial<RegionalPromptRegion>): void {
  const region = props.modelValue[index]
  if (!region) return

  const regions = [...props.modelValue]
  regions[index] = { ...region, ...changes }
  emit('update:modelValue', regions)
  void nextTick(updateCardPosition)
}

function selectRegion(index: number): void {
  selectedIndex.value = index
  void nextTick(updateCardPosition)
}

function startCreating(event: PointerEvent): void {
  if (props.disabled || event.button !== 0 || props.modelValue.length >= MAX_REGIONAL_PROMPTS) {
    return
  }

  const point = pointFromEvent(event)
  if (!point) return

  event.preventDefault()
  selectedIndex.value = null
  interaction.value = {
    kind: 'create',
    pointerId: event.pointerId,
    start: point,
    current: point
  }
  draftRegion.value = geometryFromPoints(point, point)
  canvasRef.value?.setPointerCapture(event.pointerId)
}

function startMoving(event: PointerEvent, index: number): void {
  if (props.disabled || event.button !== 0) return

  const point = pointFromEvent(event)
  const region = props.modelValue[index]
  if (!point || !region) return

  event.preventDefault()
  selectRegion(index)
  interaction.value = {
    kind: 'move',
    pointerId: event.pointerId,
    index,
    start: point,
    original: {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height
    }
  }
  canvasRef.value?.setPointerCapture(event.pointerId)
}

function startResizing(event: PointerEvent, index: number, corner: Corner): void {
  if (props.disabled || event.button !== 0) return

  const region = props.modelValue[index]
  if (!region) return

  event.preventDefault()
  selectRegion(index)
  interaction.value = {
    kind: 'resize',
    pointerId: event.pointerId,
    index,
    corner,
    original: {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height
    }
  }
  canvasRef.value?.setPointerCapture(event.pointerId)
}

function minimumRegionSize(): Point {
  const bounds = canvasRef.value?.getBoundingClientRect()
  return {
    x: bounds?.width ? Math.min(1, MIN_REGION_PIXELS / bounds.width) : 0.02,
    y: bounds?.height ? Math.min(1, MIN_REGION_PIXELS / bounds.height) : 0.02
  }
}

function resizedGeometry(original: Geometry, corner: Corner, point: Point): Geometry {
  const minimum = minimumRegionSize()
  const right = original.x + original.width
  const bottom = original.y + original.height
  let left = original.x
  let top = original.y
  let nextRight = right
  let nextBottom = bottom

  if (corner.includes('w')) left = clamp(point.x, 0, Math.max(0, right - minimum.x))
  if (corner.includes('e')) nextRight = clamp(point.x, original.x + minimum.x, 1)
  if (corner.includes('n')) top = clamp(point.y, 0, Math.max(0, bottom - minimum.y))
  if (corner.includes('s')) nextBottom = clamp(point.y, original.y + minimum.y, 1)

  return {
    x: left,
    y: top,
    width: nextRight - left,
    height: nextBottom - top
  }
}

function handlePointerMove(event: PointerEvent): void {
  const active = interaction.value
  if (!active || active.pointerId !== event.pointerId) return

  const point = pointFromEvent(event)
  if (!point) return
  event.preventDefault()

  if (active.kind === 'create') {
    active.current = point
    draftRegion.value = geometryFromPoints(active.start, point)
    return
  }

  if (active.kind === 'move') {
    const dx = point.x - active.start.x
    const dy = point.y - active.start.y
    updateRegion(active.index, {
      x: clamp(active.original.x + dx, 0, 1 - active.original.width),
      y: clamp(active.original.y + dy, 0, 1 - active.original.height)
    })
    return
  }

  updateRegion(active.index, resizedGeometry(active.original, active.corner, point))
}

function finishInteraction(event: PointerEvent): void {
  const active = interaction.value
  if (!active || active.pointerId !== event.pointerId) return

  if (active.kind === 'create' && draftRegion.value) {
    const minimum = minimumRegionSize()
    if (
      draftRegion.value.width >= minimum.x &&
      draftRegion.value.height >= minimum.y &&
      props.modelValue.length < MAX_REGIONAL_PROMPTS
    ) {
      const index = props.modelValue.length
      emit('update:modelValue', [
        ...props.modelValue,
        { id: createRegionId(), ...draftRegion.value, prompt: '' }
      ])
      selectRegion(index)
    }
  }

  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId)
  }
  interaction.value = null
  draftRegion.value = null
}

function cancelInteraction(): void {
  const active = interaction.value
  if (active && canvasRef.value?.hasPointerCapture(active.pointerId)) {
    canvasRef.value.releasePointerCapture(active.pointerId)
  }
  interaction.value = null
  draftRegion.value = null
}

function deleteSelected(): void {
  if (props.disabled || selectedIndex.value === null) return

  const index = selectedIndex.value
  emit(
    'update:modelValue',
    props.modelValue.filter((_, regionIndex) => regionIndex !== index)
  )
  selectedIndex.value = null
}

function updatePrompt(event: Event): void {
  if (props.disabled || selectedIndex.value === null) return
  updateRegion(selectedIndex.value, {
    prompt: (event.target as HTMLTextAreaElement).value
  })
}

function moveRegionByKeyboard(index: number, dx: number, dy: number): void {
  const region = props.modelValue[index]
  if (!region || props.disabled) return
  updateRegion(index, {
    x: clamp(region.x + dx, 0, 1 - region.width),
    y: clamp(region.y + dy, 0, 1 - region.height)
  })
}

function handleRegionKeydown(event: KeyboardEvent, index: number): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectRegion(index)
    return
  }
  if (selectedIndex.value !== index || props.disabled) return

  const amount = event.shiftKey ? 0.05 : 0.01
  const movement: Record<string, Point> = {
    ArrowLeft: { x: -amount, y: 0 },
    ArrowRight: { x: amount, y: 0 },
    ArrowUp: { x: 0, y: -amount },
    ArrowDown: { x: 0, y: amount }
  }
  const delta = movement[event.key]
  if (!delta) return

  event.preventDefault()
  moveRegionByKeyboard(index, delta.x, delta.y)
}

function handleResizeKeydown(event: KeyboardEvent, index: number, corner: Corner): void {
  if (props.disabled) return

  const amount = event.shiftKey ? 0.05 : 0.01
  const movement: Record<string, Point> = {
    ArrowLeft: { x: -amount, y: 0 },
    ArrowRight: { x: amount, y: 0 },
    ArrowUp: { x: 0, y: -amount },
    ArrowDown: { x: 0, y: amount }
  }
  const delta = movement[event.key]
  const region = props.modelValue[index]
  if (!delta || !region) return

  event.preventDefault()
  const cornerPoint = {
    x: corner.includes('w') ? region.x : region.x + region.width,
    y: corner.includes('n') ? region.y : region.y + region.height
  }
  updateRegion(
    index,
    resizedGeometry(region, corner, {
      x: cornerPoint.x + delta.x,
      y: cornerPoint.y + delta.y
    })
  )
}

function updateCardPosition(): void {
  if (selectedIndex.value === null || !canvasRef.value) return

  if (window.innerWidth < 768) {
    cardStyle.value = {
      left: `${VIEWPORT_GAP}px`,
      right: `${VIEWPORT_GAP}px`,
      bottom: `${VIEWPORT_GAP}px`
    }
    return
  }

  const regionElement = canvasRef.value.querySelector<HTMLElement>(
    `[data-region-index="${selectedIndex.value}"]`
  )
  if (!regionElement) return

  const anchor = regionElement.getBoundingClientRect()
  const width = Math.min(CARD_WIDTH, window.innerWidth - VIEWPORT_GAP * 2)
  let left = anchor.right + VIEWPORT_GAP
  if (left + width > window.innerWidth - VIEWPORT_GAP) {
    left = anchor.left - width - VIEWPORT_GAP
  }
  left = clamp(left, VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP)

  const top = clamp(
    anchor.top,
    VIEWPORT_GAP,
    Math.max(VIEWPORT_GAP, window.innerHeight - CARD_HEIGHT - VIEWPORT_GAP)
  )
  cardStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px` }
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && selectedIndex.value !== null) {
    event.preventDefault()
    cancelInteraction()
    selectedIndex.value = null
    return
  }

  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    selectedIndex.value !== null &&
    !(event.target instanceof HTMLTextAreaElement) &&
    !props.disabled
  ) {
    event.preventDefault()
    deleteSelected()
  }
}

watch(
  () => props.modelValue,
  () => {
    if (selectedIndex.value !== null && !props.modelValue[selectedIndex.value]) {
      selectedIndex.value = null
      return
    }
    void nextTick(updateCardPosition)
  },
  { deep: true, flush: 'post' }
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) cancelInteraction()
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('resize', updateCardPosition)
  window.addEventListener('scroll', updateCardPosition, true)
})

onUnmounted(() => {
  cancelInteraction()
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('resize', updateCardPosition)
  window.removeEventListener('scroll', updateCardPosition, true)
})
</script>

<template>
  <div
    ref="canvasRef"
    class="absolute inset-0 touch-none select-none overflow-hidden"
    :class="[
      disabled ? 'cursor-not-allowed' : 'cursor-crosshair',
      modelValue.length >= MAX_REGIONAL_PROMPTS ? 'cursor-default' : ''
    ]"
    role="group"
    aria-label="Regional prompt editor"
    :aria-disabled="disabled"
    @pointerdown.self="startCreating"
    @pointermove="handlePointerMove"
    @pointerup="finishInteraction"
    @pointercancel="cancelInteraction"
  >
    <div
      v-for="(region, index) in modelValue"
      :key="region.id"
      :data-region-index="index"
      class="group absolute border-2 bg-primary/10 outline-none transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      :class="[
        selectedIndex === index
          ? 'z-20 border-primary bg-primary/15 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]'
          : 'z-10 border-white/80 bg-black/10 shadow-[0_0_0_1px_rgba(0,0,0,0.45)] hover:bg-primary/10',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-move'
      ]"
      :style="regionStyle(region)"
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-label="`Regional prompt ${index + 1}${region.prompt ? `: ${region.prompt}` : ''}`"
      :aria-pressed="selectedIndex === index"
      @pointerdown.stop="startMoving($event, index)"
      @keydown="handleRegionKeydown($event, index)"
    >
      <span
        class="pointer-events-none absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-[11px] font-semibold tabular-nums text-foreground shadow-sm ring-1 ring-black/15"
        aria-hidden="true"
      >
        {{ index + 1 }}
      </span>

      <template v-if="selectedIndex === index && !disabled">
        <button
          v-for="corner in ['nw', 'ne', 'sw', 'se'] as Corner[]"
          :key="corner"
          type="button"
          class="absolute z-30 size-4 rounded-full border-2 border-primary bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="{
            '-left-2 -top-2 cursor-nw-resize': corner === 'nw',
            '-right-2 -top-2 cursor-ne-resize': corner === 'ne',
            '-bottom-2 -left-2 cursor-sw-resize': corner === 'sw',
            '-bottom-2 -right-2 cursor-se-resize': corner === 'se'
          }"
          :aria-label="`Resize regional prompt ${index + 1} from ${corner} corner`"
          @pointerdown.stop="startResizing($event, index, corner)"
          @keydown.stop="handleResizeKeydown($event, index, corner)"
        />
      </template>
    </div>

    <div
      v-if="draftRegion"
      class="pointer-events-none absolute z-30 border-2 border-dashed border-primary bg-primary/15"
      :style="regionStyle(draftRegion)"
      aria-hidden="true"
    />

    <div
      v-if="modelValue.length === 0 && !disabled"
      class="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
      aria-hidden="true"
    >
      <span
        class="rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm"
      >
        Drag to add a prompt region
      </span>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="selectedRegion && selectedIndex !== null"
      class="fixed z-[150] flex max-h-[calc(100vh-1rem)] flex-col rounded-xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-xl shadow-black/20 titlebar-no-drag"
      :style="cardStyle"
      role="dialog"
      :aria-label="`Regional prompt ${selectedIndex + 1}`"
      @pointerdown.stop
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <label
          :for="`regional-prompt-${selectedIndex}`"
          class="text-xs font-semibold text-foreground"
        >
          Region {{ selectedIndex + 1 }} prompt
        </label>
        <span class="text-[10px] tabular-nums text-muted-foreground">
          {{ modelValue.length }}/{{ MAX_REGIONAL_PROMPTS }}
        </span>
      </div>

      <textarea
        :id="`regional-prompt-${selectedIndex}`"
        :value="selectedRegion.prompt"
        :disabled="disabled"
        rows="3"
        class="aui-field min-h-20 w-full resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Describe what should appear in this region…"
        @input="updatePrompt"
      />

      <div class="mt-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="disabled"
          aria-label="Delete selected regional prompt"
          @click="deleteSelected"
        >
          Delete
        </button>
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="selectedIndex = null"
        >
          Done
        </button>
      </div>
    </div>
  </Teleport>
</template>
