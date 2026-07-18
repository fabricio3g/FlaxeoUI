<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { Bookmark, Download, Search, Trash2, Upload, Info } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRecipeStore } from '@/stores/recipes'
import { useConfigStore } from '@/stores/config'
import { pickConfigSnapshot } from '@/lib/configSnapshot'
import {
  downloadTextFile,
  formatRecipeComboLine,
  formatRecipeInstructions,
  recipeGuideFilename
} from '@/lib/recipeExport'
import { notifyComposerPopoverOpen, onComposerPopoverOpen } from '@/lib/appEvents'
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

watch(open, (isOpen) => {
  if (isOpen) notifyComposerPopoverOpen('recipes')
})

let unsubPopover: (() => void) | null = null
onMounted(() => {
  unsubPopover = onComposerPopoverOpen((id) => {
    if (id !== 'recipes') open.value = false
  })
})
onUnmounted(() => {
  unsubPopover?.()
})

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

function modelHintsFromConfig() {
  const c = config.value
  const diffusion =
    c.loadMode === 'standard' ? c.standardModel || c.diffusionModel : c.diffusionModel
  return {
    diffusion: diffusion || undefined,
    vae: c.vaeModel || undefined
  }
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
    tags: [],
    modelHints: modelHintsFromConfig()
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

/** JSON (importable) + Markdown guide (models + combination). */
function exportRecipe(id: string): void {
  const recipe = recipeStore.getById(id)
  const pack = recipeStore.exportRecipeJson(id)
  if (!recipe || !pack) return

  downloadTextFile(pack.filename, pack.json, 'application/json')
  // Second file: human guide with model names + settings combination
  setTimeout(() => {
    downloadTextFile(
      recipeGuideFilename(recipe),
      formatRecipeInstructions(recipe),
      'text/markdown;charset=utf-8'
    )
  }, 120)

  toast.success('Exported JSON + model guide')
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

function preview(text?: string, max = 48): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return 'No prompt'
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function comboLine(id: string): string {
  const r = recipeStore.getById(id)
  return r ? formatRecipeComboLine(r) : ''
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="aui-icon-button inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        :class="
          compact
            ? [
                'size-10 justify-center rounded-full border-transparent px-0 hover:border-border hover:bg-background',
                open ? 'border-border bg-background text-foreground shadow-sm' : ''
              ]
            : ''
        "
        title="Recipes — full settings + export guide"
        aria-label="Recipes"
      >
        <Bookmark class="size-3.5" :class="compact ? 'size-4' : ''" />
        <span v-if="!compact">Recipes</span>
      </button>
    </PopoverTrigger>

    <PopoverContent
      side="top"
      align="end"
      :side-offset="8"
      :collision-padding="12"
      class="flex w-80 max-h-[min(70vh,36rem)] flex-col overflow-hidden p-0"
    >
      <div class="shrink-0 border-b border-border/70 px-3 py-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-semibold text-foreground">Recipes</p>
          <button
            type="button"
            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Help: Recipes"
            @click="openHelp"
          >
            <Info class="size-3.5" />
          </button>
        </div>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Full look: prompts + settings. Export includes model guide.
        </p>
      </div>

      <div class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        <div class="flex gap-1.5">
          <input
            v-model="saveName"
            type="text"
            placeholder="Name current look…"
            class="aui-field h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none"
            @keydown.enter.prevent="saveCurrent"
          />
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background hover:bg-foreground/85"
            @click="saveCurrent"
          >
            Save
          </button>
        </div>

        <button
          type="button"
          class="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border/70 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="triggerImport"
        >
          <Upload class="size-3.5" />
          Import JSON
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,.flaxeo-recipe.json,application/json"
          class="hidden"
          @change="onImportFile"
        />

        <div class="relative">
          <Search
            class="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="search"
            type="search"
            placeholder="Search recipes…"
            class="aui-field h-8 w-full rounded-md border border-input bg-background py-0 pl-7 pr-2 text-xs outline-none"
          />
        </div>

        <p
          v-if="builtins.length"
          class="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Built-in
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="recipe in builtins"
            :key="recipe.id"
            class="rounded-md border border-transparent px-2 py-1.5 hover:border-border/50 hover:bg-muted/40"
          >
            <button type="button" class="w-full text-left" @click="applyRecipe(recipe.id)">
              <p class="text-xs font-medium text-foreground">{{ recipe.name }}</p>
              <p
                v-if="comboLine(recipe.id)"
                class="mt-0.5 truncate font-mono text-xs text-muted-foreground"
              >
                {{ comboLine(recipe.id) }}
              </p>
              <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {{ preview(recipe.prompt || recipe.description) }}
              </p>
            </button>
          </li>
        </ul>

        <p
          v-if="userList.length"
          class="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Yours
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="recipe in userList"
            :key="recipe.id"
            class="flex items-start gap-0.5 rounded-md border border-transparent px-1 py-1.5 hover:border-border/50 hover:bg-muted/40"
          >
            <button
              type="button"
              class="min-w-0 flex-1 px-1 text-left"
              @click="applyRecipe(recipe.id)"
            >
              <p class="text-xs font-medium text-foreground">{{ recipe.name }}</p>
              <p
                v-if="comboLine(recipe.id)"
                class="mt-0.5 truncate font-mono text-xs text-muted-foreground"
              >
                {{ comboLine(recipe.id) }}
              </p>
              <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {{ preview(recipe.prompt || recipe.description) }}
              </p>
            </button>
            <button
              type="button"
              class="aui-icon-button mt-0.5 size-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Export JSON + model guide"
              @click.stop="exportRecipe(recipe.id)"
            >
              <Download class="size-3.5" />
            </button>
            <button
              type="button"
              class="aui-icon-button mt-0.5 size-7 shrink-0 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Delete"
              @click.stop="removeRecipe(recipe.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </li>
        </ul>

        <p v-if="!filtered.length" class="py-6 text-center text-xs text-muted-foreground">
          No recipes match.
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
