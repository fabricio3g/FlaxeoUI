<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { History, Play, SlidersHorizontal, Square, X } from '@/lib/icons'
import Titlebar from './components/layout/Titlebar.vue'
import Sidebar from './components/layout/Sidebar.vue'
import ConfigPanel from './components/layout/ConfigPanel.vue'
import MobileNav from './components/layout/MobileNav.vue'
import ToastContainer from './components/ToastContainer.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import FloatingLogPanel from './components/FloatingLogPanel.vue'
import { apiGet, apiPost, initializeApi, isRemoteBrowser } from './services/api'
import { useSetup, STRIP_DISMISS_KEY } from './composables/useSetup'
import SetupWizard from './components/SetupWizard.vue'
import OnboardingStrip from './components/OnboardingStrip.vue'
import QueuePanel from './components/QueuePanel.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import { useJobQueue } from './composables/useJobQueue'
import { useGenerationHistory } from './composables/useGenerationHistory'
import { useConfigStore } from './stores/config'
import SegmentedControl from './components/ui/SegmentedControl.vue'
import Select from './components/ui/Select.vue'
import { useRuntimeStatus } from './composables/useRuntimeStatus'
import { useServerControls } from './composables/useServerControls'
import { useModels } from './composables/useModels'
import { useBackendCapabilities } from './composables/useBackendCapabilities'
import { setRemoteAccessLevel, useRemoteSession } from './composables/useRemoteSession'
import { onOpenLogs, onOpenHistory, requestStarterPrompt } from './lib/appEvents'
import Settings from './views/Settings.vue'
import {
  isLanAccessLevel,
  isLanTransport,
  type LanAccessLevel,
  type LanTransport
} from '../../shared/lan'

const STARTER_PROMPT =
  'Cinematic mountain landscape at dawn, low clouds, atmospheric depth, detailed composition'

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { sdServerRunning, backendValid, fetchRuntimeStatus } = useRuntimeStatus()
const { isBooting, startServer, stopServer } = useServerControls(config, fetchRuntimeStatus)
const { models, error: modelsError, fetchModels } = useModels()
const { fetchCapabilities } = useBackendCapabilities()
const { isRemote, canViewGallery, canControl } = useRemoteSession()
const {
  isSetupNeeded,
  checklistComplete,
  skipped,
  loadState,
  skipForNow,
  completeSetup,
  reopenSetup
} = useSetup()

const showMobileConfig = ref(false)
type WorkspaceConfigPanel = 'model' | 'generation' | 'lora' | 'embedding'
const activeConfigPanel = ref<WorkspaceConfigPanel | null>(null)
const showFloatingLogs = ref(false)
const showSettings = ref(false)
const sidebarCollapsed = ref(localStorage.getItem('flaxeo-sidebar-collapsed') === 'true')
const stripDismissed = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(STRIP_DISMISS_KEY) === '1'
)
const showQueuePanel = ref(false)
const showHistoryPanel = ref(false)
const remoteAuthBlocked = ref(isRemote)
const remotePairingCode = ref('')
const remotePairingError = ref('')
const remotePairingBusy = ref(false)
const remoteTransport = ref<LanTransport>('https')
const remoteOfferedAccess = ref<LanAccessLevel>('generation')
const queueBtnRef = ref<HTMLElement | null>(null)
const historyBtnRef = ref<HTMLElement | null>(null)
const queueAnchor = ref<{
  top: number
  left: number
  right: number
  bottom: number
  width: number
} | null>(null)
const historyAnchor = ref<{
  top: number
  left: number
  right: number
  bottom: number
  width: number
} | null>(null)
const { pendingCount, current: currentJob } = useJobQueue()
const { entries: historyEntries } = useGenerationHistory()

/** Optional tip bar — never after skip, permanent dismiss, only while checklist incomplete */
const showOnboardingStrip = computed(
  () =>
    !isRemote &&
    !isSetupNeeded.value &&
    !skipped.value &&
    !checklistComplete.value &&
    !stripDismissed.value
)

const queueBadge = computed(() => {
  const n = pendingCount.value + (currentJob.value ? 1 : 0)
  return n
})

const historyCount = computed(() => historyEntries.value.length)

function rectFromEl(el: HTMLElement | null) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width
  }
}

function updateQueueAnchor(): void {
  queueAnchor.value = rectFromEl(queueBtnRef.value)
}

function updateHistoryAnchor(): void {
  historyAnchor.value = rectFromEl(historyBtnRef.value)
}

function toggleQueuePanel(): void {
  if (!showQueuePanel.value) {
    showHistoryPanel.value = false
    updateQueueAnchor()
    showQueuePanel.value = true
  } else {
    showQueuePanel.value = false
  }
}

function toggleHistoryPanel(): void {
  if (!showHistoryPanel.value) {
    showQueuePanel.value = false
    updateHistoryAnchor()
    showHistoryPanel.value = true
  } else {
    showHistoryPanel.value = false
  }
}

function openHistoryPanel(): void {
  showQueuePanel.value = false
  updateHistoryAnchor()
  // Fallback anchor if button not in DOM (e.g. Gallery page)
  if (!historyAnchor.value && typeof window !== 'undefined') {
    historyAnchor.value = {
      top: 48,
      left: 16,
      right: 120,
      bottom: 80,
      width: 100
    }
  }
  showHistoryPanel.value = true
}

function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('flaxeo-sidebar-collapsed', String(sidebarCollapsed.value))
}

const activeModelValue = computed(() =>
  config.value.loadMode === 'standard' ? config.value.standardModel : config.value.diffusionModel
)
const modelOptions = computed(() => [
  {
    label: modelsError.value
      ? 'Models unavailable'
      : models.value.diffusion.length
        ? 'No model'
        : 'No diffusion models on host',
    value: ''
  },
  ...models.value.diffusion.map((model) => ({
    label: model.split(/[\\/]/).pop() || model,
    value: model
  }))
])
const backendModeOptions = [
  { value: 'cli', label: 'CLI' },
  { value: 'server', label: 'Server' }
]

const serverModeHint = computed(() => {
  if (config.value.backendMode !== 'server') return ''
  if (!sdServerRunning.value) return 'Server offline — start it to use warm multi-gen'
  return 'Server: core T2I only (warm). Edit, video, batch, and uploads use CLI.'
})

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
  quantization: 'Quantization',
  help: 'Help'
}

function navigateToTab(tab: string): void {
  if (tab === 'gallery' && !canViewGallery.value) return
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
  if (value === 'cli' || value === 'server') {
    configStore.updateConfig({ backendMode: value })
    if (value === 'server' && !sdServerRunning.value) {
      // Nudge user — server must be running for warm path
      console.info('[Flaxeo] Server mode selected. Start the sd-server process for warm multi-gen.')
    }
  }
}

function dismissOnboardingStrip(): void {
  stripDismissed.value = true
  try {
    localStorage.setItem(STRIP_DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

async function handleSkipSetup(): Promise<void> {
  await skipForNow()
  stripDismissed.value = true
}

function queueStarterPrompt(): void {
  try {
    sessionStorage.setItem('text2imagePrompt', STARTER_PROMPT)
    sessionStorage.setItem('flaxeo-onboarding-sample', '1')
  } catch {
    /* ignore */
  }
  // keep-alive Text2Image may already be mounted — fire event so prompt applies now
  requestStarterPrompt({ prompt: STARTER_PROMPT, fromOnboarding: true })
  showSettings.value = false
  closeConfigPanel()
  router.push({ name: 'Text2Image' })
}

function onSetupDone(payload?: { action?: 'sample' | 'hub' | 'done' }): void {
  completeSetup()
  const action = payload?.action || 'done'
  if (action === 'sample') {
    queueStarterPrompt()
    return
  }
  if (action === 'hub') {
    sessionStorage.setItem('flaxeo-open-model-hub', '1')
    openConfigPanel('model')
    return
  }
}

function onStripFixBackend(): void {
  reopenSetup()
}

function onStripFixModels(): void {
  sessionStorage.setItem('flaxeo-open-model-hub', '1')
  openConfigPanel('model')
}

function onStripFirstImage(): void {
  queueStarterPrompt()
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showHistoryPanel.value) showHistoryPanel.value = false
  else if (showQueuePanel.value) showQueuePanel.value = false
  else if (showSettings.value) closeSettings()
  else if (configPanelVisible.value) closeConfigPanel()
}

function onWindowResize(): void {
  updateQueueAnchor()
  updateHistoryAnchor()
}

let unsubscribeOpenLogs: (() => void) | null = null
let unsubscribeOpenHistory: (() => void) | null = null
let remoteAuthTimer: number | null = null

function requireRemotePairing(): void {
  if (!isRemoteBrowser()) return
  setRemoteAccessLevel(null)
  remoteAuthBlocked.value = true
  remotePairingError.value = 'This device session was revoked or expired. Pair again to continue.'
}

function redirectUnauthorizedRemoteRoute(): void {
  if (!isRemote || remoteAuthBlocked.value) return
  if (route.name === 'Quantization' || (route.name === 'Gallery' && !canViewGallery.value)) {
    void router.replace('/text2image')
  }
}

watch(() => route.name, redirectUnauthorizedRemoteRoute)

async function pairRemoteBrowser(code: string): Promise<void> {
  try {
    remotePairingBusy.value = true
    remotePairingError.value = ''
    await apiPost('/api/auth/pair', { code: code.trim() })
    history.replaceState(null, '', `${location.pathname}${location.search}`)
    location.reload()
  } catch (error) {
    remotePairingError.value = error instanceof Error ? error.message : 'Pairing failed.'
  } finally {
    remotePairingBusy.value = false
  }
}

async function ensureRemoteAuthentication(): Promise<boolean> {
  if (!isRemoteBrowser()) return true
  const fragment = new URLSearchParams(location.hash.slice(1))
  const pairingCode = fragment.get('pair')
  let pairedFromFragment = false
  if (pairingCode) {
    history.replaceState(null, '', `${location.pathname}${location.search}`)
    try {
      await apiPost('/api/auth/pair', { code: pairingCode })
      pairedFromFragment = true
    } catch (error) {
      remotePairingError.value = error instanceof Error ? error.message : 'Pairing failed.'
    }
  }
  try {
    const status = await apiGet<{
      paired: boolean
      accessLevel?: unknown
      transport?: unknown
    }>('/api/auth/status')
    remoteTransport.value = isLanTransport(status.transport) ? status.transport : 'https'
    remoteOfferedAccess.value = isLanAccessLevel(status.accessLevel)
      ? status.accessLevel
      : 'generation'
    if (status.paired) {
      setRemoteAccessLevel(remoteOfferedAccess.value)
      if (pairedFromFragment) await router.replace('/text2image')
      if (route.name === 'Quantization' || (route.name === 'Gallery' && !canViewGallery.value)) {
        await router.replace('/text2image')
      }
      remoteAuthBlocked.value = false
      return true
    }
  } catch {
    // Show the pairing screen below.
  }
  remoteAuthBlocked.value = true
  setRemoteAccessLevel(null)
  return false
}

onMounted(async () => {
  try {
    const state = await window.electronAPI?.getInitState()
    if (state?.port) {
      initializeApi(state.port, state.desktopApiToken)
    }
  } catch (e) {
    console.log('Running outside Electron or getInitState not available')
  }

  if (!(await ensureRemoteAuthentication())) return

  if (isRemoteBrowser()) {
    window.addEventListener('flaxeo-auth-required', requireRemotePairing)
    remoteAuthTimer = window.setInterval(async () => {
      try {
        const status = await apiGet<{ paired: boolean }>('/api/auth/status')
        if (!status.paired) requireRemotePairing()
      } catch {
        requireRemotePairing()
      }
    }, 5000)
  }

  await loadState()
  await fetchModels()
  fetchCapabilities().catch(() => undefined)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('resize', onWindowResize)
  unsubscribeOpenLogs = onOpenLogs(() => {
    if (canControl.value) showFloatingLogs.value = true
  })
  unsubscribeOpenHistory = onOpenHistory(() => {
    openHistoryPanel()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', onWindowResize)
  unsubscribeOpenLogs?.()
  unsubscribeOpenLogs = null
  unsubscribeOpenHistory?.()
  unsubscribeOpenHistory = null
  window.removeEventListener('flaxeo-auth-required', requireRemotePairing)
  if (remoteAuthTimer !== null) window.clearInterval(remoteAuthTimer)
})
</script>

<template>
  <div
    class="isolate flex h-screen w-screen flex-row overflow-hidden bg-background text-foreground antialiased"
  >
    <div
      v-if="remoteAuthBlocked && isRemote"
      class="flex size-full items-center justify-center p-6"
    >
      <form
        class="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
        @submit.prevent="pairRemoteBrowser(remotePairingCode)"
      >
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {{ remoteTransport === 'https' ? 'Secure LAN' : 'Quick LAN' }}
        </p>
        <h1 class="mt-2 text-xl font-semibold">Pair with Flaxeo</h1>
        <p class="mt-2 text-sm leading-5 text-muted-foreground">
          Scan the QR code shown in desktop Settings, or enter its one-time pairing code.
        </p>
        <p class="mt-2 text-xs leading-5 text-muted-foreground">
          This session grants {{ remoteOfferedAccess }} access.
          <span v-if="remoteTransport === 'http'">
            Quick LAN traffic is not encrypted; use it only on a trusted home network.
          </span>
        </p>
        <input
          v-model="remotePairingCode"
          required
          autocomplete="one-time-code"
          spellcheck="false"
          placeholder="Pairing code"
          class="mt-5 h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <p v-if="remotePairingError" class="mt-3 text-xs text-destructive">
          {{ remotePairingError }}
        </p>
        <button
          type="submit"
          :disabled="remotePairingBusy || !remotePairingCode.trim()"
          class="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {{ remotePairingBusy ? 'Pairing...' : 'Pair device' }}
        </button>
      </form>
    </div>

    <template v-else>
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

        <OnboardingStrip
          v-if="showOnboardingStrip"
          @dismiss="dismissOnboardingStrip"
          @fix-backend="onStripFixBackend"
          @fix-models="onStripFixModels"
          @first-image="onStripFirstImage"
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
              <span
                v-if="modelsError"
                class="max-w-[12rem] truncate text-[10px] text-destructive"
                :title="modelsError"
              >
                {{ modelsError }}
              </span>
              <span
                v-if="serverModeHint"
                class="hidden max-w-[14rem] truncate text-[10px] text-muted-foreground lg:inline"
                :title="serverModeHint"
              >
                {{ sdServerRunning ? 'Warm T2I' : 'Server offline' }}
              </span>
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
                ref="queueBtnRef"
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
                :class="showQueuePanel || queueBadge ? 'bg-accent/80 text-foreground' : ''"
                :aria-expanded="showQueuePanel"
                title="Job queue"
                @click="toggleQueuePanel"
              >
                <span>Queue</span>
                <span
                  v-if="queueBadge"
                  class="inline-flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background"
                >
                  {{ queueBadge }}
                </span>
              </button>
              <button
                ref="historyBtnRef"
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
                :class="showHistoryPanel || historyCount ? 'bg-accent/80 text-foreground' : ''"
                :aria-expanded="showHistoryPanel"
                title="Generation history"
                @click="toggleHistoryPanel"
              >
                <History class="h-3.5 w-3.5" />
                <span>History</span>
                <span
                  v-if="historyCount"
                  class="inline-flex min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground"
                >
                  {{ historyCount > 99 ? '99+' : historyCount }}
                </span>
              </button>
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
                :class="
                  activeConfigPanel === 'lora' || config.loras.length ? 'text-foreground' : ''
                "
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
                :class="
                  activeConfigPanel === 'embedding' || config.embeddings.length
                    ? 'text-foreground'
                    : ''
                "
                :aria-expanded="activeConfigPanel === 'embedding'"
                @click="openConfigPanel('embedding')"
              >
                <span>Embedding</span>
                <span v-if="config.embeddings.length" class="font-mono text-[10px]">
                  {{ config.embeddings.length }}
                </span>
              </button>
              <div
                v-if="config.backendMode === 'server' && canControl"
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
      <ConfirmDialog />

      <FloatingLogPanel v-if="canControl" v-model="showFloatingLogs" />

      <SetupWizard v-if="isSetupNeeded" @done="onSetupDone" @skip="handleSkipSetup" />
      <QueuePanel
        :open="showQueuePanel"
        :anchor="queueAnchor || undefined"
        @close="showQueuePanel = false"
      />
      <HistoryPanel
        :open="showHistoryPanel"
        :anchor="historyAnchor || undefined"
        @close="showHistoryPanel = false"
      />
    </template>
  </div>
</template>
