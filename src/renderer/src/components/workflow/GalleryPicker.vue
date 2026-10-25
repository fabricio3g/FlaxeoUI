<script setup lang="ts">
/** Pick an image from the gallery (output folder) — for Image input nodes and the run form. */
import { computed, ref } from 'vue'
import { Images, Loader2, Search } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { apiGet, getOutputUrl } from '@/services/api'
import { isImageFile } from '@/lib/graphUi'

withDefaults(defineProps<{ label?: string; triggerClass?: string }>(), {
  label: 'From gallery',
  triggerClass: ''
})

const emit = defineEmits<{ pick: [filename: string] }>()

const open = ref(false)
const files = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const query = ref('')

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (q ? files.value.filter((f) => f.toLowerCase().includes(q)) : files.value).slice(0, 120)
})

async function load(): Promise<void> {
  loading.value = true
  try {
    files.value = (await apiGet<string[]>('/api/gallery')).filter(isImageFile)
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Gallery unavailable'
  } finally {
    loading.value = false
  }
}

function onOpen(value: boolean): void {
  open.value = value
  if (value) void load()
}

function pick(file: string): void {
  emit('pick', file)
  open.value = false
}
</script>

<template>
  <Popover :open="open" @update:open="onOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-medium hover:bg-accent"
        :class="triggerClass"
      >
        <Images class="size-3.5" /> {{ label }}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-[min(26rem,calc(100vw-2rem))] p-0">
      <label class="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <Search class="size-4 text-muted-foreground" />
        <input
          v-model="query"
          placeholder="Search by file name…"
          aria-label="Search gallery"
          class="h-7 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <div class="max-h-[22rem] overflow-y-auto p-2">
        <p
          v-if="loading && !files.length"
          class="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        >
          <Loader2 class="size-4 animate-spin" /> Loading gallery…
        </p>
        <p v-else-if="error" class="py-8 text-center text-sm text-destructive">{{ error }}</p>
        <p v-else-if="!shown.length" class="py-8 text-center text-sm text-muted-foreground">
          {{ files.length ? 'No image matches.' : 'The gallery is empty.' }}
        </p>
        <div v-else class="grid grid-cols-4 gap-1.5">
          <button
            v-for="file in shown"
            :key="file"
            type="button"
            class="aspect-square overflow-hidden rounded-lg bg-muted ring-offset-2 ring-offset-background hover:ring-2 hover:ring-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :title="file"
            :aria-label="`Use ${file}`"
            @click="pick(file)"
          >
            <img :src="getOutputUrl(file)" alt="" loading="lazy" class="size-full object-cover" />
          </button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
