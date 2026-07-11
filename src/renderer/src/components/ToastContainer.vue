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
  success: 'border-l-emerald-500',
  error: 'border-l-destructive',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500'
}

const iconStyles = {
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  error: 'bg-destructive/10 text-destructive',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  info: 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
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
          :class="[
            'aui-alert pointer-events-auto flex items-start gap-3 rounded-xl border border-border/80 border-l-2 bg-popover/95 p-3 text-popover-foreground shadow-lg shadow-foreground/10 backdrop-blur-md',
            styles[toast.type]
          ]"
        >
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-lg"
            :class="iconStyles[toast.type]"
          >
            <component :is="icons[toast.type]" class="h-4 w-4" />
          </span>
          <span class="min-w-0 flex-1 pt-1 text-sm leading-5">{{ toast.message }}</span>
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
