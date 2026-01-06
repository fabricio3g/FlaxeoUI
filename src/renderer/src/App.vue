<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Titlebar from './components/layout/Titlebar.vue'
import Sidebar from './components/layout/Sidebar.vue'
import ConfigPanel from './components/layout/ConfigPanel.vue'
import MobileNav from './components/layout/MobileNav.vue'
import ToastContainer from './components/ToastContainer.vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import { initializeApi } from './services/api'

const router = useRouter()
const route = useRoute()

// State
const serverPort = ref(3000)
const showMobileConfig = ref(false)
const isElectron = ref(false)

/**
 * currentTab - Computed property tracking the active route
 */
const currentTab = computed(() => {
  const name = route.name as string
  return name?.toLowerCase() || 'text2image'
})

/**
 * Route name mapping - maps lowercase tab IDs to actual route names
 */
const routeMap: Record<string, string> = {
  text2image: 'Text2Image',
  edit: 'Edit',
  video: 'Video',
  gallery: 'Gallery',
  settings: 'Settings'
}

/**
 * navigateToTab() - Handles navigation between main application views
 */
function navigateToTab(tab: string): void {
  const routeName = routeMap[tab] || tab
  router.push({ name: routeName })
}

onMounted(async () => {
  // Check format
  isElectron.value = !!(window as any).electronAPI

  // Get server port from Electron and initialize API
  try {
    const state = await window.electronAPI?.getInitState()
    if (state?.port) {
      serverPort.value = state.port
      initializeApi(state.port)
    }
  } catch (e) {
    console.log('Running outside Electron or getInitState not available')
  }
})
</script>

<template>
  <div class="flex flex-col h-screen bg-background text-foreground overflow-hidden">
    <!-- Custom Titlebar for Electron Only -->
    <Titlebar v-if="isElectron" />

    <!-- Mobile Header -->
    <div
      class="md:hidden h-14 border-b border-border flex items-center justify-between px-4 bg-card shrink-0 z-30"
    >
      <span
        class="font-bold text-lg bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent"
        >FlaxeoUI</span
      >

      <button
        @click="showMobileConfig = !showMobileConfig"
        class="p-2 rounded-md hover:bg-muted transition-colors"
        :class="showMobileConfig ? 'bg-muted text-foreground' : 'text-muted-foreground'"
      >
        <SlidersHorizontal class="w-5 h-5" />
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="flex flex-1 overflow-hidden relative">
      <!-- Sidebar Navigation (icons only) -->
      <Sidebar class="hidden md:flex" :current-tab="currentTab" @navigate="navigateToTab" />

      <!-- Config Panel (detailed settings) -->
      <ConfigPanel
        class="transition-transform duration-300 ease-in-out bg-card"
        :class="[
          'md:flex md:w-80 md:relative md:translate-x-0',
          showMobileConfig ? 'absolute inset-0 z-50 w-full translate-x-0 flex' : 'hidden md:flex'
        ]"
        @close="showMobileConfig = false"
      />

      <!-- Main Content -->
      <main class="flex-1 overflow-hidden flex flex-col relative w-full">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <transition
              name="fade"
              mode="out-in"
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <component :is="Component" />
            </transition>
          </keep-alive>
        </router-view>
      </main>
    </div>

    <!-- Mobile Bottom Nav -->
    <MobileNav class="md:hidden" :current-tab="currentTab" @navigate="navigateToTab" />

    <!-- Toast Notifications -->
    <ToastContainer />
  </div>
</template>
