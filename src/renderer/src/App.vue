<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Titlebar from './components/layout/Titlebar.vue'
import Sidebar from './components/layout/Sidebar.vue'
import ConfigPanel from './components/layout/ConfigPanel.vue'
import ToastContainer from './components/ToastContainer.vue'

const router = useRouter()
const route = useRoute()

// Server port from Electron
const serverPort = ref(3000)

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
  // Get server port from Electron
  try {
    const state = await window.electronAPI?.getInitState()
    if (state?.port) {
      serverPort.value = state.port
    }
  } catch (e) {
    console.log('Running outside Electron or getInitState not available')
  }
})
</script>

<template>
  <div class="flex flex-col h-screen bg-background text-foreground overflow-hidden">
    <!-- Custom Titlebar for Electron -->
    <Titlebar />
    
    <!-- Main Content Area -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar Navigation (icons only) -->
      <Sidebar 
        :current-tab="currentTab" 
        @navigate="navigateToTab" 
      />
      
      <!-- Config Panel (detailed settings) -->
      <ConfigPanel />
      
      <!-- Main Content -->
      <main class="flex-1 overflow-hidden flex flex-col">
        <router-view v-slot="{ Component }">
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
        </router-view>
      </main>
    </div>
    
    <!-- Toast Notifications -->
    <ToastContainer />
  </div>
</template>
