<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Play, SlidersHorizontal, Square, X } from '@/lib/icons'
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
import { useBackendCapabilities } from './composables/useBackendCapabilities'
import { onOpenLogs } from './lib/appEvents'
import Settings from './views/Settings.vue'

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { sdServerRunning, backendValid, fetchRuntimeStatus } = useRuntimeStatus()
const { isBooting, startServer, stopServer } = useServerControls(config, fetchRuntimeStatus)
const { models, fetchModels } = useModels()
const { fetchCapabilities } = useBackendCapabilities()
const { isSetupNeeded, loadState, skipForNow, completeSetup, reopenSetup } = useSetup()

const showMobileConfig = ref(false)
type WorkspaceConfigPanel = 'model' | 'generation' | 'lora' | 'embedding'
const activeConfigPanel = ref<WorkspaceConfigPanel | null>(null)
const showFloatingLogs = ref(false)
const showSettings = ref(false)
const sidebarCollapsed = ref(localStorage.getItem('flaxeo-sidebar-collapsed') === 'true')

function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('flaxeo-sidebar-collapsed', String(sidebarCollapsed.value))
}

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
  quantization: 'Quantization'
}

function navigateToTab(tab: string): void {
  if (tab === 'settings') {
    closeConfigPanel()
    showSettings.value = true
    return
  }

  const routeName = routeMap[tab] || tab
  router.push({ name: routeName })
}

function openConfigPanel(panel: WorkspaceConfigPanel): void {
  const isMobileViewport = window.matchMedia('(max-width: 767px)').matches
  showMobileConfig.value = isMobileViewport
  activeConfigPanel.value = panel
}

function closeConfigPanel(): void {
  activeConfigPanel.value = null
  showMobileConfig.value = false
}

function closeSettings(): void {
  showSettings.value = false
}

function selectModel(value: string): void {
  if (!value) {
    configStore.updateConfig({ standardModel: '', diffusionModel: '' })
    return
  }

  configStore.updateConfig(
    config.value.loadMode === 'standard' ? { standardModel: value } : { diffusionModel: value }
  )
  openConfigPanel('model')
}

function handleBackendMode(value: string): void {
  if (value === 'cli' || value === 'server') configStore.updateConfig({ backendMode: value })
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showSettings.value) closeSettings()
  else if (configPanelVisible.value) closeConfigPanel()
}

let unsubscribeOpenLogs: (() => void) | null = null

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
  fetchCapabilities().catch(() => undefined)
  window.addEventListener('keydown', handleGlobalKeydown)
  unsubscribeOpenLogs = onOpenLogs(() => {
    showFloatingLogs.value = true
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  unsubscribeOpenLogs?.()
  unsubscribeOpenLogs = null
})
</script>

<template>
  <div
    class="isolate flex h-screen w-screen flex-row overflow-hidden bg-background text-foreground antialiased"
  >
    <Sidebar
      class="hidden md:flex"
      :current-tab="showSettings ? 'settings' : currentTab"
      :collapsed="sidebarCollapsed"
      @navigate="navigateToTab"
      @toggle-collapse="toggleSidebar"
    />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <Titlebar
        :current-tab="currentTab"
        :setup-needed="isSetupNeeded"
        :collapsed="sidebarCollapsed"
        @toggle-sidebar="toggleSidebar"
        @toggle-mobile-config="showMobileConfig = !showMobileConfig"
        @toggle-logs="showFloatingLogs = !showFloatingLogs"
        @open-setup="reopenSetup"
      />

      <div class="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          :class="{ 'bg-background': !showWorkspaceControls }"
        >
          <div
            v-if="showWorkspaceControls"
            class="aui-command-strip no-scrollbar absolute left-3 top-1.5 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 overflow-x-auto whitespace-nowrap titlebar-no-drag md:left-4 md:max-w-[calc(100%-2rem)]"
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
              class="min-w-[11rem] border-0 bg-transparent shadow-none hover:bg-accent md:min-w-[12rem]"
              @update:model-value="selectModel"
            />
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              :aria-expanded="activeConfigPanel === 'generation'"
              @click="openConfigPanel('generation')"
            >
              <SlidersHorizontal class="h-3.5 w-3.5" />
              <span>Generation</span>
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              :class="activeConfigPanel === 'lora' || config.loras.length ? 'text-foreground' : ''"
              :aria-expanded="activeConfigPanel === 'lora'"
              @click="openConfigPanel('lora')"
            >
              <span>LoRA</span>
              <span v-if="config.loras.length" class="font-mono text-[10px]">
                {{ config.loras.length }}
              </span>
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              :class="activeConfigPanel === 'embedding' || config.embeddings.length ? 'text-foreground' : ''"
              :aria-expanded="activeConfigPanel === 'embedding'"
              @click="openConfigPanel('embedding')"
            >
              <span>Embedding</span>
              <span v-if="config.embeddings.length" class="font-mono text-[10px]">
                {{ config.embeddings.length }}
              </span>
            </button>
            <div
              v-if="config.backendMode === 'server'"
              class="aui-status-badge inline-flex items-center gap-0.5 rounded-lg bg-muted/70 p-0.5"
            >
              <button
                type="button"
                :disabled="sdServerRunning || isBooting || !backendValid"
                class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                :class="
                  sdServerRunning || isBooting || !backendValid
                    ? 'text-muted-foreground'
                    : 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                "
                @click="startServer"
              >
                <Play class="h-3 w-3" />
                {{ isBooting ? 'Booting' : 'Start' }}
              </button>
              <button
                type="button"
                :disabled="!sdServerRunning || isBooting"
                class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                :class="
                  sdServerRunning
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                    : 'text-muted-foreground'
                "
                @click="stopServer"
              >
                <Square class="h-3 w-3" />
                Stop
              </button>
            </div>
          </div>

        <Teleport to="body">
          <Transition name="modal">
            <div
              v-if="configPanelVisible"
              class="aui-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-2 backdrop-blur-lg duration-150 dark:bg-black/55 md:p-4"
              @click.self="closeConfigPanel"
            >
              <Transition name="modal-surface" appear>
                <div
                  v-if="configPanelVisible"
                  class="aui-dialog-surface flex h-[min(88vh,760px)] w-[min(64rem,calc(100vw-1rem))] max-w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-2xl shadow-black/15 dark:shadow-black/40 md:w-[min(64rem,calc(100vw-2rem))]"
                  @click.stop
                >
                  <ConfigPanel
                    :collapsed="false"
                    :focus="activeConfigPanel || 'generation'"
                    @close="closeConfigPanel"
                    @expand="activeConfigPanel = 'generation'"
                  />
                </div>
              </Transition>
            </div>
          </Transition>
        </Teleport>

        <Teleport to="body">
          <Transition name="modal">
            <div
              v-if="showSettings"
              class="aui-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm titlebar-no-drag sm:p-5"
              @click.self="closeSettings"
            >
              <Transition name="modal-surface" appear>
                <div
                  v-if="showSettings"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="settings-title"
                  class="aui-dialog-surface relative flex h-[min(82vh,680px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/15 dark:shadow-black/40"
                  @click.stop
                >
                  <button
                    type="button"
                    class="aui-icon-button absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label="Close settings"
                    autofocus
                    @click="closeSettings"
                  >
                    <X class="size-4" />
                  </button>
                  <Settings />
                </div>
              </Transition>
            </div>
          </Transition>
        </Teleport>

          <main
            class="relative flex w-full min-h-0 flex-1 flex-col overflow-hidden"
            :class="showWorkspaceControls ? 'pt-11' : ''"
          >
            <router-view v-slot="{ Component, route }">
              <keep-alive>
                <component :is="Component" :key="route.fullPath" />
              </keep-alive>
            </router-view>
          </main>
        </div>
      </div>

      <MobileNav
        class="md:hidden"
        :current-tab="showSettings ? 'settings' : currentTab"
        @navigate="navigateToTab"
      />
    </div>

    <ToastContainer />

    <FloatingLogPanel v-model="showFloatingLogs" />

    <SetupWizard v-if="isSetupNeeded" @done="completeSetup" @skip="skipForNow" />
  </div>
</template>
