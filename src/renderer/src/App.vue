<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Titlebar, { type PanelAnchor } from './components/layout/Titlebar.vue'
import Sidebar from './components/layout/Sidebar.vue'
import MobileNav from './components/layout/MobileNav.vue'
import ToastContainer from './components/ToastContainer.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import FloatingLogPanel from './components/FloatingLogPanel.vue'
import { apiGet, apiPost, initializeApi, isRemoteBrowser } from './services/api'
import { useSetup } from './composables/useSetup'
import SetupWizard from './components/SetupWizard.vue'
import QueuePanel from './components/QueuePanel.vue'
import { useModels } from './composables/useModels'
import { useBackendCapabilities } from './composables/useBackendCapabilities'
import { setRemoteAccessLevel, useRemoteSession } from './composables/useRemoteSession'
import { onOpenLogs } from './lib/appEvents'
import { TOOL_ROUTES } from './lib/tools'
import { useSessionsStore } from './stores/sessions'
import CommandPalette from './components/CommandPalette.vue'
import type { CommandItem } from './lib/commandPalette'
import {
  extractLanPairingCode,
  isLanAccessLevel,
  isLanTransport,
  type LanAccessLevel,
  type LanTransport
} from '../../shared/lan'

const STARTER_PROMPT =
  'Cinematic mountain landscape at dawn, low clouds, atmospheric depth, detailed composition'

const route = useRoute()
const router = useRouter()
const { fetchModels } = useModels()
const { fetchCapabilities } = useBackendCapabilities()
const { isRemote, canViewGallery, canControl } = useRemoteSession()
const { isSetupNeeded, loadState, skipForNow, completeSetup, reopenSetup } = useSetup()

const showFloatingLogs = ref(false)
const showCommandPalette = ref(false)
const showQueuePanel = ref(false)
const SIDEBAR_KEY = 'flaxeo-sidebar-collapsed'
const sidebarCollapsed = ref(readFlag(SIDEBAR_KEY))
const peeking = ref(false)
let peekTimer = 0

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function setSidebarCollapsed(value: boolean): void {
  sidebarCollapsed.value = value
  peeking.value = false
  try {
    localStorage.setItem(SIDEBAR_KEY, String(value))
  } catch {
    /* per-device convenience only */
  }
}

/** Show at once; hide after a short delay so the pointer can travel into the preview. */
function setPeek(show: boolean): void {
  window.clearTimeout(peekTimer)
  if (show) peeking.value = true
  else peekTimer = window.setTimeout(() => (peeking.value = false), 250)
}
/** Phone width: the same sidebar as a drawer (sessions, workflows, settings pages). */
const drawerOpen = ref(false)
const sessionsStore = useSessionsStore()
watch(
  () => [route.fullPath, sessionsStore.activeId],
  () => (drawerOpen.value = false)
)

const queueAnchor = ref<PanelAnchor | null>(null)
const remoteAuthBlocked = ref(isRemote)
const remotePairingCode = ref('')
const REMOTE_NAME_KEY = 'flaxeo-remote-member-name'
const remotePairingName = ref(readStoredRemoteName())

function readStoredRemoteName(): string {
  try {
    return localStorage.getItem(REMOTE_NAME_KEY) || ''
  } catch {
    return ''
  }
}

function rememberRemoteName(): string {
  const name = remotePairingName.value.trim().slice(0, 40)
  try {
    if (name) localStorage.setItem(REMOTE_NAME_KEY, name)
  } catch {
    /* ignore */
  }
  return name
}
const remotePairingError = ref('')
const remotePairingBusy = ref(false)
const remoteTransport = ref<LanTransport>('https')
const remoteOfferedAccess = ref<LanAccessLevel>('generation')

const currentTab = computed(() => {
  const name = route.name as string
  return name?.toLowerCase() || 'create'
})

function onToggleQueue(anchor: PanelAnchor | null): void {
  queueAnchor.value = anchor
  showQueuePanel.value = !showQueuePanel.value
}

function navigateToTab(tab: string): void {
  if (tab === 'assets' && !canViewGallery.value) return
  router.push({ name: TOOL_ROUTES[tab] || tab })
}

function openCommandPalette(): void {
  showCommandPalette.value = true
}

function closeCommandPalette(): void {
  showCommandPalette.value = false
}

function openSettingsCategory(category?: string | null): void {
  void router.push({ name: 'Settings', query: category ? { category } : {} })
}

function runCommand(item: CommandItem): void {
  const { action } = item
  if (action.type === 'tab') {
    navigateToTab(action.tab)
  } else if (action.type === 'settings') {
    openSettingsCategory(action.category ?? null)
  } else if (action.type === 'folder') {
    if (action.which === 'models') window.electronAPI?.openModelsFolder()
    else window.electronAPI?.openGalleryFolder()
  }
  closeCommandPalette()
}

async function handleSkipSetup(): Promise<void> {
  await skipForNow()
}

function queueStarterPrompt(): void {
  void router.push({ name: 'Create', query: { mode: 'image', prompt: STARTER_PROMPT } })
}

function onSetupDone(payload?: { action?: 'sample' | 'hub' | 'done' }): void {
  completeSetup()
  const action = payload?.action || 'done'
  if (action === 'sample') {
    queueStarterPrompt()
    return
  }
  if (action === 'hub') {
    router.push({ name: 'Models' })
    return
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  // Command palette: Ctrl/Cmd+K
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (showCommandPalette.value) closeCommandPalette()
    else openCommandPalette()
    return
  }
  // Sidebar: Ctrl/Cmd + backslash
  if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
    event.preventDefault()
    setSidebarCollapsed(!sidebarCollapsed.value)
    return
  }
  if (event.key !== 'Escape') return
  if (showCommandPalette.value) closeCommandPalette()
  else if (showQueuePanel.value) showQueuePanel.value = false
}

let unsubscribeOpenLogs: (() => void) | null = null
let remoteAuthTimer: number | null = null

function requireRemotePairing(): void {
  if (!isRemoteBrowser()) return
  setRemoteAccessLevel(null)
  remoteAuthBlocked.value = true
  remotePairingError.value = 'This device session was revoked or expired. Pair again to continue.'
}

function redirectUnauthorizedRemoteRoute(): void {
  if (!isRemote || remoteAuthBlocked.value) return
  if (
    ['Quantization', 'Models', 'Settings'].includes(route.name as string) ||
    (route.name === 'Assets' && !canViewGallery.value)
  ) {
    void router.replace('/create')
  }
}

watch(() => route.name, redirectUnauthorizedRemoteRoute)

async function pairRemoteBrowser(code: string): Promise<void> {
  try {
    remotePairingBusy.value = true
    remotePairingError.value = ''
    await apiPost('/api/auth/pair', { code: code.trim(), name: rememberRemoteName() })
    // Cookie is set; reload so session state and routes initialize cleanly.
    location.hash = '#/create'
    location.reload()
  } catch (error) {
    remotePairingError.value = error instanceof Error ? error.message : 'Pairing failed.'
  } finally {
    remotePairingBusy.value = false
  }
}

async function ensureRemoteAuthentication(): Promise<boolean> {
  if (!isRemoteBrowser()) return true
  const pairingCode = extractLanPairingCode(location)
  let pairedFromFragment = false
  if (pairingCode) {
    try {
      await apiPost('/api/auth/pair', { code: pairingCode, name: rememberRemoteName() })
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
      // Drop the one-time pair query while keeping a real hash route.
      if (pairedFromFragment || extractLanPairingCode(location)) {
        await router.replace({ path: '/create', query: {} })
      } else {
        redirectUnauthorizedRemoteRoute()
      }
      remoteAuthBlocked.value = false
      return true
    }
  } catch {
    // Show the pairing screen below.
  }
  // Failed pair from QR: leave a clean route so the form is usable.
  if (pairingCode) {
    await router.replace({ path: '/create', query: {} }).catch(() => undefined)
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
  } catch {
    /* ignore */
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
  unsubscribeOpenLogs = onOpenLogs(() => {
    if (canControl.value) showFloatingLogs.value = true
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  unsubscribeOpenLogs?.()
  unsubscribeOpenLogs = null
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
          v-model="remotePairingName"
          autocomplete="nickname"
          maxlength="40"
          placeholder="Your name (shown to the team)"
          aria-label="Your name"
          class="mt-5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <input
          v-model="remotePairingCode"
          required
          autocomplete="one-time-code"
          spellcheck="false"
          placeholder="Pairing code"
          class="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
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
        v-if="!sidebarCollapsed"
        class="hidden md:flex"
        :current-tab="currentTab"
        @navigate="navigateToTab"
        @toggle="setSidebarCollapsed(true)"
      />

      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col md:py-2 md:pr-2"
        :class="sidebarCollapsed && 'md:pl-2'"
      >
        <div
          class="aui-workspace-surface relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:rounded-xl md:border md:border-border"
        >
          <Titlebar
            :setup-needed="isSetupNeeded"
            :queue-open="showQueuePanel"
            :sidebar-collapsed="sidebarCollapsed"
            @expand-sidebar="setSidebarCollapsed(false)"
            @open-drawer="drawerOpen = true"
            @peek="setPeek"
            @toggle-logs="showFloatingLogs = !showFloatingLogs"
            @open-setup="reopenSetup"
            @open-engine="openSettingsCategory('engine')"
            @toggle-queue="onToggleQueue"
          />

          <main class="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <router-view v-slot="{ Component, route: viewRoute }">
              <keep-alive :include="['Create', 'Workflows']">
                <component :is="Component" :key="viewRoute.name" />
              </keep-alive>
            </router-view>
          </main>
        </div>

        <MobileNav class="md:hidden" :current-tab="currentTab" @navigate="navigateToTab" />
      </div>

      <!-- Collapsed: hovering the show-sidebar button previews it without moving the page -->
      <Transition
        enter-from-class="-translate-x-3 opacity-0"
        leave-to-class="-translate-x-3 opacity-0"
        enter-active-class="transition duration-150 ease-out"
        leave-active-class="transition duration-100 ease-in"
      >
        <div
          v-if="sidebarCollapsed && peeking"
          class="fixed bottom-2 left-2 top-[3.75rem] z-40 hidden titlebar-no-drag md:block"
          @pointerenter="setPeek(true)"
          @pointerleave="setPeek(false)"
        >
          <Sidebar floating :current-tab="currentTab" @navigate="navigateToTab" />
        </div>
      </Transition>

      <!-- Phone width: the sidebar as a drawer -->
      <Transition
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
        enter-active-class="transition-opacity duration-150"
        leave-active-class="transition-opacity duration-100"
      >
        <div
          v-if="drawerOpen"
          class="fixed inset-0 z-50 bg-black/50 md:hidden"
          aria-hidden="true"
          @click="drawerOpen = false"
        />
      </Transition>
      <Transition
        enter-from-class="-translate-x-full"
        leave-to-class="-translate-x-full"
        enter-active-class="transition-transform duration-200 ease-out"
        leave-active-class="transition-transform duration-150 ease-in"
      >
        <div
          v-if="drawerOpen"
          class="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] p-2 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          @keydown.esc="drawerOpen = false"
        >
          <Sidebar
            floating
            closable
            class="w-full"
            :current-tab="currentTab"
            @navigate="navigateToTab"
            @toggle="drawerOpen = false"
          />
        </div>
      </Transition>

      <CommandPalette
        :open="showCommandPalette"
        @close="closeCommandPalette"
        @select="runCommand"
      />
      <ToastContainer />
      <ConfirmDialog />
      <FloatingLogPanel v-if="canControl" v-model="showFloatingLogs" />
      <SetupWizard v-if="isSetupNeeded" @done="onSetupDone" @skip="handleSkipSetup" />
      <QueuePanel
        :open="showQueuePanel"
        :anchor="queueAnchor || undefined"
        @close="showQueuePanel = false"
      />
    </template>
  </div>
</template>
