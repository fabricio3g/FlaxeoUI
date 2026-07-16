<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { Bookmark, Download, Search, Trash2, Upload, Info } from '@/lib/icons'
import Tooltip from '@/components/ui/Tooltip.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRecipeStore } from '@/stores/recipes'
import { useConfigStore } from '@/stores/config'
import { pickConfigSnapshot } from '@/lib/configSnapshot'
import { useToast } from '@/composables/useToast'
import { requestConfirm } from '@/composables/useConfirm'
import type { RecipeSurface } from '../../../shared/recipes'

const prompt = defineModel<string>('prompt', { required: true })
const negativePrompt = defineModel<string>('negativePrompt', { required: true })

const props = withDefaults(
  defineProps<{
    surface?: RecipeSurface
    compact?: boolean
  }>(),
  { surface: 'text2image', compact: false }
)

const toast = useToast()
const router = useRouter()
const recipeStore = useRecipeStore()
const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { allRecipes, selectedId } = storeToRefs(recipeStore)

const open = ref(false)
const search = ref('')
const saveName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = allRecipes.value.filter(
    (r) => r.surface === props.surface || r.surface === 'text2image'
  )
  if (!q) return list
  return list.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q)) ||
      r.prompt?.toLowerCase().includes(q)
  )
})

const builtins = computed(() => filtered.value.filter((r) => r.builtin))
const userList = computed(() => filtered.value.filter((r) => !r.builtin))

function applyRecipe(id: string): void {
  const recipe = recipeStore.getById(id)
  if (!recipe) return
  configStore.applyConfigSnapshot(recipe.configSnapshot)
  if (recipe.prompt != null) prompt.value = recipe.prompt
  if (recipe.negativePrompt != null) negativePrompt.value = recipe.negativePrompt
  selectedId.value = id
  toast.success(`Applied “${recipe.name}”`)
  open.value = false
}

function saveCurrent(): void {
  const name = saveName.value.trim()
  if (!name) {
    toast.error('Name the recipe first')
    return
  }
  const snapshot = pickConfigSnapshot(config.value)
  const recipe = recipeStore.saveRecipe({
    name,
    surface: props.surface,
    prompt: prompt.value,
    negativePrompt: negativePrompt.value,
    configSnapshot: snapshot,
    tags: []
  })
  if (!recipe) {
    toast.error('Could not save recipe')
    return
  }
  saveName.value = ''
  toast.success(`Saved “${recipe.name}”`)
}

async function removeRecipe(id: string): Promise<void> {
  const r = recipeStore.getById(id)
  if (!r || r.builtin) return
  const ok = await requestConfirm({
    title: 'Delete recipe',
    message: `Delete recipe “${r.name}”?`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  recipeStore.deleteRecipe(id)
  toast.success(`Deleted “${r.name}”`)
}

function exportRecipe(id: string): void {
  const pack = recipeStore.exportRecipeJson(id)
  if (!pack) return
  const blob = new Blob([pack.json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = pack.filename
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Recipe exported')
}

function triggerImport(): void {
  fileInput.value?.click()
}

async function onImportFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const recipe = recipeStore.importRecipe(text)
    if (!recipe) {
      toast.error('Invalid recipe file')
      return
    }
    toast.success(`Imported “${recipe.name}”`)
  } catch {
    toast.error('Could not read recipe file')
  }
}

function openHelp(): void {
  open.value = false
  router.push({ name: 'Help', query: { topic: 'recipes' } })
}

function preview(text?: string, max = 64): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return 'No prompt'
  return t.length > max ? `${t.slice(0, max)}…` : t
}
</script>

<template>
  <Popover v-model:open="open">
    <Tooltip text="Recipes — save and apply full generation settings" position="top">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="aui-icon-button inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :class="compact ? 'size-10 justify-center rounded-full border-transparent px-0 hover:border-border hover:bg-background' : ''"
          aria-label="Recipes"
        >
          <Bookmark class="size-3.5" :class="compact ? 'size-4' : ''" />
          <span v-if="!compact">Recipes</span>
        </button>
      </PopoverTrigger>
    </Tooltip>
    <PopoverContent class="w-[min(32rem,calc(100vw-1.5rem))] p-0" align="start" :side-offset="6">
      <div class="border-b border-border/70 px-4 py-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-base font-semibold text-foreground">Recipes</p>
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Help: Recipes"
            @click="openHelp"
          >
            <Info class="size-4" />
          </button>
        </div>
        <p class="mt-1 text-sm leading-5 text-muted-foreground">
          Full look: prompts + settings. Export/import JSON to share.
        </p>
      </div>

      <div class="space-y-2.5 border-b border-border/60 px-4 py-3">
        <div class="flex gap-2">
          <input
            v-model="saveName"
            type="text"
            placeholder="Name current look…"
            class="h-10 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            @keydown.enter.prevent="saveCurrent"
          />
          <button
            type="button"
            class="h-10 shrink-0 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            @click="saveCurrent"
          >
            Save
          </button>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border/70 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="triggerImport"
          >
            <Upload class="size-3.5" />
            Import
          </button>
          <input
            ref="fileInput"
            type="file"
            accept=".json,.flaxeo-recipe.json,application/json"
            class="hidden"
            @change="onImportFile"
          />
        </div>
      </div>

      <div class="relative border-b border-border/50 px-4 py-2.5">
        <Search
          class="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Search recipes…"
          class="h-10 w-full rounded-md border border-border/60 bg-muted/30 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <div class="max-h-[min(50vh,24rem)] overflow-y-auto p-2.5">
        <p
          v-if="builtins.length"
          class="mb-1.5 px-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Built-in
        </p>
        <ul class="space-y-1">
          <li
            v-for="recipe in builtins"
            :key="recipe.id"
            class="group rounded-lg border border-transparent px-2.5 py-2.5 hover:border-border/60 hover:bg-muted/40"
          >
            <button type="button" class="w-full text-left" @click="applyRecipe(recipe.id)">
              <p class="text-sm font-medium leading-5 text-foreground">{{ recipe.name }}</p>
              <p class="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {{ preview(recipe.prompt || recipe.description, 120) }}
              </p>
            </button>
          </li>
        </ul>

        <p
          v-if="userList.length"
          class="mb-1.5 mt-3 px-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Yours
        </p>
        <ul class="space-y-1">
          <li
            v-for="recipe in userList"
            :key="recipe.id"
            class="flex items-start gap-1 rounded-lg border border-transparent px-1.5 py-2 hover:border-border/60 hover:bg-muted/40"
          >
            <button
              type="button"
              class="min-w-0 flex-1 px-1 py-0.5 text-left"
              @click="applyRecipe(recipe.id)"
            >
              <p class="text-sm font-medium leading-5 text-foreground">{{ recipe.name }}</p>
              <p class="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {{ preview(recipe.prompt || recipe.description, 120) }}
              </p>
            </button>
            <button
              type="button"
              class="aui-icon-button mt-0.5 size-8 shrink-0 rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100"
              title="Export"
              @click.stop="exportRecipe(recipe.id)"
            >
              <Download class="size-4" />
            </button>
            <button
              type="button"
              class="aui-icon-button mt-0.5 size-8 shrink-0 rounded-md text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
              title="Delete"
              @click.stop="removeRecipe(recipe.id)"
            >
              <Trash2 class="size-4" />
            </button>
          </li>
        </ul>

        <p v-if="!filtered.length" class="px-2 py-8 text-center text-sm text-muted-foreground">
          No recipes match.
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
