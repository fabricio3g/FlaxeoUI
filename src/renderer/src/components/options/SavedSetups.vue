<script setup lang="ts">
/** Save the current model + options under a name and bring it back later. */
import { computed, ref } from 'vue'
import { Bookmark, Trash2 } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfigStore, type WorkspaceSurface } from '@/stores/config'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ surface: WorkspaceSurface }>()

const configStore = useConfigStore()
const toast = useToast()
const open = ref(false)
const name = ref('')

const saved = computed(() => configStore.presets.filter((preset) => !preset.builtin))

function save(): void {
  const preset = configStore.savePreset(name.value, props.surface)
  if (!preset) return
  name.value = ''
  toast.success(`Saved "${preset.name}"`)
}

function apply(id: string): void {
  configStore.applyPreset(id, props.surface)
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bookmark class="size-3.5" /> Saved
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-64 p-1 text-[13px]">
      <form class="flex gap-1 p-1" @submit.prevent="save">
        <input
          v-model="name"
          class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2"
          placeholder="Name this setup"
          aria-label="Setup name"
        />
        <button
          type="submit"
          class="h-8 rounded-md px-2.5 font-medium hover:bg-accent disabled:opacity-40"
          :disabled="!name.trim()"
        >
          Save
        </button>
      </form>
      <div class="max-h-64 overflow-y-auto">
        <div
          v-for="preset in saved"
          :key="preset.id"
          class="group flex items-center rounded-md hover:bg-accent"
        >
          <button
            type="button"
            class="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left"
            @click="apply(preset.id)"
          >
            {{ preset.name }}
          </button>
          <button
            type="button"
            class="aui-icon-button mr-1 inline-flex size-7 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="`Delete ${preset.name}`"
            v-tip="'Delete'"
            @click="configStore.deletePreset(preset.id)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
        <p v-if="!saved.length" class="px-2.5 py-3 text-xs text-muted-foreground">
          Save the model and options you use often.
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
