import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { MotionPlugin } from '@vueuse/motion'

import App from './App.vue'
import './assets/main.css'

// Import views (will be created)
import Text2Image from './views/Text2Image.vue'
import Edit from './views/Edit.vue'
import Video from './views/Video.vue'
import Gallery from './views/Gallery.vue'
import Settings from './views/Settings.vue'

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
        { path: '/settings', name: 'Settings', component: Settings }
    ]
})

// Create Vue application
const app = createApp(App)

// Configure plugins
app.use(createPinia())   // State management
app.use(router)           // Routing
app.use(MotionPlugin)     // Animations from @vueuse/motion

// Mount application
app.mount('#app')
