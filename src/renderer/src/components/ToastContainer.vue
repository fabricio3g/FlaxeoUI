<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { X, CheckCircle, XCircle, AlertTriangle, Info } from '@/lib/icons'

const { toasts, remove } = useToast()

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

const styles = {
  success: 'bg-emerald-500/90 text-white',
  error: 'bg-destructive/90 text-white',
  warning: 'bg-amber-500/90 text-black',
  info: 'bg-blue-500/90 text-white'
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[
            'flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg backdrop-blur-sm',
            styles[toast.type]
          ]"
        >
          <component :is="icons[toast.type]" class="h-5 w-5 shrink-0" />
          <span class="flex-1 text-sm font-medium">{{ toast.message }}</span>
          <button
            type="button"
            @click="remove(toast.id)"
            class="rounded p-0.5 transition-colors hover:bg-white/20 active:scale-95"
          >
            <X class="h-4 w-4" />
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
