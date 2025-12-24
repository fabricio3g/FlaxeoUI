<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { X, Info, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  src: string
  filename: string
  alt?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'prev'): void
  (e: 'next'): void
}>()

const toast = useToast()
const showInfo = ref(false)
const metadata = ref<any>(null)
const isLoading = ref(false)
const isCopied = ref(false)

async function fetchMetadata() {
  if (!props.filename) return
  isLoading.value = true
  metadata.value = null
  
  try {
    // Attempt to fetch params from headers or basic info
    // We reuse the verify-params or image info endpoint logic if available
    // But commonly apps like this store metadata in PNG chunks.
    // Let's use the existing endpoint logic:
    const data = await apiPost('/api/image/params', { filename: props.filename })
    if (data && !data.error) {
      metadata.value = data
    }
  } catch (e) {
    console.warn('Failed to fetch metadata:', e)
  } finally {
    isLoading.value = false
  }
}

function handleCopy() {
  if (!metadata.value) return
  
  // Format metadata for copy
  const text = [
     metadata.value.prompt,
     metadata.value.negative_prompt ? `Negative prompt: ${metadata.value.negative_prompt}` : '',
     `Steps: ${metadata.value.steps}, Sampler: ${metadata.value.sampler || 'Default'}, CFG scale: ${metadata.value.cfg_scale}, Seed: ${metadata.value.seed}, Size: ${metadata.value.width}x${metadata.value.height}, Model: ${metadata.value.model}`
  ].filter(Boolean).join('\n')
  
  navigator.clipboard.writeText(text)
  isCopied.value = true
  toast.success('Parameters copied to clipboard')
  setTimeout(() => isCopied.value = false, 2000)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') emit('prev')
  if (e.key === 'ArrowRight') emit('next')
}

watch(() => props.filename, fetchMetadata, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md"
    @click.self="emit('close')"
  >
    <!-- Top Bar -->
    <div class="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-background/50 to-transparent">
      <div class="text-sm font-medium opacity-70 truncate max-w-md ml-4 text-white drop-shadow-md">
        {{ filename }}
      </div>
      
      <div class="flex items-center gap-2 mr-2">
        <button
          @click="showInfo = !showInfo"
          class="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors backdrop-blur-sm"
          :class="{ 'bg-primary/80': showInfo }"
          title="Toggle Info"
        >
          <Info class="w-5 h-5" />
        </button>
        <button
          @click="emit('close')"
          class="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors backdrop-blur-sm"
          title="Close"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Navigation Buttons -->
    <button 
      @click="emit('prev')"
      class="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors backdrop-blur-sm z-10"
    >
      <ChevronLeft class="w-8 h-8" />
    </button>

    <button 
      @click="emit('next')"
      class="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors backdrop-blur-sm z-10"
    >
      <ChevronRight class="w-8 h-8" />
    </button>

    <!-- Main Image -->
    <div 
      class="w-full h-full flex items-center justify-center p-4 transition-all duration-300"
      :class="{ 'pr-96': showInfo }"
    >
      <img
        :src="src"
        :alt="alt"
        class="max-w-full max-h-full object-contain drop-shadow-2xl"
        @click.stop
      />
    </div>

    <!-- Info Panel -->
    <div 
      class="absolute top-0 right-0 bottom-0 w-96 bg-card border-l border-border shadow-2xl p-6 flex flex-col transition-transform duration-300 ease-in-out z-20 overflow-hidden"
      :class="showInfo ? 'translate-x-0' : 'translate-x-full'"
      @click.stop
    >
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-bold">Image Info</h3>
        <button 
          @click="handleCopy"
          class="p-2 rounded-md hover:bg-muted transition-colors"
          title="Copy Parameters"
        >
          <Check v-if="isCopied" class="w-4 h-4 text-green-500" />
          <Copy v-else class="w-4 h-4" />
        </button>
      </div>

      <div v-if="isLoading" class="flex-1 flex items-center justify-center text-muted-foreground">
        Loading info...
      </div>

      <div v-else-if="!metadata" class="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center p-4">
        <Info class="w-12 h-12 mb-4 opacity-20" />
        <p>No metadata found for this image.</p>
      </div>

      <div v-else class="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        <!-- Prompt -->
        <div>
          <label class="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Prompt</label>
          <p class="text-sm bg-muted/50 p-3 rounded-lg leading-relaxed">{{ metadata.prompt }}</p>
        </div>

        <!-- Negative Prompt -->
        <div v-if="metadata.negative_prompt">
          <label class="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Negative Prompt</label>
          <p class="text-sm bg-muted/50 p-3 rounded-lg leading-relaxed">{{ metadata.negative_prompt }}</p>
        </div>

        <!-- Details Grid -->
        <div class="grid grid-cols-2 gap-3">
           <div class="bg-muted/30 p-2 rounded">
             <span class="text-xs text-muted-foreground block">Steps</span>
             <span class="text-sm font-mono">{{ metadata.steps }}</span>
           </div>
           <div class="bg-muted/30 p-2 rounded">
             <span class="text-xs text-muted-foreground block">CFG Scale</span>
             <span class="text-sm font-mono">{{ metadata.cfg_scale }}</span>
           </div>
           <div class="bg-muted/30 p-2 rounded">
             <span class="text-xs text-muted-foreground block">Seed</span>
             <span class="text-sm font-mono">{{ metadata.seed }}</span>
           </div>
           <div class="bg-muted/30 p-2 rounded">
             <span class="text-xs text-muted-foreground block">Size</span>
             <span class="text-sm font-mono">{{ metadata.width }}x{{ metadata.height }}</span>
           </div>
           <div class="bg-muted/30 p-2 rounded col-span-2">
             <span class="text-xs text-muted-foreground block">Model</span>
             <span class="text-sm font-mono truncate">{{ metadata.model }}</span>
           </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.4);
}
</style>
