<script setup lang="ts">
import type { Component } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import {
  ImageIcon,
  Brush,
  Video,
  Images,
  Settings,
  Scale,
  FolderOpen,
  Database,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Search
} from '@/lib/icons'
import Tooltip from '@/components/ui/Tooltip.vue'
import BrandMark from '@/components/BrandMark.vue'

interface NavItem {
  id: string
  label: string
  icon: Component
}

const props = defineProps<{
  currentTab: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  navigate: [tab: string]
  toggleCollapse: []
  openSearch: []
}>()

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '')
const searchShortcutLabel = isMac ? '⌘K' : 'Ctrl+K'
const preferredMotion = usePreferredReducedMotion()

const navItems: NavItem[] = [
  { id: 'text2image', label: 'Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Brush },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'quantization', label: 'Quantize', icon: Scale },
  { id: 'help', label: 'Help', icon: BookOpen }
]

function isActive(id: string): boolean {
  return props.currentTab === id
}

function handleNavClick(id: string): void {
  emit('navigate', id)
}

function openModelsFolder(): void {
  window.electronAPI?.openModelsFolder()
}

function openGalleryFolder(): void {
  window.electronAPI?.openGalleryFolder()
}
</script>

<template>
  <aside
    class="relative isolate flex h-full shrink-0 flex-col border-r-0 bg-sidebar transition-[width] duration-200"
    :class="collapsed ? 'w-14 items-center px-2 py-2' : 'w-52 items-stretch px-3 py-3'"
  >
    <div v-if="!collapsed" class="sidebar-brand-backdrop" aria-hidden="true">
      <svg
        class="sidebar-brand-backdrop__texture"
        viewBox="0 0 208 56"
        preserveAspectRatio="none"
      >
        <defs>
          <filter
            id="sidebar-brand-warp"
            x="-12%"
            y="-30%"
            width="124%"
            height="160%"
            color-interpolation-filters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015 0.055"
              numOctaves="2"
              seed="8"
              result="textureNoise"
            >
              <animate
                v-if="preferredMotion !== 'reduce'"
                attributeName="baseFrequency"
                values="0.015 0.055; 0.022 0.044; 0.012 0.066; 0.019 0.05; 0.015 0.055"
                dur="9s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="textureNoise"
              scale="11"
              xChannelSelector="R"
              yChannelSelector="G"
            >
              <animate
                v-if="preferredMotion !== 'reduce'"
                attributeName="scale"
                values="8; 14; 10; 16; 8"
                dur="7s"
                repeatCount="indefinite"
              />
            </feDisplacementMap>
          </filter>
        </defs>
        <g class="sidebar-brand-backdrop__ribs" filter="url(#sidebar-brand-warp)">
          <path
            v-for="i in 20"
            :key="`rib-shadow-${i}`"
            :d="`M ${i * 12 - 16} -12 V 72`"
            class="sidebar-brand-backdrop__rib sidebar-brand-backdrop__rib--shadow"
          />
          <path
            v-for="i in 20"
            :key="`rib-light-${i}`"
            :d="`M ${i * 12 - 19} -12 V 72`"
            class="sidebar-brand-backdrop__rib sidebar-brand-backdrop__rib--light"
          />
        </g>
      </svg>
    </div>

    <!-- Brand (expanded) + collapse/expand — size-8 control -->
    <div
      class="relative z-10 mb-3 flex h-8 w-full shrink-0 items-center"
      :class="collapsed ? 'justify-center' : 'justify-between px-1'"
    >
      <BrandMark
        v-if="!collapsed"
        size="sm"
        :ambient="false"
        class="min-w-0 shrink rounded-lg bg-[#07140c]/92 px-2 py-1.5 !text-white shadow-sm dark:bg-[#e8f1eb]/90 dark:!text-[#07140c]"
      />
      <Tooltip :text="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" position="right">
        <button
          type="button"
          class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="emit('toggleCollapse')"
        >
          <ChevronRight v-if="collapsed" class="size-4" />
          <ChevronLeft v-else class="size-4" />
        </button>
      </Tooltip>
    </div>

    <!-- Search / jump -->
    <div class="mb-2 w-full" :class="collapsed ? 'flex justify-center' : ''">
      <Tooltip v-if="collapsed" :text="`Search (${searchShortcutLabel})`" position="right">
        <button
          type="button"
          class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          aria-label="Search"
          @click="emit('openSearch')"
        >
          <Search class="size-4" />
        </button>
      </Tooltip>
      <button
        v-else
        type="button"
        class="aui-icon-button inline-flex h-8 w-full items-center gap-2 rounded-md border border-transparent bg-sidebar-accent/60 px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        aria-label="Search"
        @click="emit('openSearch')"
      >
        <Search class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-left">Search</span>
        <kbd
          class="shrink-0 rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
          >{{ searchShortcutLabel }}</kbd
        >
      </button>
    </div>

    <!-- Same gap as expanded; collapsed icons match collapse button (size-8) -->
    <nav
      class="flex flex-1 flex-col gap-0.5"
      :class="collapsed ? 'items-center' : ''"
      aria-label="Primary navigation"
    >
      <template v-for="item in navItems" :key="item.id">
        <Tooltip v-if="collapsed" :text="item.label" position="right">
          <button
            type="button"
            class="aui-icon-button relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            :class="isActive(item.id) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
            :aria-label="item.label"
            :aria-current="isActive(item.id) ? 'page' : undefined"
            @click="handleNavClick(item.id)"
          >
            <component :is="item.icon" class="size-4" />
          </button>
        </Tooltip>
        <button
          v-else
          type="button"
          class="aui-icon-button relative inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :class="isActive(item.id) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          @click="handleNavClick(item.id)"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </button>
      </template>
    </nav>

    <div
      class="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border/70 pt-2"
      :class="collapsed ? 'items-center' : ''"
    >
      <template v-if="collapsed">
        <Tooltip text="Settings" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            :class="
              isActive('settings') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''
            "
            aria-label="Settings"
            :aria-current="isActive('settings') ? 'page' : undefined"
            @click="handleNavClick('settings')"
          >
            <Settings class="size-4" />
          </button>
        </Tooltip>
        <Tooltip text="Open Models Folder" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            aria-label="Open Models Folder"
            @click="openModelsFolder"
          >
            <Database class="size-4" />
          </button>
        </Tooltip>
        <Tooltip text="Open Gallery Folder" position="right">
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
            aria-label="Open Gallery Folder"
            @click="openGalleryFolder"
          >
            <FolderOpen class="size-4" />
          </button>
        </Tooltip>
      </template>
      <template v-else>
        <button
          type="button"
          class="aui-icon-button inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          :class="isActive('settings') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''"
          :aria-current="isActive('settings') ? 'page' : undefined"
          @click="handleNavClick('settings')"
        >
          <Settings class="size-4 shrink-0" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          class="aui-icon-button inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          @click="openModelsFolder"
        >
          <Database class="size-4 shrink-0" />
          <span>Models</span>
        </button>
        <button
          type="button"
          class="aui-icon-button inline-flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
          @click="openGalleryFolder"
        >
          <FolderOpen class="size-4 shrink-0" />
          <span>Gallery</span>
        </button>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-brand-backdrop {
  --brand-texture-start: #b8d5ad;
  --brand-texture-end: #dfead9;
  --brand-rib-light: rgb(255 255 255 / 0.26);
  --brand-rib-dark: rgb(18 69 42 / 0.3);
  --brand-depth: rgb(23 78 48 / 0.22);
  pointer-events: none;
  position: absolute;
  inset: 0 0 auto;
  height: 3.5rem;
  overflow: hidden;
  border: 0;
  border-radius: 0 0 0.875rem 0;
  outline: none;
  box-shadow: none;
  -webkit-mask-image: radial-gradient(
    ellipse 100% 100% at 0 0,
    #000 0%,
    #000 46%,
    rgb(0 0 0 / 0.86) 56%,
    rgb(0 0 0 / 0.54) 68%,
    rgb(0 0 0 / 0.18) 80%,
    transparent 92%
  );
  mask-image: radial-gradient(
    ellipse 100% 100% at 0 0,
    #000 0%,
    #000 46%,
    rgb(0 0 0 / 0.86) 56%,
    rgb(0 0 0 / 0.54) 68%,
    rgb(0 0 0 / 0.18) 80%,
    transparent 92%
  );
  background:
    radial-gradient(
      ellipse 92% 58% at 42% 118%,
      var(--brand-depth) 0%,
      transparent 72%
    ),
    linear-gradient(110deg, var(--brand-texture-start), var(--brand-texture-end));
}

.sidebar-brand-backdrop__texture {
  position: absolute;
  z-index: 0;
  inset: -8%;
  width: 116%;
  height: 116%;
  transform-origin: center;
  animation: sidebar-brand-texture-drift 12s ease-in-out infinite alternate;
}

.sidebar-brand-backdrop__rib {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.sidebar-brand-backdrop__rib--shadow {
  stroke: var(--brand-rib-dark);
  stroke-width: 4;
}

.sidebar-brand-backdrop__rib--light {
  stroke: var(--brand-rib-light);
  stroke-width: 1.5;
}

:global(.dark) .sidebar-brand-backdrop {
  --brand-texture-start: #103e31;
  --brand-texture-end: #0a241c;
  --brand-rib-light: rgb(132 190 157 / 0.2);
  --brand-rib-dark: rgb(1 17 11 / 0.42);
  --brand-depth: rgb(0 10 6 / 0.34);
}

@keyframes sidebar-brand-texture-drift {
  0% {
    transform: translate3d(-2%, -1%, 0) scale(1.02);
  }
  48% {
    transform: translate3d(1.5%, 1%, 0) scale(1.045);
  }
  100% {
    transform: translate3d(-0.5%, 2%, 0) scale(1.025);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-brand-backdrop__texture {
    animation: none;
    transform: none;
  }
}
</style>
