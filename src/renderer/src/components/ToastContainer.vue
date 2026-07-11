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

const iconStyles = {
  success: 'text-foreground',
  error: 'text-foreground',
  warning: 'text-foreground',
  info: 'text-foreground'
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-3 bottom-3 z-[250] flex flex-col gap-2 sm:left-auto sm:right-4 sm:bottom-4 sm:w-full sm:max-w-sm"
    >
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :role="toast.type === 'error' ? 'alert' : 'status'"
          class="aui-alert pointer-events-auto flex items-start gap-3 rounded-2xl bg-background/90 p-3 text-foreground shadow-[0_2px_4px_rgb(0_0_0/0.06),0_16px_44px_rgb(0_0_0/0.14)] backdrop-blur-xl"
        >
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/60"
            :class="iconStyles[toast.type]"
          >
            <component :is="icons[toast.type]" class="h-4 w-4" />
          </span>
          <div class="min-w-0 flex-1 pt-1">
            <span class="text-sm leading-5">{{ toast.message }}</span>
            <button
              v-if="toast.action"
              type="button"
              class="mt-1.5 block text-xs font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
              @click="
                () => {
                  toast.action?.onClick()
                  remove(toast.id)
                }
              "
            >
              {{ toast.action.label }}
            </button>
          </div>
          <button
            type="button"
            class="aui-icon-button inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Dismiss notification"
            @click="remove(toast.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.toast-move {
  transition: transform 180ms ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(12px) scale(0.98);
}
</style>
