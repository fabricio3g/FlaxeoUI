<script setup lang="ts">
/**
 * Light / Dark / System with a small drawing of the app in each theme (sidebar, top bar,
 * images and the prompt box), using the app's own colors.
 */
import { Check } from '@/lib/icons'
import { useTheme, type ThemePreference } from '@/composables/useTheme'

const { themePreference, setTheme } = useTheme()

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
]

/** Colors from main.css :root / .dark (card = workspace surface). */
const PALETTES = {
  light: {
    shell: '#ffffff',
    card: '#ffffff',
    line: '#e6e6e6',
    muted: '#f5f5f5',
    ink: '#000000',
    soft: '#a3a3a3',
    image: ['#d4d4d4', '#bdbdbd', '#e5e5e5']
  },
  dark: {
    shell: '#000000',
    card: '#101010',
    line: '#262626',
    muted: '#1c1c1c',
    ink: '#ffffff',
    soft: '#5c5c5c',
    image: ['#3a3a3a', '#2c2c2c', '#474747']
  }
} as const
</script>

<template>
  <div class="grid max-w-md grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="themePreference === option.value"
      class="group flex min-w-0 flex-col gap-2 text-left"
      @click="setTheme(option.value)"
    >
      <span
        class="block overflow-hidden rounded-lg border-2 transition-colors"
        :class="
          themePreference === option.value
            ? 'border-foreground'
            : 'border-border group-hover:border-muted-foreground'
        "
      >
        <svg viewBox="0 0 120 80" class="block w-full" aria-hidden="true">
          <defs>
            <clipPath :id="`theme-half-${option.value}`">
              <polygon points="0,0 120,0 0,80" />
            </clipPath>
          </defs>
          <g
            v-for="(palette, name) in PALETTES"
            v-show="option.value === 'system' || option.value === name"
            :key="name"
            :clip-path="
              option.value === 'system' && name === 'light'
                ? `url(#theme-half-${option.value})`
                : undefined
            "
          >
            <!-- shell + sidebar -->
            <rect width="120" height="80" :fill="palette.shell" />
            <rect x="6" y="7" width="16" height="3" rx="1.5" :fill="palette.ink" />
            <rect x="6" y="15" width="20" height="4" rx="2" :fill="palette.muted" />
            <rect x="6" y="22" width="14" height="2.5" rx="1.25" :fill="palette.soft" />
            <rect x="6" y="28" width="16" height="2.5" rx="1.25" :fill="palette.soft" />
            <rect x="6" y="34" width="12" height="2.5" rx="1.25" :fill="palette.soft" />
            <!-- workspace card -->
            <rect
              x="31"
              y="3"
              width="86"
              height="74"
              rx="5"
              :fill="palette.card"
              :stroke="palette.line"
              stroke-width="0.8"
            />
            <rect x="37" y="9" width="22" height="2.5" rx="1.25" :fill="palette.ink" />
            <!-- results -->
            <rect x="37" y="18" width="22" height="26" rx="2.5" :fill="palette.image[0]" />
            <rect x="62" y="18" width="22" height="26" rx="2.5" :fill="palette.image[1]" />
            <rect x="87" y="18" width="22" height="26" rx="2.5" :fill="palette.image[2]" />
            <!-- prompt box -->
            <rect
              x="40"
              y="54"
              width="68"
              height="17"
              rx="4"
              :fill="palette.muted"
              :stroke="palette.line"
              stroke-width="0.8"
            />
            <rect x="45" y="59" width="30" height="2.5" rx="1.25" :fill="palette.soft" />
            <rect x="93" y="63" width="11" height="5" rx="2" :fill="palette.ink" />
          </g>
          <line
            v-if="option.value === 'system'"
            x1="120"
            y1="0"
            x2="0"
            y2="80"
            stroke="#8a8a8a"
            stroke-width="0.6"
          />
        </svg>
      </span>
      <span class="flex items-center gap-1 text-[13px] font-medium">
        {{ option.label }}
        <Check v-if="themePreference === option.value" class="size-3.5" />
      </span>
    </button>
  </div>
</template>
