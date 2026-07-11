import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

import App from './App.vue'
import './assets/main.css'
import { initializeTheme } from './composables/useTheme'

initializeTheme()

// Import views (will be created)
import Text2Image from './views/Text2Image.vue'
import Edit from './views/Edit.vue'
import Video from './views/Video.vue'
import Gallery from './views/Gallery.vue'
import Quantization from './views/Quantization.vue'

/**
 * Vue Router Configuration
 * Uses hash history for Electron compatibility
 * Routes map to the main application views
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/text2image' },
    { path: '/text2image', name: 'Text2Image', component: Text2Image },
    { path: '/edit', name: 'Edit', component: Edit },
    { path: '/video', name: 'Video', component: Video },
    { path: '/gallery', name: 'Gallery', component: Gallery },
    { path: '/settings', redirect: '/text2image' },
    { path: '/quantization', name: 'Quantization', component: Quantization }
  ]
})

// Create Vue application
const app = createApp(App)

// Configure plugins
app.use(createPinia()) // State management
app.use(router) // Routing

// Mount application
app.mount('#app')
