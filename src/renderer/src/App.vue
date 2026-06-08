<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Titlebar from './components/layout/Titlebar.vue'
import ConfigPanel from './components/layout/ConfigPanel.vue'
import MobileNav from './components/layout/MobileNav.vue'
import ToastContainer from './components/ToastContainer.vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import { initializeApi } from './services/api'

const route = useRoute()
const router = useRouter()

// State
const showMobileConfig = ref(false)
const sidebarCollapsed = ref(false)
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
  <div class="flex flex-col h-screen bg-background text-foreground overflow-hidden select-none">
    <!-- Custom Titlebar for Electron Only -->
    <Titlebar
      :current-tab="currentTab"
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
    />

    <!-- Mobile Header -->
    <div
      class="md:hidden h-14 border-b border-border/70 flex items-center justify-between px-4 bg-card/90 backdrop-blur-xl shrink-0 z-30"
    >
      <span
        class="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-700 to-cyan-600 bg-clip-text text-transparent"
        >FlaxeoUI</span
      >

      <button
        @click="showMobileConfig = !showMobileConfig"
        class="p-2 rounded-lg hover:bg-muted transition-colors"
        :class="showMobileConfig ? 'bg-muted text-foreground' : 'text-muted-foreground'"
      >
        <SlidersHorizontal class="w-5 h-5" />
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="flex flex-1 overflow-hidden relative md:p-0">
      <!-- Config Panel (detailed settings) -->
      <ConfigPanel
        :collapsed="sidebarCollapsed"
        class="shrink-0 transition-[width] duration-200 ease-out bg-card md:mt-3 md:mb-3 md:ml-3 md:rounded-sm"
        :class="[
          sidebarCollapsed ? 'md:flex md:w-12 md:relative md:translate-x-0' : 'md:flex md:w-80 md:relative md:translate-x-0',
          showMobileConfig ? 'absolute inset-0 z-50 w-full translate-x-0 flex' : 'hidden md:flex'
        ]"
        @close="showMobileConfig = false"
      />

      <!-- Main Content -->
      <main class="flex-1 overflow-hidden flex flex-col relative w-full m-2 md:m-3 bg-card rounded-2xl">
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
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </main>
    </div>

    <!-- Mobile Bottom Nav -->
    <MobileNav class="md:hidden" :current-tab="currentTab" @navigate="navigateToTab" />

    <!-- Toast Notifications -->
    <ToastContainer />
  </div>
</template>
