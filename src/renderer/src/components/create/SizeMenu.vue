<script setup lang="ts">
/** Output size: aspect ratios at the model's pixel budget, plus an exact width × height. */
import { computed, ref } from 'vue'
import { Frame } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const props = defineProps<{
  width: number
  height: number
  /** Pixel side multiple sd.cpp needs for this model (64 images, 16 video) */
  multiple?: number
  /** Extra sizes to offer first (style kit sizes) */
  extra?: Array<{ label: string; width: number; height: number }>
}>()
const emit = defineEmits<{ update: [size: { width: number; height: number }] }>()

const open = ref(false)
const RATIOS: Array<[string, number, number]> = [
  ['1:1', 1, 1],
  ['4:3', 4, 3],
  ['3:4', 3, 4],
  ['3:2', 3, 2],
  ['2:3', 2, 3],
  ['16:9', 16, 9],
  ['9:16', 9, 16],
  ['21:9', 21, 9]
]

const step = computed(() => props.multiple || 64)
const area = computed(() => Math.max(256 * 256, props.width * props.height))
const round = (value: number): number =>
  Math.max(step.value, Math.round(value / step.value) * step.value)

const options = computed(() =>
  RATIOS.map(([label, w, h]) => {
    const unit = Math.sqrt(area.value / (w * h))
    return { label, width: round(w * unit), height: round(h * unit) }
  })
)

const label = computed(() => {
  const match = options.value.find((o) => o.width === props.width && o.height === props.height)
  return match ? `${match.label}` : `${props.width}×${props.height}`
})

function choose(width: number, height: number): void {
  emit('update', { width: round(width), height: round(height) })
}

function setSide(side: 'width' | 'height', raw: string): void {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 64 || value > 4096) return
  emit('update', {
    width: side === 'width' ? round(value) : props.width,
    height: side === 'height' ? round(value) : props.height
  })
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-accent"
        :aria-label="`Size ${width} by ${height}`"
      >
        <Frame class="size-3.5 text-muted-foreground" />
        <span class="tabular-nums">{{ label }}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" class="w-64 p-3">
      <div v-if="extra?.length" class="mb-2 flex flex-wrap gap-1">
        <button
          v-for="size in extra"
          :key="size.label + size.width"
          type="button"
          class="h-7 rounded-md bg-muted px-2 text-xs hover:bg-accent"
          @click="choose(size.width, size.height)"
        >
          {{ size.label || `${size.width}×${size.height}` }}
        </button>
      </div>
      <div class="grid grid-cols-4 gap-1">
        <button
          v-for="option in options"
          :key="option.label"
          type="button"
          class="flex h-14 flex-col items-center justify-center gap-1 rounded-md text-xs hover:bg-accent"
          :class="
            option.width === width && option.height === height
              ? 'bg-accent font-medium text-foreground'
              : 'text-muted-foreground'
          "
          :aria-label="`${option.label}, ${option.width} by ${option.height}`"
          @click="choose(option.width, option.height)"
        >
          <span
            class="block rounded-[3px] border border-current"
            :style="{
              width: `${Math.round(22 * Math.min(1, option.width / option.height))}px`,
              height: `${Math.round(22 * Math.min(1, option.height / option.width))}px`
            }"
          />
          {{ option.label }}
        </button>
      </div>
      <div class="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[13px]">
        <input
          type="number"
          class="h-7 w-full rounded-md border border-input bg-background px-2 tabular-nums"
          :value="width"
          :step="step"
          aria-label="Width"
          @change="setSide('width', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-muted-foreground">×</span>
        <input
          type="number"
          class="h-7 w-full rounded-md border border-input bg-background px-2 tabular-nums"
          :value="height"
          :step="step"
          aria-label="Height"
          @change="setSide('height', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </PopoverContent>
  </Popover>
</template>
