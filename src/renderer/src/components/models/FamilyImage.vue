<script setup lang="ts">
/**
 * A model family's picture, loaded straight from its official Hugging Face repo (never
 * downloaded). The repo is looked up once when the card scrolls into view.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiGet } from '@/services/api'
import type { FamilyImage } from '../../../../shared/modelHub'

const props = defineProps<{ familyId: string; alt: string }>()
const emit = defineEmits<{ resolved: [info: FamilyImage] }>()

const cache = globalThis as { __familyImages?: Map<string, Promise<FamilyImage | null>> }
const known = (cache.__familyImages ??= new Map())

const root = ref<HTMLElement | null>(null)
const src = ref('')
const failed = ref(false)
let observer: IntersectionObserver | null = null

function lookup(id: string): Promise<FamilyImage | null> {
  if (!known.has(id))
    known.set(
      id,
      apiGet<FamilyImage>(`/api/hub/family/${encodeURIComponent(id)}`).catch(() => {
        known.delete(id) // try again next time (offline, rate limited…)
        return null
      })
    )
  return known.get(id) as Promise<FamilyImage | null>
}

async function load(): Promise<void> {
  const info = await lookup(props.familyId)
  if (!info) return
  src.value = info.image
  emit('resolved', info)
}

onMounted(() => {
  if (!root.value || typeof IntersectionObserver === 'undefined') return void load()
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    observer?.disconnect()
    void load()
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  () => props.familyId,
  () => {
    src.value = ''
    failed.value = false
    void load()
  }
)
</script>

<template>
  <div ref="root" class="relative overflow-hidden bg-muted">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      class="size-full object-cover"
      @error="failed = true"
    />
  </div>
</template>
