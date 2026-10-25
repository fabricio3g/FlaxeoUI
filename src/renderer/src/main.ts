import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'

// Bundled fonts (fontsource → Vite assets). Do not load from CDN.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

import App from './App.vue'
import './assets/main.css'
import { initializeTheme } from './composables/useTheme'
import { vTip } from './lib/tooltip'

initializeTheme()

import Create from './views/Create.vue'
import Assets from './views/Assets.vue'
import Quantization from './views/Quantization.vue'
import Help from './views/Help.vue'
import Workflows from './views/Workflows.vue'
import Models from './views/Models.vue'
import Settings from './views/Settings.vue'

/** Hash history for Electron and LAN browsers. Old routes redirect to their new home. */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/create' },
    { path: '/create', name: 'Create', component: Create },
    { path: '/workflows', name: 'Workflows', component: Workflows },
    { path: '/assets', name: 'Assets', component: Assets },
    { path: '/models', name: 'Models', component: Models },
    { path: '/settings', name: 'Settings', component: Settings },
    { path: '/quantization', name: 'Quantization', component: Quantization },
    { path: '/help', name: 'Help', component: Help },
    { path: '/home', redirect: '/create' },
    { path: '/text2image', redirect: { path: '/create', query: { mode: 'image' } } },
    { path: '/edit', redirect: { path: '/create', query: { mode: 'edit' } } },
    { path: '/video', redirect: { path: '/create', query: { mode: 'video' } } },
    { path: '/gallery', redirect: '/assets' },
    { path: '/:pathMatch(.*)*', redirect: '/create' }
  ]
})

// Create Vue application
const app = createApp(App)

// Configure plugins
app.use(createPinia()) // State management
app.use(router) // Routing
app.directive('tip', vTip) // v-tip: tooltips with shortcuts on any element

// Mount application
app.mount('#app')
