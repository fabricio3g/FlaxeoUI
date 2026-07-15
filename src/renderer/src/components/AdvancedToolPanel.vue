<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Plus, Upload, X } from '@/lib/icons'
import { useConfigStore } from '@/stores/config'
import { getFileUrl } from '@/services/api'
import Select from '@/components/ui/Select.vue'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import {
  REF_IMAGE_PRESET_OPTIONS,
  resolveRefImagePreset
} from '../../../shared/refImageArgs'

export type AdvancedToolTab = 'photomaker' | 'controlnet' | 'img2img' | 'kontext'

const props = defineProps<{
  tab: AdvancedToolTab | ''
  anchor?: { top: number; left: number; right: number; bottom: number; width: number }
}>()

const emit = defineEmits<{
  close: []
  'pm-upload': [event: Event]
  'pm-remove': [index: number]
  'cn-upload': [event: Event]
  'cn-clear': []
  'init-upload': [event: Event]
  'init-clear': []
  'ref-upload': [event: Event]
  'ref-clear': []
}>()

const PANEL_WIDTH = 340
const GAP = 8

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { supportsRefImageArgs, fetchCapabilities } = useBackendCapabilities()
// refImageCliFlag is applied at generate time in Text2Image.vue

const open = computed(() => !!props.tab)

const title = computed(() => {
  const map: Record<string, string> = {
    photomaker: 'PhotoMaker',
    controlnet: 'ControlNet',
    img2img: 'Image to Image',
    kontext: 'Reference'
  }
  return map[props.tab] || 'Tools'
})

const hint = computed(() => {
  const map: Record<string, string> = {
    photomaker: 'ID images and style strength',
    controlnet: 'Guide structure with a control image',
    img2img: 'Start from an image and denoise',
    kontext: 'Reference for Kontext / Anima edit / Qwen edit'
  }
  return map[props.tab] || ''
})

const suggestedRefPreset = computed(() =>
  resolveRefImagePreset({
    diffusionModel:
      config.value.loadMode === 'standard'
        ? config.value.standardModel
        : config.value.diffusionModel,
    uncondDiffusionModel: config.value.uncondDiffusionModel
  })
)

const refImagePresetOptions = computed(() => {
  const base = REF_IMAGE_PRESET_OPTIONS.map((o) => ({ ...o }))
  if (suggestedRefPreset.value) {
    const auto = base.find((o) => o.value === 'auto')
    if (auto) auto.label = `Auto (${suggestedRefPreset.value})`
  }
  if (!supportsRefImageArgs.value) {
    return base.map((o) =>
      o.value === 'off' ? { ...o, label: 'Off (no --ref-image-args on this binary)' } : o
    )
  }
  return base
})

watch(
  supportsRefImageArgs,
  (ok) => {
    if (!ok && (!config.value.refImagePreset || config.value.refImagePreset === 'auto')) {
      config.value.refImagePreset = 'off'
    }
  },
  { immediate: true }
)

const panelStyle = computed(() => {
  const a = props.anchor
  if (!a || typeof window === 'undefined') {
    return { bottom: '6rem', right: '1rem', width: `${PANEL_WIDTH}px` }
  }

  const width = Math.min(PANEL_WIDTH, window.innerWidth - 16)
  const panelHeight = Math.min(420, window.innerHeight * 0.55)
  let left = a.right - width
  if (left < 8) left = 8
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8)
  }

  // Prefer open above the toolbar (composer sits at bottom)
  const spaceAbove = a.top - 8
  const spaceBelow = window.innerHeight - a.bottom - 8
  if (spaceAbove >= 180 || spaceAbove >= spaceBelow) {
    const bottom = Math.max(8, window.innerHeight - a.top + GAP)
    return {
      bottom: `${bottom}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${Math.min(panelHeight, spaceAbove - GAP)}px`
    }
  }

  const top = Math.min(a.bottom + GAP, window.innerHeight - 120)
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(panelHeight, spaceBelow - GAP)}px`
  }
})

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    emit('close')
  }
}

/** Close when clicking outside the panel (do not block Generate / composer). */
function onPointerDownOutside(e: PointerEvent): void {
  if (!open.value) return
  const target = e.target as HTMLElement | null
  if (!target) return
  // Keep open for the floating panel and portaled Select / popover content
  if (target.closest('[data-slot="advanced-tool-panel"]')) return
  if (target.closest('[data-slot="select-content"]')) return
  if (target.closest('[data-reka-popper-content-wrapper]')) return
  // Toolbar buttons that open/switch this panel — handled by parent toggle
  if (target.closest('[data-slot="advanced-toolbar"]')) return
  emit('close')
}

function bindOutsideListeners(bind: boolean): void {
  if (bind) {
    window.addEventListener('keydown', onKeydown)
    // Capture phase so we see the event before it is stopped; does not cover the UI
    window.addEventListener('pointerdown', onPointerDownOutside, true)
  } else {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('pointerdown', onPointerDownOutside, true)
  }
}

watch(
  () => props.tab,
  (tab) => {
    bindOutsideListeners(!!tab)
  }
)

onMounted(() => {
  void fetchCapabilities()
  if (props.tab) bindOutsideListeners(true)
})

onUnmounted(() => {
  bindOutsideListeners(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="float-panel">
      <div
        v-if="open"
        data-slot="advanced-tool-panel"
        role="dialog"
        :aria-label="title"
        class="aui-float-panel fixed z-[110] flex flex-col overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground titlebar-no-drag"
        :style="panelStyle"
        @pointerdown.stop
      >
        <header
          class="aui-scroll-header aui-scroll-header--popover aui-scroll-header--compact flex items-start justify-between gap-2 bg-popover px-3.5 py-3"
        >
          <div class="min-w-0">
            <h2 class="text-sm font-semibold tracking-tight text-foreground">{{ title }}</h2>
            <p v-if="hint" class="mt-0.5 text-sm leading-5 text-muted-foreground">{{ hint }}</p>
          </div>
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            :aria-label="`Close ${title}`"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
          <div class="aui-scroll-header__fade" aria-hidden="true" />
        </header>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 pb-3.5 pt-1">
          <!-- PhotoMaker -->
          <div v-if="tab === 'photomaker'" class="space-y-3">
            <p class="text-sm font-medium text-foreground">
              ID images
              <span class="font-normal text-muted-foreground"
                >({{ config.photoMakerImages.length }}/4)</span
              >
            </p>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="(img, idx) in config.photoMakerImages"
                :key="idx"
                class="group relative size-20 overflow-hidden rounded-lg bg-muted/40"
              >
                <img :src="getFileUrl(img)" class="h-full w-full object-cover" alt="" />
                <button
                  type="button"
                  class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  title="Remove"
                  @click="emit('pm-remove', idx)"
                >
                  <X class="size-3.5" />
                </button>
              </div>
              <label
                v-if="config.photoMakerImages.length < 4"
                class="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Plus class="size-5" />
                <span class="text-xs">Add</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  class="hidden"
                  @change="emit('pm-upload', $event)"
                />
              </label>
            </div>
            <div>
              <label class="mb-1.5 flex items-center justify-between text-sm text-foreground">
                <span>Style strength</span>
                <span class="tabular-nums text-muted-foreground">{{
                  config.photoMakerStyleStrength
                }}</span>
              </label>
              <input
                v-model.number="config.photoMakerStyleStrength"
                type="range"
                min="0"
                max="100"
                class="w-full accent-foreground"
              />
            </div>
          </div>

          <!-- ControlNet -->
          <div v-else-if="tab === 'controlnet'" class="space-y-3">
            <p class="text-sm font-medium text-foreground">Control image</p>
            <div class="group relative size-24 overflow-hidden rounded-lg bg-muted/40">
              <img
                v-if="config.controlImagePath"
                :src="getFileUrl(config.controlImagePath)"
                class="h-full w-full object-cover"
                alt=""
              />
              <label
                class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Upload v-if="!config.controlImagePath" class="size-5" />
                <span v-if="!config.controlImagePath" class="text-sm">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="emit('cn-upload', $event)"
                />
              </label>
              <button
                v-if="config.controlImagePath"
                type="button"
                class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                title="Remove"
                @click.stop="emit('cn-clear')"
              >
                <X class="size-3.5" />
              </button>
            </div>
            <div>
              <label class="mb-1.5 flex items-center justify-between text-sm text-foreground">
                <span>Strength</span>
                <span class="tabular-nums text-muted-foreground">{{
                  config.controlNetStrength
                }}</span>
              </label>
              <input
                v-model.number="config.controlNetStrength"
                type="range"
                min="0"
                max="2"
                step="0.1"
                class="w-full accent-foreground"
              />
            </div>
            <label class="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
              <input v-model="config.applyCanny" type="checkbox" class="rounded border-border" />
              Apply Canny preprocessor
            </label>
          </div>

          <!-- Img2Img -->
          <div v-else-if="tab === 'img2img'" class="space-y-3">
            <p class="text-sm font-medium text-foreground">Initial image</p>
            <div class="group relative size-24 overflow-hidden rounded-lg bg-muted/40">
              <img
                v-if="config.initImagePath"
                :src="getFileUrl(config.initImagePath)"
                class="h-full w-full object-cover"
                alt=""
              />
              <label
                class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Upload v-if="!config.initImagePath" class="size-5" />
                <span v-if="!config.initImagePath" class="text-sm">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="emit('init-upload', $event)"
                />
              </label>
              <button
                v-if="config.initImagePath"
                type="button"
                class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                title="Remove"
                @click.stop="emit('init-clear')"
              >
                <X class="size-3.5" />
              </button>
            </div>
            <div>
              <label class="mb-1.5 flex items-center justify-between text-sm text-foreground">
                <span>Denoising</span>
                <span class="tabular-nums text-muted-foreground">{{ config.img2imgStrength }}</span>
              </label>
              <input
                v-model.number="config.img2imgStrength"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="w-full accent-foreground"
              />
              <div class="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Original</span>
                <span>Generated</span>
              </div>
            </div>
          </div>

          <!-- Reference (Kontext / DiT multi-ref) — not classic img2img denoise -->
          <div v-else-if="tab === 'kontext'" class="space-y-3">
            <p class="text-sm font-medium text-foreground">Reference image</p>
            <div class="group relative size-24 overflow-hidden rounded-lg bg-muted/40">
              <img
                v-if="config.kontextRefImage"
                :src="getFileUrl(config.kontextRefImage)"
                class="h-full w-full object-cover"
                alt=""
              />
              <label
                class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Upload v-if="!config.kontextRefImage" class="size-5" />
                <span v-if="!config.kontextRefImage" class="text-sm">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="emit('ref-upload', $event)"
                />
              </label>
              <button
                v-if="config.kontextRefImage"
                type="button"
                class="aui-icon-button absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                title="Remove"
                @click.stop="emit('ref-clear')"
              >
                <X class="size-3.5" />
              </button>
            </div>
            <p class="text-sm leading-5 text-muted-foreground">
              Guide style/subject (Flux Kontext, Anima edit LoRA, Qwen edit, …). Uses
              <span class="font-mono text-[11px]">-r</span> — not denoise img2img.
            </p>
            <div>
              <p class="mb-1.5 text-sm font-medium text-foreground">Reference processing</p>
              <Select
                v-model="config.refImagePreset"
                size="sm"
                class="w-full"
                aria-label="Reference processing preset"
                :disabled="!supportsRefImageArgs"
                :options="refImagePresetOptions"
              />
              <p
                v-if="!supportsRefImageArgs"
                class="mt-1.5 text-[11px] leading-4 text-muted-foreground"
              >
                Needs post-#1780 sd-cli for
                <span class="font-mono">--ref-image-args</span>. Flag omitted; -r still works.
              </p>
              <p v-else class="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                Auto suggests from model (e.g. Anima → cosmos_reference). Off = CLI architecture
                default (no override).
              </p>
            </div>
          </div>
        </div>

        <footer class="flex shrink-0 justify-end px-3.5 pb-3 pt-1">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            @click="emit('close')"
          >
            Done
          </button>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>
