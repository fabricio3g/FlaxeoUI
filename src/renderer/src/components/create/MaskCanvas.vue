<script setup lang="ts">
/**
 * Paint the area to change on top of an image. The canvas works at the image's natural
 * size; `getMask()` returns an opaque black/white PNG (white = change) for sd-cli --mask.
 * Strokes can be undone, the mask inverted or hidden. Wheel zooms toward the pointer;
 * Space+drag or middle-drag pans.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ src: string; brushSize?: number; erase?: boolean; showMask?: boolean }>(),
  { brushSize: 32, erase: false, showMask: true }
)
const emit = defineEmits<{ painted: [value: boolean] }>()

/** Solid mask color; the overlay's transparency comes from CSS so strokes never stack darker. */
const PAINT = '#ff3b30'
const MAX_HISTORY = 30

const stageRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const cursor = ref<{ x: number; y: number } | null>(null)
const displaySize = ref({ width: 0, height: 0 })
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const hasPaint = ref(false)
const spaceHeld = ref(false)
const undoStack = ref<ImageData[]>([])
const redoStack = ref<ImageData[]>([])
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let panning: { x: number; y: number; ox: number; oy: number } | null = null
let last: { x: number; y: number } | null = null
let observer: ResizeObserver | null = null

const viewportStyle = computed(() => ({
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`
}))
const canvasStyle = computed(() => ({
  width: `${displaySize.value.width}px`,
  height: `${displaySize.value.height}px`,
  opacity: props.showMask ? 0.5 : 0
}))
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function setPainted(value: boolean): void {
  if (hasPaint.value === value) return
  hasPaint.value = value
  emit('painted', value)
}

/** Re-check for paint after undo/redo/invert (strokes set it directly). */
function recount(): void {
  const canvas = canvasRef.value
  if (!ctx || !canvas) return setPainted(false)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) return setPainted(true)
  }
  setPainted(false)
}

function syncSize(): void {
  const img = imageRef.value
  if (img) displaySize.value = { width: img.clientWidth, height: img.clientHeight }
}

async function onImageLoad(): Promise<void> {
  const img = imageRef.value
  const canvas = canvasRef.value
  if (!img || !canvas) return
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  ctx = canvas.getContext('2d', { willReadFrequently: true })
  undoStack.value = []
  redoStack.value = []
  setPainted(false)
  resetView()
  await nextTick()
  syncSize()
  observer?.disconnect()
  observer = new ResizeObserver(syncSize)
  observer.observe(img)
}

watch(
  () => props.src,
  () => setPainted(false)
)

function snapshot(): ImageData | null {
  const canvas = canvasRef.value
  return ctx && canvas ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null
}

function remember(): void {
  const state = snapshot()
  if (!state) return
  undoStack.value = [...undoStack.value.slice(-MAX_HISTORY + 1), state]
  redoStack.value = []
}

function point(e: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value as HTMLCanvasElement
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height
  }
}

function brushWidth(): number {
  const canvas = canvasRef.value
  if (!canvas) return props.brushSize
  const rect = canvas.getBoundingClientRect()
  // Brush size is in screen pixels at the current zoom, like the cursor ring shows
  return (props.brushSize * zoom.value * canvas.width) / Math.max(1, rect.width)
}

function stroke(from: { x: number; y: number }, to: { x: number; y: number }): void {
  if (!ctx) return
  ctx.globalCompositeOperation = props.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = PAINT
  ctx.fillStyle = PAINT
  ctx.lineWidth = brushWidth()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (from.x === to.x && from.y === to.y) {
    ctx.arc(to.x, to.y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
  if (!props.erase) setPainted(true)
}

function startPan(e: PointerEvent): void {
  panning = { x: e.clientX, y: e.clientY, ox: pan.value.x, oy: pan.value.y }
  stageRef.value?.setPointerCapture(e.pointerId)
}

function onStagePointerDown(e: PointerEvent): void {
  if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
    e.preventDefault()
    startPan(e)
  }
}

function onCanvasPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || spaceHeld.value || !ctx) return
  e.stopPropagation()
  remember()
  drawing = true
  canvasRef.value?.setPointerCapture(e.pointerId)
  last = point(e)
  stroke(last, last)
}

function onPointerMove(e: PointerEvent): void {
  const rect = stageRef.value?.getBoundingClientRect()
  cursor.value =
    rect && (e.target === canvasRef.value || drawing)
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : null
  if (panning) {
    pan.value = { x: panning.ox + e.clientX - panning.x, y: panning.oy + e.clientY - panning.y }
    return
  }
  if (!drawing || !last) return
  for (const sample of e.getCoalescedEvents?.() || [e]) {
    const next = point(sample)
    stroke(last, next)
    last = next
  }
}

function onPointerUp(e: PointerEvent): void {
  panning = null
  if (drawing && props.erase) recount()
  drawing = false
  last = null
  for (const el of [canvasRef.value, stageRef.value]) {
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }
}

/** Zoom toward the pointer so the spot under it stays put. */
function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const rect = stageRef.value?.getBoundingClientRect()
  if (!rect) return
  const before = zoom.value
  const after = Math.min(8, Math.max(0.25, before * (e.deltaY > 0 ? 0.9 : 1.1)))
  const cx = e.clientX - rect.left - rect.width / 2 - pan.value.x
  const cy = e.clientY - rect.top - rect.height / 2 - pan.value.y
  pan.value = {
    x: pan.value.x - cx * (after / before - 1),
    y: pan.value.y - cy * (after / before - 1)
  }
  zoom.value = after
}

function onKey(e: KeyboardEvent): void {
  if (e.code !== 'Space') return
  if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return
  if (e.type === 'keydown') e.preventDefault()
  spaceHeld.value = e.type === 'keydown'
}

function clear(): void {
  const canvas = canvasRef.value
  if (!ctx || !canvas || !hasPaint.value) return
  remember()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  setPainted(false)
}

function undo(): void {
  const previous = undoStack.value.at(-1)
  const current = snapshot()
  if (!previous || !current || !ctx) return
  redoStack.value = [...redoStack.value, current]
  undoStack.value = undoStack.value.slice(0, -1)
  ctx.putImageData(previous, 0, 0)
  recount()
}

function redo(): void {
  const next = redoStack.value.at(-1)
  const current = snapshot()
  if (!next || !current || !ctx) return
  undoStack.value = [...undoStack.value, current]
  redoStack.value = redoStack.value.slice(0, -1)
  ctx.putImageData(next, 0, 0)
  recount()
}

/** Painted ↔ unpainted: handy for "change everything except this". */
function invert(): void {
  const state = snapshot()
  if (!state || !ctx) return
  remember()
  const d = state.data
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > 8
    d[i] = 255
    d[i + 1] = 59
    d[i + 2] = 48
    d[i + 3] = on ? 0 : 255
  }
  ctx.putImageData(state, 0, 0)
  recount()
}

function resetView(): void {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}

/** Opaque black/white mask (white = change), or null when nothing is painted. */
async function getMask(): Promise<Blob | null> {
  const canvas = canvasRef.value
  const state = snapshot()
  if (!canvas || !state || !hasPaint.value) return null
  let painted = false
  const d = state.data
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > 8
    painted ||= on
    const v = on ? 255 : 0
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  if (!painted) return null
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  out.getContext('2d')?.putImageData(state, 0, 0)
  return new Promise((resolve) => out.toBlob((blob) => resolve(blob), 'image/png'))
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKey)
})

defineExpose({ getMask, clear, undo, redo, invert, resetView, hasPaint, canUndo, canRedo, zoom })
</script>

<template>
  <div
    ref="stageRef"
    class="relative flex size-full items-center justify-center overflow-hidden"
    :class="spaceHeld ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''"
    @wheel="onWheel"
    @pointerdown="onStagePointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="cursor = null"
  >
    <div class="relative" :style="viewportStyle">
      <img
        ref="imageRef"
        :src="src"
        alt="Image being edited"
        class="block max-h-[calc(100vh-15rem)] max-w-full select-none rounded-lg object-contain shadow-[var(--float-shadow)]"
        draggable="false"
        @load="onImageLoad"
      />
      <canvas
        ref="canvasRef"
        class="absolute left-0 top-0 touch-none rounded-lg transition-opacity"
        :class="spaceHeld ? 'pointer-events-none' : 'cursor-none'"
        :style="canvasStyle"
        @pointerdown="onCanvasPointerDown"
        @contextmenu.prevent
      />
    </div>
    <!-- Brush outline at the size it will paint -->
    <div
      v-if="cursor && !spaceHeld"
      class="pointer-events-none absolute rounded-full border-2 border-white mix-blend-difference"
      :style="{
        left: `${cursor.x - (brushSize * zoom) / 2}px`,
        top: `${cursor.y - (brushSize * zoom) / 2}px`,
        width: `${brushSize * zoom}px`,
        height: `${brushSize * zoom}px`
      }"
      aria-hidden="true"
    />
  </div>
</template>
