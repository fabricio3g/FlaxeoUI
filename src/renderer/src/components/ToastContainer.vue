<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-vue-next'

const { toasts, remove } = useToast()

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

const styles = {
  success: 'bg-green-500/90 text-white',
  error: 'bg-red-500/90 text-white',
  warning: 'bg-yellow-500/90 text-black',
  info: 'bg-blue-500/90 text-white'
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[
            'flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm',
            styles[toast.type]
          ]"
        >
          <component :is="icons[toast.type]" class="w-5 h-5 shrink-0" />
          <span class="text-sm font-medium flex-1">{{ toast.message }}</span>
          <button
            @click="remove(toast.id)"
            class="p-0.5 rounded hover:bg-white/20 transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
