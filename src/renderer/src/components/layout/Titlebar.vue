<script setup lang="ts">
import { Minus, Square, X } from 'lucide-vue-next'

/**
 * handleMinimize() - Minimizes the electron window
 * Calls the electronAPI exposed via preload script
 */
function handleMinimize(): void {
  window.electronAPI?.minimize()
}

/**
 * handleMaximize() - Toggles maximize/restore window state
 */
function handleMaximize(): void {
  window.electronAPI?.maximize()
}

/**
 * handleClose() - Closes the electron window
 */
function handleClose(): void {
  window.electronAPI?.close()
}
</script>

<template>
  <header class="h-8 flex items-center justify-between bg-background border-b border-border titlebar-drag select-none">
    <!-- App Title -->
    <div class="flex items-center gap-2 px-3">
      <span class="text-sm font-medium text-foreground">FlaxeoUI</span>
    </div>
    
    <!-- Window Controls -->
    <div class="flex titlebar-no-drag">
      <button 
        @click="handleMinimize"
        class="h-8 w-11 flex items-center justify-center hover:bg-muted transition-colors"
        title="Minimize"
      >
        <Minus class="w-4 h-4 text-muted-foreground" />
      </button>
      
      <button 
        @click="handleMaximize"
        class="h-8 w-11 flex items-center justify-center hover:bg-muted transition-colors"
        title="Maximize"
      >
        <Square class="w-3 h-3 text-muted-foreground" />
      </button>
      
      <button 
        @click="handleClose"
        class="h-8 w-11 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
        title="Close"
      >
        <X class="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  </header>
</template>
