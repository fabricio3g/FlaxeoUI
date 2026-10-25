<script setup lang="ts">
/** Full-screen viewer over a list of output images (prev/next wrap around). */
import { computed } from 'vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { getOutputUrl } from '@/services/api'

const props = defineProps<{ files: string[]; index: number | null }>()
const emit = defineEmits<{ 'update:index': [index: number | null] }>()

const file = computed(() => (props.index === null ? '' : props.files[props.index] || ''))

function step(delta: number): void {
  if (props.index === null || !props.files.length) return
  emit('update:index', (props.index + delta + props.files.length) % props.files.length)
}
</script>

<template>
  <Teleport to="body">
    <ImageViewer
      v-if="file"
      :src="getOutputUrl(file)"
      :filename="file"
      :alt="file"
      @close="emit('update:index', null)"
      @prev="step(-1)"
      @next="step(1)"
    />
  </Teleport>
</template>
