<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Play, SlidersHorizontal, Square } from '@/lib/icons'
import Titlebar from './components/layout/Titlebar.vue'
import Sidebar from './components/layout/Sidebar.vue'
import ConfigPanel from './components/layout/ConfigPanel.vue'
import MobileNav from './components/layout/MobileNav.vue'
import ToastContainer from './components/ToastContainer.vue'
import FloatingLogPanel from './components/FloatingLogPanel.vue'
import { initializeApi } from './services/api'
import { useSetup } from './composables/useSetup'
import SetupWizard from './components/SetupWizard.vue'
import { useConfigStore } from './stores/config'
import SegmentedControl from './components/ui/SegmentedControl.vue'
import Select from './components/ui/Select.vue'
import { useRuntimeStatus } from './composables/useRuntimeStatus'
import { useServerControls } from './composables/useServerControls'
import { useModels } from './composables/useModels'

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { sdServerRunning, backendValid, fetchRuntimeStatus } = useRuntimeStatus()
const { isBooting, startServer, stopServer } = useServerControls(config, fetchRuntimeStatus)
const { models, fetchModels } = useModels()
const { isSetupNeeded, loadState, skipForNow, completeSetup, reopenSetup } = useSetup()

const showMobileConfig = ref(false)
const activeConfigPanel = ref<'model' | 'generation' | null>(null)
const showFloatingLogs = ref(false)

const activeModelValue = computed(() =>
  config.value.loadMode === 'standard' ? config.value.standardModel : config.value.diffusionModel
)
const modelOptions = computed(() => [
  { label: 'No model', value: '' },
  ...models.value.diffusion.map((model) => ({
    label: model.split(/[\\/]/).pop() || model,
    value: model
  }))
])
const backendModeOptions = [
  { value: 'cli', label: 'CLI' },
  { value: 'server', label: 'Server' }
]

const currentTab = computed(() => {
  const name = route.name as string
  return name?.toLowerCase() || 'text2image'
})

const showWorkspaceControls = computed(() =>
  ['text2image', 'edit', 'video'].includes(currentTab.value)
)

const configPanelVisible = computed(
  () => showWorkspaceControls.value && (activeConfigPanel.value !== null || showMobileConfig.value)
)

const routeMap: Record<string, string> = {
  text2image: 'Text2Image',
  edit: 'Edit',
  video: 'Video',
  gallery: 'Gallery',
  settings: 'Settings',
  quantization: 'Quantization'
}

function navigateToTab(tab: string): void {
  const routeName = routeMap[tab] || tab
  router.push({ name: routeName })
}

function openConfigPanel(panel: 'model' | 'generation'): void {
  const isMobileViewport = window.matchMedia('(max-width: 767px)').matches
  showMobileConfig.value = isMobileViewport
  activeConfigPanel.value = panel
}

function closeConfigPanel(): void {
  activeConfigPanel.value = null
  showMobileConfig.value = false
}

function selectModel(value: string): void {
  if (!value) {
    configStore.updateConfig({ standardModel: '', diffusionModel: '' })
    return
  }

  configStore.updateConfig(
    config.value.loadMode === 'standard'
      ? { standardModel: value }
      : { diffusionModel: value }
  )
  openConfigPanel('model')
}

function handleBackendMode(value: string): void {
  if (value === 'cli' || value === 'server') configStore.updateConfig({ backendMode: value })
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && configPanelVisible.value) closeConfigPanel()
}

onMounted(async () => {
  try {
    const state = await window.electronAPI?.getInitState()
    if (state?.port) {
      initializeApi(state.port)
    }
  } catch (e) {
    console.log('Running outside Electron or getInitState not available')
  }

  await loadState()
  await fetchModels()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="flex h-screen w-screen flex-row overflow-hidden bg-background text-foreground">
    <Sidebar
      class="hidden md:flex"
      :current-tab="currentTab"
      @navigate="navigateToTab"
    />

    <div class="flex min-w-0 min-h-0 flex-1 flex-col">
      <Titlebar
        :current-tab="currentTab"
        :setup-needed="isSetupNeeded"
        @toggle-mobile-config="showMobileConfig = !showMobileConfig"
        @toggle-logs="showFloatingLogs = !showFloatingLogs"
        @open-setup="reopenSetup"
      />

      <div class="relative flex flex-1 min-h-0 overflow-hidden">
        <div
          class="relative flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden"
          :class="{ 'bg-background': !showWorkspaceControls }"
        >
          <div
            v-if="showWorkspaceControls"
            class="absolute left-3 top-3 z-30 flex items-center gap-1.5 whitespace-nowrap titlebar-no-drag"
            @click.stop
          >
            <SegmentedControl
              :model-value="config.backendMode"
              :options="backendModeOptions"
              size="sm"
              aria-label="Backend mode"
              @update:model-value="handleBackendMode"
            />
            <Select
              :model-value="activeModelValue"
              :options="modelOptions"
              size="sm"
              placeholder="No model"
              aria-label="Select diffusion model"
              class="min-w-[12rem]"
              @update:model-value="selectModel"
            />
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              :aria-expanded="activeConfigPanel === 'generation'"
              @click="openConfigPanel('generation')"
            >
              <SlidersHorizontal class="h-3.5 w-3.5" />
              <span>Generation</span>
            </button>
            <div
              v-if="config.backendMode === 'server'"
              class="inline-flex items-center gap-1 rounded-md border border-border bg-muted p-0.5"
            >
              <button
                type="button"
                :disabled="sdServerRunning || isBooting || !backendValid"
                class="inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 hover:text-foreground"
                :class="
                  sdServerRunning || isBooting || !backendValid
                    ? 'text-muted-foreground'
                    : 'bg-background text-foreground shadow-sm'
                "
                @click="startServer"
              >
                <Play class="h-3 w-3" />
                {{ isBooting ? 'Booting' : 'Start' }}
              </button>
              <button
                type="button"
                :disabled="!sdServerRunning || isBooting"
                class="inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 hover:text-foreground"
                :class="
                  sdServerRunning
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                "
                @click="stopServer"
              >
                <Square class="h-3 w-3" />
                Stop
              </button>
            </div>
          </div>

          <div
            v-if="configPanelVisible"
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
            @click="closeConfigPanel"
          >
            <div
              class="flex h-[min(80vh,720px)] w-[min(72rem,calc(100vw-2rem))] max-w-full flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
              @click.stop
            >
              <ConfigPanel
                :collapsed="false"
                :focus="activeConfigPanel || 'generation'"
                @close="closeConfigPanel"
                @expand="activeConfigPanel = 'generation'"
              />
            </div>
          </div>

          <main class="relative flex w-full min-h-0 flex-1 flex-col overflow-hidden">
            <router-view v-slot="{ Component, route }">
              <keep-alive>
                <component :is="Component" :key="route.fullPath" />
              </keep-alive>
            </router-view>
          </main>
        </div>
      </div>

      <MobileNav class="md:hidden" :current-tab="currentTab" @navigate="navigateToTab" />
    </div>

    <ToastContainer />

    <FloatingLogPanel v-model="showFloatingLogs" />

    <SetupWizard
      v-if="isSetupNeeded"
      @done="completeSetup"
      @skip="skipForNow"
    />
  </div>
</template>
