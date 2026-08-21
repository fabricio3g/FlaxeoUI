<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { Bookmark, Check, Download, Info, Search, Trash2, Upload } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import { useRecipeStore } from '@/stores/recipes'
import { useConfigStore } from '@/stores/config'
import { pickConfigSnapshot } from '@/lib/configSnapshot'
import {
  downloadTextFile,
  formatRecipeComboLine,
  formatRecipeComboParts,
  formatRecipeInstructions
} from '@/lib/recipeExport'
import { notifyComposerPopoverOpen, onComposerPopoverOpen } from '@/lib/appEvents'
import { useToast } from '@/composables/useToast'
import { requestConfirm } from '@/composables/useConfirm'
import type { RecipeSurface } from '../../../shared/recipes'

const prompt = defineModel<string>('prompt', { required: true })
const negativePrompt = defineModel<string>('negativePrompt', { required: true })

const props = defineProps<{
  surface?: RecipeSurface
}>()

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
const searching = computed(() => search.value.trim().length > 0)

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
  // Only overwrite prompts the recipe actually defines.
  if (recipe.prompt != null) prompt.value = recipe.prompt
  if (recipe.negativePrompt != null) negativePrompt.value = recipe.negativePrompt
  selectedId.value = id
  const combo = formatRecipeComboLine(recipe)
  toast.success(combo ? `Applied “${recipe.name}” — ${combo}` : `Applied “${recipe.name}”`)
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
    surface: props.surface ?? 'text2image',
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

/** Single JSON file — the human-readable guide travels inside it. */
function exportRecipe(id: string): void {
  const recipe = recipeStore.getById(id)
  if (!recipe) return
  const pack = recipeStore.exportRecipeJson(id, formatRecipeInstructions(recipe))
  if (!pack) return
  downloadTextFile(pack.filename, pack.json, 'application/json')
  toast.success('Exported recipe (guide included)')
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

function preview(text?: string, max = 96): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return 'No prompt'
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function comboParts(id: string): string[] {
  const r = recipeStore.getById(id)
  return r ? formatRecipeComboParts(r) : []
}

function cardClass(id: string): string {
  return selectedId.value === id
    ? 'border-ring/50 bg-accent/30'
    : 'border-border/70 hover:border-border hover:bg-accent/20'
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="aui-icon-button relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        :class="
          open
            ? 'border-border bg-background text-foreground shadow-sm'
            : 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground'
        "
        title="Recipes — full settings + prompts"
        aria-label="Recipes"
      >
        <Bookmark class="size-4" />
      </button>
    </PopoverTrigger>

    <PopoverContent
      side="top"
      align="end"
      :side-offset="8"
      :collision-padding="12"
      class="flex w-96 max-w-[calc(100vw-2rem)] max-h-[min(72vh,38rem)] flex-col overflow-hidden p-0"
    >
      <div class="shrink-0 border-b border-border/70 px-3 py-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-semibold text-foreground">Recipes</p>
          <IconButton
            size="sm"
            title="Help: Recipes"
            aria-label="Help: Recipes"
            @click="openHelp"
          >
            <Info class="size-3.5" />
          </IconButton>
        </div>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Full look — generation settings + prompts. Presets save prompt text only.
        </p>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        <div class="flex gap-1.5">
          <Input
            v-model="saveName"
            size="sm"
            placeholder="Name your current look…"
            class="h-8 min-w-0 flex-1"
            @keydown.enter.prevent="saveCurrent"
          />
          <Button variant="primary" size="sm" class="shrink-0" @click="saveCurrent">Save</Button>
        </div>

        <div class="relative">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input v-model="search" type="search" size="sm" placeholder="Search recipes…" class="h-8 pl-8" />
        </div>

        <template v-if="builtins.length">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Built-in
            <span class="ml-0.5 normal-case text-muted-foreground/60">{{ builtins.length }}</span>
          </p>
          <ul class="-mt-1 space-y-1.5">
            <li
              v-for="recipe in builtins"
              :key="recipe.id"
              class="rounded-lg border transition-colors duration-150"
              :class="cardClass(recipe.id)"
            >
              <button
                type="button"
                class="w-full rounded-[inherit] px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                @click="applyRecipe(recipe.id)"
              >
                <span class="flex items-center gap-1.5">
                  <span
                    v-if="selectedId === recipe.id"
                    class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    title="Applied"
                  >
                    <Check class="size-2.5" />
                  </span>
                  <span class="truncate text-xs font-medium text-foreground">{{
                    recipe.name
                  }}</span>
                </span>
                <span
                  v-if="comboParts(recipe.id).length"
                  class="mt-1.5 flex flex-wrap gap-1"
                >
                  <span
                    v-for="(chip, i) in comboParts(recipe.id)"
                    :key="`${chip}-${i}`"
                    class="inline-flex max-w-full items-center truncate rounded border border-border/60 bg-muted/50 px-1.5 py-px font-mono text-[10px] leading-4 text-muted-foreground"
                    >{{ chip }}</span
                  >
                </span>
                <span class="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                  {{ preview(recipe.prompt || recipe.description) }}
                </span>
              </button>
            </li>
          </ul>
        </template>

        <template v-if="userList.length">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Yours
            <span class="ml-0.5 normal-case text-muted-foreground/60">{{ userList.length }}</span>
          </p>
          <ul class="-mt-1 space-y-1.5">
            <li
              v-for="recipe in userList"
              :key="recipe.id"
              class="flex items-stretch gap-0.5 rounded-lg border transition-colors duration-150"
              :class="cardClass(recipe.id)"
            >
              <button
                type="button"
                class="min-w-0 flex-1 rounded-[inherit] px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                @click="applyRecipe(recipe.id)"
              >
                <span class="flex items-center gap-1.5">
                  <span
                    v-if="selectedId === recipe.id"
                    class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    title="Applied"
                  >
                    <Check class="size-2.5" />
                  </span>
                  <span class="truncate text-xs font-medium text-foreground">{{
                    recipe.name
                  }}</span>
                </span>
                <span
                  v-if="comboParts(recipe.id).length"
                  class="mt-1.5 flex flex-wrap gap-1"
                >
                  <span
                    v-for="(chip, i) in comboParts(recipe.id)"
                    :key="`${chip}-${i}`"
                    class="inline-flex max-w-full items-center truncate rounded border border-border/60 bg-muted/50 px-1.5 py-px font-mono text-[10px] leading-4 text-muted-foreground"
                    >{{ chip }}</span
                  >
                </span>
                <span class="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                  {{ preview(recipe.prompt || recipe.description) }}
                </span>
              </button>
              <div class="flex shrink-0 flex-col justify-center gap-0.5 pr-1">
                <IconButton
                  size="xs"
                  title="Export JSON (guide included)"
                  aria-label="Export recipe"
                  @click.stop="exportRecipe(recipe.id)"
                >
                  <Download class="size-3.5" />
                </IconButton>
                <IconButton
                  size="xs"
                  title="Delete"
                  aria-label="Delete recipe"
                  class="hover:bg-destructive/10 hover:text-destructive"
                  @click.stop="removeRecipe(recipe.id)"
                >
                  <Trash2 class="size-3.5" />
                </IconButton>
              </div>
            </li>
          </ul>
        </template>

        <p v-if="!filtered.length" class="py-6 text-center text-xs text-muted-foreground">
          {{ searching ? 'No recipes match.' : 'No recipes available.' }}
        </p>
        <p
          v-else-if="!userList.length && !searching"
          class="pb-1 pt-0.5 text-center text-xs text-muted-foreground/80"
        >
          Nothing saved yet — name your current look above.
        </p>
      </div>

      <div class="shrink-0 border-t border-border/70 px-3 py-2">
        <Button variant="outline" size="sm" class="w-full" @click="triggerImport">
          <Upload class="size-3.5" />
          Import JSON
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,.flaxeo-recipe.json,application/json"
          class="hidden"
          @change="onImportFile"
        />
      </div>
    </PopoverContent>
  </Popover>
</template>
