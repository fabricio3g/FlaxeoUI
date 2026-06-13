<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Titlebar from './components/layout/Titlebar.vue'
import ConfigPanel from './components/layout/ConfigPanel.vue'
import MobileNav from './components/layout/MobileNav.vue'
import ToastContainer from './components/ToastContainer.vue'
import FloatingLogPanel from './components/FloatingLogPanel.vue'
import { initializeApi } from './services/api'
import { routeMotion } from './lib/motion'

const route = useRoute()
const router = useRouter()

// State
const showMobileConfig = ref(false)
const sidebarCollapsed = ref(false)
const showFloatingLogs = ref(false)
const isElectron = ref(false)
const serverPort = ref<number>(3000)

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
  settings: 'Settings',
  quantization: 'Quantization'
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
  isElectron.value = !!window.electronAPI

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
  <div class="flex flex-col h-screen text-foreground overflow-hidden select-none window-border">
    <!-- Custom Titlebar for Electron Only -->
    <Titlebar
      :current-tab="currentTab"
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      @toggle-mobile-config="showMobileConfig = !showMobileConfig"
      @toggle-logs="showFloatingLogs = !showFloatingLogs"
    />

    <!-- Main Content Area -->
    <div class="flex flex-1 min-h-0 overflow-hidden relative gap-2 p-0">
      <!-- Config Panel (detailed settings) -->
      <ConfigPanel
        :collapsed="sidebarCollapsed"
        class="shrink-0 transition-[width] duration-300 ease-out"
        :class="[
          sidebarCollapsed
            ? 'md:flex md:w-11 md:relative md:translate-x-0'
            : 'md:flex md:w-[260px] md:relative md:translate-x-0',
          showMobileConfig
            ? 'fixed inset-0 z-50 w-full translate-x-0 flex md:absolute'
            : 'hidden md:flex'
        ]"
        @close="showMobileConfig = false"
        @expand="sidebarCollapsed = false"
      />

      <!-- Main Content -->
      <main
        class="main-panel flex-1 min-h-0 overflow-hidden flex flex-col relative w-full m-2 ml-0"
      >
        <router-view v-slot="{ Component }">
          <transition
            name="fade"
            mode="out-in"
            enter-active-class="transition-opacity duration-150"
            leave-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <keep-alive>
              <component
                :is="Component"
                v-motion
                :initial="routeMotion.initial"
                :enter="routeMotion.enter"
                :leave="routeMotion.leave"
              />
            </keep-alive>
          </transition>
        </router-view>
      </main>
    </div>

    <!-- Mobile Bottom Nav -->
    <MobileNav class="md:hidden" :current-tab="currentTab" @navigate="navigateToTab" />

    <!-- Toast Notifications -->
    <ToastContainer />

    <!-- Floating Log Panel -->
    <FloatingLogPanel v-model="showFloatingLogs" />
  </div>
</template>
