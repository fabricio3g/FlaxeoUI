<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { X } from '@/lib/icons'
import { resolutionPresets } from '@/lib/resolutionPresets'

const props = defineProps<{
  open: boolean
  /** Object URL or data URL of the source image */
  imageUrl: string
  initialWidth: number
  initialHeight: number
}>()

const emit = defineEmits<{
  cancel: []
  apply: [payload: { file: File; width: number; height: number }]
}>()

type FitMode = 'cover' | 'contain'

const targetW = ref(1024)
const targetH = ref(1024)
const fitMode = ref<FitMode>('cover')
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const applying = ref(false)
const errorMsg = ref<string | null>(null)

const viewportRef = ref<HTMLDivElement | null>(null)
const imgNatural = ref({ width: 0, height: 0 })
const imgEl = ref<HTMLImageElement | null>(null)

const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0, panX: 0, panY: 0 })

const frameAspect = computed(() => {
  const w = Math.max(1, targetW.value)
  const h = Math.max(1, targetH.value)
  return w / h
})

/** Display size of the crop frame inside the dialog (CSS pixels). */
const frameDisplay = computed(() => {
  const maxW = 360
  const maxH = 280
  const ar = frameAspect.value
  let w = maxW
  let h = w / ar
  if (h > maxH) {
    h = maxH
    w = h * ar
  }
  return { width: Math.round(w), height: Math.round(h) }
})

const previewImageStyle = computed(() => {
  const d = computeDraw(frameDisplay.value.width, frameDisplay.value.height)
  return {
    left: d.dx + 'px',
    top: d.dy + 'px',
    width: d.dw + 'px',
    height: d.dh + 'px'
  }
})

function resetView(): void {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  errorMsg.value = null
}

function loadNaturalFromUrl(url: string): void {
  const img = new Image()
  img.onload = () => {
    imgNatural.value = {
      width: img.naturalWidth || 1,
      height: img.naturalHeight || 1
    }
    imgEl.value = img
    resetView()
  }
  img.onerror = () => {
    errorMsg.value = 'Could not load image'
  }
  img.src = url
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    targetW.value = Math.max(64, props.initialWidth || 1024)
    targetH.value = Math.max(64, props.initialHeight || 1024)
    fitMode.value = 'cover'
    if (props.imageUrl) loadNaturalFromUrl(props.imageUrl)
  },
  { immediate: true }
)

watch(
  () => props.imageUrl,
  (url) => {
    if (props.open && url) loadNaturalFromUrl(url)
  }
)

function setTargetFromImage(): void {
  if (!imgNatural.value.width) return
  targetW.value = imgNatural.value.width
  targetH.value = imgNatural.value.height
  resetView()
}

function selectPreset(w: number, h: number): void {
  targetW.value = w
  targetH.value = h
  resetView()
}

/**
 * Cover: scale so image covers the frame; contain: scale so image fits inside.
 * zoom multiplies that base scale. pan is in frame CSS pixels.
 */
function computeDraw(
  outW: number,
  outH: number
): { dx: number; dy: number; dw: number; dh: number } {
  const iw = imgNatural.value.width || 1
  const ih = imgNatural.value.height || 1
  const base =
    fitMode.value === 'contain' ? Math.min(outW / iw, outH / ih) : Math.max(outW / iw, outH / ih)
  const scale = base * Math.max(0.1, zoom.value)
  const dw = iw * scale
  const dh = ih * scale
  // pan is in display space; map proportionally when outW differs from frameDisplay
  const disp = frameDisplay.value
  const scalePanX = outW / Math.max(1, disp.width)
  const scalePanY = outH / Math.max(1, disp.height)
  const dx = (outW - dw) / 2 + panX.value * scalePanX
  const dy = (outH - dh) / 2 + panY.value * scalePanY
  return { dx, dy, dw, dh }
}

function onPointerDown(e: PointerEvent): void {
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!isDragging.value) return
  panX.value = dragStart.value.panX + (e.clientX - dragStart.value.x)
  panY.value = dragStart.value.panY + (e.clientY - dragStart.value.y)
}

function onPointerUp(): void {
  isDragging.value = false
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.08 : 0.08
  zoom.value = Math.min(4, Math.max(0.2, zoom.value + delta))
}

async function apply(): Promise<void> {
  if (!imgEl.value || applying.value) return
  const w = Math.max(64, Math.round(Number(targetW.value) || 1024))
  const h = Math.max(64, Math.round(Number(targetH.value) || 1024))
  applying.value = true
  errorMsg.value = null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    if (fitMode.value === 'contain') {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, w, h)
    }
    const { dx, dy, dw, dh } = computeDraw(w, h)
    ctx.drawImage(imgEl.value, dx, dy, dw, dh)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    )
    if (!blob) throw new Error('Export failed')
    const file = new File([blob], `ref-${w}x${h}.png`, { type: 'image/png' })
    emit('apply', { file, width: w, height: h })
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Export failed'
  } finally {
    applying.value = false
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick()
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="aui-dialog-backdrop fixed inset-0 z-[310] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm titlebar-no-drag"
      role="presentation"
      @pointerdown.self="emit('cancel')"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        class="aui-dialog-surface flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/25"
        @pointerdown.stop
      >
        <header class="flex shrink-0 items-start gap-3 border-b border-border/60 px-5 py-4">
          <div class="min-w-0 flex-1">
            <h2 id="crop-title" class="text-base font-semibold tracking-tight">
              Fit to output size
            </h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Place the image in the target frame, then Apply.
            </p>
          </div>
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
            @click="emit('cancel')"
          >
            <X class="size-4" />
          </button>
        </header>

        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <!-- Target size -->
          <div>
            <p class="mb-1.5 text-[11px] font-medium text-muted-foreground">Target size</p>
            <div class="mb-2 flex flex-wrap gap-1">
              <button
                v-for="p in resolutionPresets.slice(0, 6)"
                :key="p.label"
                type="button"
                class="rounded-md border border-border/70 px-2 py-1 font-mono text-[10px] transition-colors hover:bg-muted"
                :class="
                  targetW === p.width && targetH === p.height
                    ? 'border-foreground bg-muted text-foreground'
                    : 'text-muted-foreground'
                "
                @click="selectPreset(p.width, p.height)"
              >
                {{ p.width }}×{{ p.height }}
              </button>
            </div>
            <div class="flex items-center gap-1.5">
              <input
                v-model.number="targetW"
                type="number"
                min="64"
                step="64"
                aria-label="Target width"
                class="aui-field h-8 w-[4.5rem] rounded-md border border-input bg-background px-2 font-mono text-[11px]"
              />
              <span class="text-muted-foreground">×</span>
              <input
                v-model.number="targetH"
                type="number"
                min="64"
                step="64"
                aria-label="Target height"
                class="aui-field h-8 w-[4.5rem] rounded-md border border-input bg-background px-2 font-mono text-[11px]"
              />
              <button
                type="button"
                class="ml-auto inline-flex h-8 items-center rounded-md border border-border/70 px-2 text-[11px] font-medium hover:bg-muted"
                title="Use the source image’s natural resolution as the target"
                @click="setTargetFromImage"
              >
                From image
              </button>
            </div>
          </div>

          <!-- Fit mode + zoom -->
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex rounded-lg border border-border/70 p-0.5 text-[11px]">
              <button
                type="button"
                class="rounded-md px-2.5 py-1 font-medium transition-colors"
                :class="
                  fitMode === 'cover' ? 'bg-foreground text-background' : 'text-muted-foreground'
                "
                @click="fitMode = 'cover'"
              >
                Cover
              </button>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 font-medium transition-colors"
                :class="
                  fitMode === 'contain' ? 'bg-foreground text-background' : 'text-muted-foreground'
                "
                @click="fitMode = 'contain'"
              >
                Contain
              </button>
            </div>
            <label class="flex flex-1 items-center gap-2 text-[11px] text-muted-foreground">
              Zoom
              <input
                v-model.number="zoom"
                type="range"
                min="0.2"
                max="4"
                step="0.05"
                class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
              />
            </label>
          </div>

          <!-- Viewport -->
          <div class="flex justify-center">
            <div
              ref="viewportRef"
              class="relative cursor-grab overflow-hidden rounded-xl border border-border bg-black active:cursor-grabbing"
              :style="{
                width: frameDisplay.width + 'px',
                height: frameDisplay.height + 'px'
              }"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
              @wheel.prevent="onWheel"
            >
              <div
                v-if="imgNatural.width"
                class="pointer-events-none absolute"
                :style="previewImageStyle"
              >
                <img
                  :src="imageUrl"
                  class="h-full w-full select-none object-fill"
                  draggable="false"
                />
              </div>
              <div
                class="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20"
              />
            </div>
          </div>

          <p v-if="errorMsg" class="text-xs text-destructive">{{ errorMsg }}</p>
        </div>

        <footer
          class="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-3"
        >
          <button
            type="button"
            class="inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium hover:bg-muted"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center rounded-lg bg-foreground px-3.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-40"
            :disabled="applying || !imgNatural.width"
            @click="apply"
          >
            {{ applying ? 'Applying…' : `Apply ${targetW}×${targetH}` }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
