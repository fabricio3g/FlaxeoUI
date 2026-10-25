<script setup lang="ts">
/**
 * Models: every model family stable-diffusion.cpp supports (pictured from its official
 * Hugging Face repo), what is installed, one-click verified packs, search on Hugging Face
 * and Civitai, and add-from-URL for anything else.
 */
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  Lock,
  RefreshCw,
  Search,
  X
} from '@/lib/icons'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { apiGet, apiPost } from '@/services/api'
import { useModels } from '@/composables/useModels'
import { useModelDownloads, downloadKey } from '@/composables/useModelDownloads'
import { useRemoteSession } from '@/composables/useRemoteSession'
import { useToast } from '@/composables/useToast'
import { useConfigStore, type WorkspaceSurface } from '@/stores/config'
import { enrichHubModel, hubModels, type HubFile, type HubModel } from '@/lib/starterPacks'
import { isHubFileInstalled } from '@/lib/hubInstall'
import FamilyImage from '@/components/models/FamilyImage.vue'
import OnlineBrowser from '@/components/models/OnlineBrowser.vue'
import { usePackVariants } from '@/composables/usePackVariants'
import {
  QUANT_TIERS,
  type FamilyImage as FamilyImageInfo,
  type QuantTier
} from '../../../shared/modelHub'
import {
  MODEL_FAMILIES,
  familyById,
  familyMainFiles,
  familyReadiness,
  inferFamily,
  type FamilyKind,
  type ModelFamily
} from '../../../shared/modelFamilies'
import {
  MODEL_KEY_CATEGORY,
  filesIn,
  modelLabel,
  type InstalledModels
} from '../../../shared/modelSetup'
import { MODEL_DIRECTORY_KEYS } from '../../../shared/storage'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const configStore = useConfigStore()
const { models, fetchModels } = useModels()
const downloads = useModelDownloads()
const { isRemote } = useRemoteSession()

type Tab = 'catalog' | 'installed' | 'online' | 'url'
const tab = ref<Tab>('catalog')
const query = ref('')
const kindFilter = ref<'all' | FamilyKind | 'ready' | 'packs'>('all')
const selectedId = ref('')

const installed = computed(() => models.value as unknown as InstalledModels)

const CATEGORY_LABELS: Record<string, string> = {
  diffusion: 'Diffusion models',
  uncond_diffusion: 'Unconditional models',
  vae: 'VAEs',
  audio_vae: 'Audio VAEs',
  llm: 'LLM text encoders',
  llm_vision: 'Vision projectors',
  tokenizers: 'Tokenizers',
  t5xxl: 'T5 text encoders',
  embeddings_connectors: 'Embedding connectors',
  clip: 'CLIP encoders',
  clip_vision: 'CLIP Vision',
  loras: 'LoRAs',
  controlnet: 'ControlNet',
  photomaker: 'PhotoMaker',
  ip_adapter: 'IP-Adapter',
  pulid: 'PuLID',
  upscale: 'Upscalers (ESRGAN / MoSR)',
  hires_upscalers: 'Hi-res upscalers',
  taesd: 'TAESD preview decoders',
  embeddings: 'Embeddings',
  adetailer: 'ADetailer detectors',
  animatediff: 'AnimateDiff motion modules'
}

/* ------------------------------ Catalog ------------------------------ */

const readiness = computed(() =>
  Object.fromEntries(MODEL_FAMILIES.map((f) => [f.id, familyReadiness(f, installed.value)]))
)

const visibleFamilies = computed(() => {
  const q = query.value.trim().toLowerCase()
  return MODEL_FAMILIES.filter((f) => {
    if (kindFilter.value === 'ready' && readiness.value[f.id] !== 'ready') return false
    if (kindFilter.value === 'packs' && f.support !== 'packs') return false
    if (['image', 'edit', 'video'].includes(kindFilter.value) && f.kind !== kindFilter.value)
      return false
    if (!q) return true
    return `${f.name} ${f.group} ${f.blurb} ${f.kind}`.toLowerCase().includes(q)
  })
})

const selected = computed<ModelFamily | undefined>(() => familyById(selectedId.value))
/** The selected family's official Hugging Face repo, once its picture resolved */
const selectedRepo = ref<FamilyImageInfo | null>(null)
watch(selectedId, () => (selectedRepo.value = null))

function select(id: string): void {
  selectedId.value = id
  void router.replace({ query: { ...route.query, family: id || undefined } })
}

const KIND_LABEL: Record<FamilyKind, string> = { image: 'Image', edit: 'Edit', video: 'Video' }
const SUPPORT_LABEL = { packs: 'One-click', manual: 'Manual files', docs: 'Docs only' } as const
const READY_STYLE = {
  ready: 'bg-success/15 text-success',
  partial: 'bg-warning/15 text-warning',
  none: 'bg-muted text-muted-foreground'
} as const
const READY_LABEL = { ready: 'Ready', partial: 'Partly installed', none: 'Not installed' } as const

/** Main model + slots with what is on disk for the selected family. */
const componentRows = computed(() => {
  const f = selected.value
  if (!f) return []
  const mains = familyMainFiles(f, installed.value).matching
  return [
    { label: f.main.label, required: true, files: mains, category: 'diffusion' },
    ...f.slots.map((s) => ({
      label: s.label,
      required: s.required,
      category: MODEL_KEY_CATEGORY[s.key],
      files: filesIn(installed.value, s.key).filter((file) =>
        s.match.some((re) => re.test(file.split(/[\\/]/).pop() || file))
      )
    }))
  ]
})

const packs = computed<HubModel[]>(() =>
  (selected.value?.packIds || [])
    .map((id) => hubModels.find((p) => p.id === id))
    .filter((p): p is HubModel => !!p)
    .map(enrichHubModel)
)

const variants = usePackVariants()
watch(packs, (list) => void variants.load(list.flatMap((p) => p.files)), { immediate: true })

/** Installed in the picked quantization, or in any other one of the same file. */
function fileInstalled(file: HubFile): boolean {
  if (isHubFileInstalled(variants.effective(file), models.value)) return true
  return variants
    .options(file)
    .some((v) =>
      isHubFileInstalled({ ...file, filename: v.path.split('/').pop() || '' }, models.value)
    )
}

const hasVariants = (pack: HubModel): boolean =>
  pack.files.some((f) => variants.options(f).length > 1)

function variantLabel(v: { quant: string; size: number }): string {
  return v.size ? `${v.quant} · ${formatSize(v.size)}` : v.quant
}

function missingFiles(pack: HubModel, requiredOnly: boolean): HubFile[] {
  return pack.files.filter((f) => !fileInstalled(f) && (!requiredOnly || f.required !== false))
}

async function downloadPack(pack: HubModel, files: HubFile[]): Promise<void> {
  if (!files.length) {
    toast.info('Everything is already installed')
    return
  }
  toast.info(`Downloading ${files.length} file${files.length > 1 ? 's' : ''} for ${pack.name}`)
  const result = await downloads.downloadFiles(files.map(variants.effective))
  if (result.failed)
    toast.error(
      `${result.failed} download${result.failed > 1 ? 's' : ''} failed — see the file list`
    )
  else toast.success(`${pack.name} is ready`)
}

const useTargets = computed<Array<{ surface: WorkspaceSurface; label: string }>>(() => {
  const k = selected.value?.kind
  if (k === 'video') return [{ surface: 'video', label: 'Use for video' }]
  if (k === 'edit')
    return [
      { surface: 'edit', label: 'Use for editing' },
      { surface: 'image', label: 'Use for images' }
    ]
  return [
    { surface: 'image', label: 'Use for images' },
    { surface: 'edit', label: 'Use for editing' }
  ]
})

/** Set the family up in Create (its mode for this kind) and go there. */
function useIn(target: { surface: WorkspaceSurface }, mainFile?: string): void {
  const f = selected.value
  if (!f) return
  configStore.applyFamilyTo(target.surface, f.id, { mainFile })
  toast.success(`${f.name} is ready in Create`)
  void router.push({ name: 'Create', query: { mode: target.surface } })
}

/* ------------------------------ Installed ------------------------------ */

interface FileInfo {
  category: string
  name: string
  size: number
  mtime: number
  path: string
}
const files = ref<FileInfo[]>([])
const filesLoading = ref(false)

async function loadFiles(): Promise<void> {
  filesLoading.value = true
  try {
    const data = await apiGet<{ files: FileInfo[] }>('/api/models/files')
    files.value = data.files || []
  } catch {
    files.value = []
  } finally {
    filesLoading.value = false
  }
}

const groupedFiles = computed(() => {
  const q = query.value.trim().toLowerCase()
  return MODEL_DIRECTORY_KEYS.map((category) => ({
    category,
    label: CATEGORY_LABELS[category] || category,
    files: files.value.filter(
      (f) => f.category === category && (!q || f.name.toLowerCase().includes(q))
    )
  })).filter((g) => g.files.length)
})

const totalSize = computed(() => files.value.reduce((sum, f) => sum + f.size, 0))

function refreshInstalled(): void {
  void loadFiles()
  void fetchModels({ force: true })
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function useFile(file: FileInfo): void {
  const f = inferFamily(file.name)
  if (!f) return
  selectedId.value = f.id
  const surface: WorkspaceSurface =
    f.kind === 'video' ? 'video' : f.kind === 'edit' ? 'edit' : 'image'
  useIn({ surface }, file.name)
}

function openModelsFolder(): void {
  window.electronAPI?.openModelsFolder()
}

/* ---------------------------- Add from URL ---------------------------- */

const urlForm = ref({ url: '', category: 'loras', filename: '', label: '' })
const categoryOptions = MODEL_DIRECTORY_KEYS.map((key) => ({
  label: CATEGORY_LABELS[key] || key,
  value: key
}))

watch(
  () => urlForm.value.url,
  (url) => {
    try {
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
      if (name && !urlForm.value.filename) urlForm.value.filename = name
    } catch {
      /* not a URL yet */
    }
  }
)

const urlError = computed(() => {
  const url = urlForm.value.url.trim()
  if (!url) return ''
  if (!url.startsWith('https://')) return 'Use an https:// link'
  if (/huggingface\.co\/[^/]+\/[^/]+\/blob\//.test(url))
    return 'Use the “resolve” link (download), not the “blob” page link'
  return ''
})

async function addFromUrl(): Promise<void> {
  const form = urlForm.value
  if (!form.url.trim() || urlError.value) return
  const file: HubFile = {
    label: form.label.trim() || form.filename.trim() || 'Model file',
    category: form.category,
    filename: form.filename.trim(),
    url: form.url.trim(),
    required: true
  }
  const result = await downloads.downloadFiles([file])
  if (result.ok) {
    toast.success(`Downloaded ${file.filename}`)
    urlForm.value = { url: '', category: form.category, filename: '', label: '' }
    void loadFiles()
  } else {
    toast.error(downloads.fileStatus.value[downloadKey(file)] || 'Download failed')
  }
}

/* ---------------------------- HF access token ---------------------------- */

const tokenConfigured = ref(false)
const tokenDraft = ref('')
const tokenOpen = ref(false)

async function loadToken(): Promise<void> {
  if (isRemote) return
  try {
    tokenConfigured.value = (
      await apiGet<{ configured: boolean }>('/api/models/hf-token')
    ).configured
  } catch {
    tokenConfigured.value = false
  }
}

async function saveToken(clear = false): Promise<void> {
  try {
    const res = await apiPost<{ configured: boolean }>('/api/models/hf-token', {
      token: clear ? '' : tokenDraft.value.trim()
    })
    tokenConfigured.value = res.configured
    tokenDraft.value = ''
    tokenOpen.value = false
    toast.success(res.configured ? 'Hugging Face token saved' : 'Token removed')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save token')
  }
}

/* ---------------------------- Civitai API key ---------------------------- */

const civitaiConfigured = ref(false)
const civitaiDraft = ref('')
const civitaiOpen = ref(false)

async function loadCivitaiToken(): Promise<void> {
  if (isRemote) return
  try {
    civitaiConfigured.value = (
      await apiGet<{ configured: boolean }>('/api/models/civitai-token')
    ).configured
  } catch {
    civitaiConfigured.value = false
  }
}

async function saveCivitaiToken(clear = false): Promise<void> {
  try {
    const res = await apiPost<{ configured: boolean }>('/api/models/civitai-token', {
      token: clear ? '' : civitaiDraft.value.trim()
    })
    civitaiConfigured.value = res.configured
    civitaiDraft.value = ''
    civitaiOpen.value = false
    toast.success(res.configured ? 'Civitai key saved' : 'Civitai key removed')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save the key')
  }
}

/* ------------------------------ Lifecycle ------------------------------ */

watch(
  () => route.query.family,
  (id) => {
    if (typeof id === 'string' && familyById(id)) {
      selectedId.value = id
      tab.value = 'catalog'
    }
  },
  { immediate: true }
)

watch(tab, (t) => {
  if (t === 'installed') void loadFiles()
})

onMounted(async () => {
  void fetchModels({ force: true })
  void loadToken()
  void loadCivitaiToken()
  await loadFiles()
  // Open on what you already have; the catalog when nothing is downloaded yet.
  if (files.value.length && !route.query.family) tab.value = 'installed'
})
onActivated(() => {
  void fetchModels({ force: true })
  if (tab.value === 'installed') void loadFiles()
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- Header -->
    <header class="shrink-0 border-b border-border/70 px-4 pb-3 pt-5 md:px-8">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-[-0.02em]">Models</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ MODEL_FAMILIES.length }} model families supported by stable-diffusion.cpp ·
            {{ Object.values(readiness).filter((r) => r === 'ready').length }} ready on this
            computer
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="!isRemote"
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
            @click="openModelsFolder"
          >
            <FolderOpen class="size-3.5" /> Open models folder
          </button>
          <Popover v-if="!isRemote" :open="tokenOpen" @update:open="(v) => (tokenOpen = v)">
            <PopoverTrigger as-child>
              <button
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-medium hover:bg-accent"
              >
                <Lock class="size-3.5" />
                {{ tokenConfigured ? 'Hugging Face token set' : 'Add Hugging Face token' }}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" class="w-80 p-3">
              <p class="text-sm font-medium">Hugging Face access token</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                Some repos (FLUX dev, SD3.5, LTX-2.5, Gemma…) are gated: accept the license on
                huggingface.co, then paste a read token here. It is only sent to huggingface.co.
              </p>
              <form class="mt-2.5 flex gap-1.5" @submit.prevent="saveToken()">
                <input
                  v-model="tokenDraft"
                  type="password"
                  autocomplete="off"
                  placeholder="hf_…"
                  aria-label="Hugging Face token"
                  class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/25"
                />
                <button
                  type="submit"
                  :disabled="!tokenDraft.trim()"
                  class="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-30"
                >
                  Save
                </button>
              </form>
              <button
                v-if="tokenConfigured"
                type="button"
                class="mt-2 text-xs text-destructive hover:underline"
                @click="saveToken(true)"
              >
                Remove token
              </button>
            </PopoverContent>
          </Popover>
          <Popover v-if="!isRemote" :open="civitaiOpen" @update:open="(v) => (civitaiOpen = v)">
            <PopoverTrigger as-child>
              <button
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-medium hover:bg-accent"
              >
                <Lock class="size-3.5" />
                {{ civitaiConfigured ? 'Civitai key set' : 'Add Civitai key' }}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" class="w-80 p-3">
              <p class="text-sm font-medium">Civitai API key</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                Some Civitai models only download for signed-in users. Create a key under
                civitai.com → Account settings → API keys. It is only sent to civitai.com.
              </p>
              <form class="mt-2.5 flex gap-1.5" @submit.prevent="saveCivitaiToken()">
                <input
                  v-model="civitaiDraft"
                  type="password"
                  autocomplete="off"
                  placeholder="API key"
                  aria-label="Civitai API key"
                  class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/25"
                />
                <button
                  type="submit"
                  :disabled="!civitaiDraft.trim()"
                  class="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-30"
                >
                  Save
                </button>
              </form>
              <button
                v-if="civitaiConfigured"
                type="button"
                class="mt-2 text-xs text-destructive hover:underline"
                @click="saveCivitaiToken(true)"
              >
                Remove key
              </button>
            </PopoverContent>
          </Popover>
          <SegmentedControl
            :model-value="tab"
            :options="[
              {
                label: files.length ? `Downloaded · ${files.length}` : 'Downloaded',
                value: 'installed'
              },
              { label: 'Catalog', value: 'catalog' },
              { label: 'Browse online', value: 'online' },
              { label: 'Add from URL', value: 'url' }
            ]"
            aria-label="Models view"
            @update:model-value="(v) => (tab = v as Tab)"
          />
        </div>
      </div>
      <div
        v-if="tab === 'catalog' || tab === 'installed'"
        class="mt-3 flex flex-wrap items-center gap-2"
      >
        <label class="relative flex min-w-0 max-w-sm flex-1 items-center">
          <Search class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <input
            v-model="query"
            :placeholder="tab === 'catalog' ? 'Search families (FLUX, Qwen, Wan…)' : 'Search files'"
            aria-label="Search"
            class="h-8 w-full rounded-full border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/25"
          />
        </label>
        <div v-if="tab === 'catalog'" class="no-scrollbar flex gap-1 overflow-x-auto">
          <button
            v-for="chip in [
              { id: 'all', label: 'All' },
              { id: 'image', label: 'Image' },
              { id: 'edit', label: 'Edit' },
              { id: 'video', label: 'Video' },
              { id: 'ready', label: 'Ready' },
              { id: 'packs', label: 'One-click' }
            ] as const"
            :key="chip.id"
            type="button"
            class="h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors"
            :class="
              kindFilter === chip.id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent'
            "
            @click="kindFilter = chip.id"
          >
            {{ chip.label }}
          </button>
        </div>
      </div>
    </header>

    <!-- Catalog -->
    <div v-if="tab === 'catalog'" class="flex min-h-0 flex-1">
      <section
        class="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8"
        :class="selected ? 'hidden lg:block' : ''"
      >
        <div class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="f in visibleFamilies"
            :key="f.id"
            type="button"
            class="flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            :class="selectedId === f.id ? 'border-foreground/40' : 'border-border/70'"
            @click="select(f.id)"
          >
            <FamilyImage :family-id="f.id" :alt="f.name" class="aspect-[16/9] w-full" />
            <div class="flex flex-col gap-2 p-3.5">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-medium">{{ f.name }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{ KIND_LABEL[f.kind] }} · {{ f.group }}
                  </p>
                </div>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium"
                  :class="READY_STYLE[readiness[f.id]]"
                >
                  {{ READY_LABEL[readiness[f.id]] }}
                </span>
              </div>
              <p class="line-clamp-2 text-xs leading-5 text-muted-foreground">{{ f.blurb }}</p>
              <span class="text-[0.7rem] font-medium text-muted-foreground/80">{{
                SUPPORT_LABEL[f.support]
              }}</span>
            </div>
          </button>
        </div>
        <p v-if="!visibleFamilies.length" class="py-16 text-center text-sm text-muted-foreground">
          No families match.
        </p>
      </section>

      <!-- Family detail -->
      <aside
        v-if="selected"
        class="min-h-0 w-full overflow-y-auto border-l border-border/70 px-4 py-4 md:px-6 lg:w-[30rem] lg:shrink-0"
        :aria-label="`${selected.name} details`"
      >
        <div class="mb-3 flex items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-muted-foreground hover:bg-accent lg:hidden"
            @click="select('')"
          >
            <ArrowLeft class="size-4" /> All families
          </button>
          <button
            type="button"
            class="ml-auto hidden size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent lg:inline-flex"
            aria-label="Close details"
            @click="select('')"
          >
            <X class="size-4" />
          </button>
        </div>
        <FamilyImage
          :family-id="selected.id"
          :alt="selected.name"
          class="mb-3 aspect-[16/9] w-full rounded-xl"
          @resolved="(info) => (selectedRepo = info)"
        />
        <h2 class="text-xl font-semibold">{{ selected.name }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ selected.blurb }}</p>
        <p
          v-if="selected.note"
          class="mt-2 rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground"
        >
          {{ selected.note }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="target in useTargets"
            :key="target.surface"
            type="button"
            :disabled="readiness[selected.id] === 'none' || selected.support === 'docs'"
            class="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-opacity disabled:opacity-40"
            :class="
              target === useTargets[0]
                ? 'bg-foreground text-background'
                : 'border border-border/70 hover:bg-accent'
            "
            @click="useIn(target)"
          >
            {{ target.label }}
          </button>
          <a
            :href="selected.docs"
            target="_blank"
            rel="noopener"
            class="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Docs <ExternalLink class="size-3.5" />
          </a>
          <a
            v-if="selectedRepo?.repo"
            :href="selectedRepo.page"
            target="_blank"
            rel="noopener"
            class="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            :title="selectedRepo.repo"
          >
            Hugging Face <ExternalLink class="size-3.5" />
          </a>
        </div>

        <h3 class="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Needs
        </h3>
        <ul class="mt-2 divide-y divide-border/60 rounded-xl border border-border/70">
          <li
            v-for="row in componentRows"
            :key="row.label"
            class="flex items-start gap-2.5 px-3 py-2.5"
          >
            <CheckCircle2 v-if="row.files.length" class="mt-0.5 size-4 shrink-0 text-success" />
            <span
              v-else
              class="mt-1 size-3 shrink-0 rounded-full border-2"
              :class="row.required ? 'border-warning' : 'border-muted-foreground/40'"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">
                {{ row.label }}
                <span v-if="!row.required" class="text-xs font-normal text-muted-foreground"
                  >optional</span
                >
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{
                  row.files.length
                    ? row.files.map(modelLabel).join(', ')
                    : `Not found in models/${row.category}`
                }}
              </p>
            </div>
          </li>
        </ul>

        <template v-if="packs.length">
          <h3 class="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            One-click downloads
          </h3>
          <div
            v-for="pack in packs"
            :key="pack.id"
            class="mt-2 rounded-xl border border-border/70 p-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ pack.name }}</p>
                <p class="text-xs text-muted-foreground">
                  <template v-if="variants.packSize(pack.files)"
                    >{{ formatSize(variants.packSize(pack.files)) }} to download</template
                  >
                  <template v-else-if="pack.sizeGb">≈ {{ pack.sizeGb }} GB</template>
                  <template v-if="pack.minVramGb"> · {{ pack.minVramGb }} GB+ VRAM</template>
                </p>
                <div
                  v-if="hasVariants(pack)"
                  class="mt-2 flex flex-wrap gap-1"
                  role="group"
                  aria-label="Download size"
                >
                  <button
                    v-for="tier in QUANT_TIERS"
                    :key="tier.id"
                    type="button"
                    class="h-7 rounded-full border border-border/70 px-2.5 text-[11px] font-medium hover:bg-accent"
                    v-tip="tier.hint"
                    @click="variants.chooseTier(pack.files, tier.id as QuantTier)"
                  >
                    {{ tier.label }}
                  </button>
                </div>
              </div>
              <button
                v-if="missingFiles(pack, true).length && !isRemote"
                type="button"
                :disabled="downloads.busy.value"
                class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"
                @click="downloadPack(pack, missingFiles(pack, true))"
              >
                <Download class="size-3.5" />
                {{
                  missingFiles(pack, true).length ===
                  pack.files.filter((f) => f.required !== false).length
                    ? 'Download'
                    : 'Download missing'
                }}
              </button>
              <span
                v-else-if="!missingFiles(pack, true).length"
                class="inline-flex items-center gap-1 text-xs font-medium text-success"
              >
                <CheckCircle2 class="size-3.5" /> Installed
              </span>
            </div>
            <ul class="mt-2 space-y-1">
              <li
                v-for="file in pack.files"
                :key="file.filename"
                class="flex items-center gap-2 text-xs"
              >
                <CheckCircle2 v-if="fileInstalled(file)" class="size-3.5 shrink-0 text-success" />
                <span
                  v-else
                  class="size-3.5 shrink-0 rounded-full border border-muted-foreground/40"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate" :title="variants.effective(file).filename">
                  {{ file.label }}
                  <span v-if="file.required === false" class="text-muted-foreground"
                    >· optional</span
                  >
                </span>
                <Select
                  v-if="variants.options(file).length > 1 && !fileInstalled(file)"
                  :model-value="variants.effective(file).url"
                  size="sm"
                  class="w-36 shrink-0"
                  :aria-label="`${file.label} quantization`"
                  :options="
                    variants.options(file).map((v) => ({ label: variantLabel(v), value: v.url }))
                  "
                  @update:model-value="(url) => variants.choose(file, String(url))"
                />
                <span
                  v-if="file.gated && !fileInstalled(file)"
                  class="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[0.65rem] font-medium"
                  :class="
                    tokenConfigured
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-warning/15 text-warning'
                  "
                  :title="
                    tokenConfigured
                      ? 'Gated repo — uses your token'
                      : 'Gated repo — add a Hugging Face token first'
                  "
                >
                  <Lock class="size-3" /> Gated
                </span>
                <span
                  v-if="
                    downloads.fileStatus.value[downloadKey(variants.effective(file))] &&
                    !fileInstalled(file)
                  "
                  class="shrink-0 tabular-nums"
                  :class="
                    downloads.failed.value[downloadKey(variants.effective(file))]
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  "
                  :title="downloads.fileStatus.value[downloadKey(variants.effective(file))]"
                >
                  {{
                    downloads.failed.value[downloadKey(variants.effective(file))]
                      ? 'Failed'
                      : downloads.fileStatus.value[downloadKey(variants.effective(file))]
                  }}
                </span>
                <button
                  v-else-if="!fileInstalled(file) && !isRemote"
                  type="button"
                  class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  :aria-label="`Download ${file.label}`"
                  :disabled="downloads.busy.value"
                  @click="downloadPack(pack, [file])"
                >
                  <Download class="size-3.5" />
                </button>
              </li>
            </ul>
            <p
              v-for="file in pack.files.filter(
                (f) => downloads.failed.value[downloadKey(variants.effective(f))]
              )"
              :key="`err-${file.filename}`"
              class="mt-1.5 text-xs text-destructive"
            >
              {{ file.label }}:
              {{ downloads.fileStatus.value[downloadKey(variants.effective(file))] }}
            </p>
          </div>
        </template>
        <p v-else-if="selected.support !== 'packs'" class="mt-6 text-sm text-muted-foreground">
          No verified one-click download yet. The docs list the files; drop them into the folders
          above or use
          <button type="button" class="underline underline-offset-2" @click="tab = 'url'">
            Add from URL</button
          >.
        </p>

        <h3 class="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recommended settings
        </h3>
        <dl class="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div
            v-for="item in [
              { k: 'Steps', v: selected.defaults.steps },
              { k: 'CFG', v: selected.defaults.cfgScale },
              {
                k: 'Size',
                v: selected.defaults.width
                  ? `${selected.defaults.width}×${selected.defaults.height}`
                  : undefined
              },
              { k: 'Sampler', v: selected.defaults.sampler },
              { k: 'Flow shift', v: selected.defaults.flowShift },
              { k: 'Frames', v: selected.defaults.videoFrames }
            ].filter((i) => i.v !== undefined)"
            :key="item.k"
            class="rounded-lg bg-muted/60 px-2.5 py-1.5"
          >
            <dt class="text-xs text-muted-foreground">{{ item.k }}</dt>
            <dd class="font-medium">{{ item.v }}</dd>
          </div>
        </dl>
      </aside>
    </div>

    <!-- Browse online -->
    <OnlineBrowser
      v-else-if="tab === 'online'"
      :category-options="categoryOptions"
      :can-download="!isRemote"
    />

    <!-- Installed -->
    <div v-else-if="tab === 'installed'" class="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
      <div class="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <span>{{ files.length }} files · {{ formatSize(totalSize) }}</span>
        <button
          type="button"
          class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium hover:bg-accent"
          @click="refreshInstalled"
        >
          <RefreshCw class="size-3.5" :class="filesLoading ? 'animate-spin' : ''" /> Refresh
        </button>
        <button
          v-if="!isRemote"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium hover:bg-accent"
          @click="openModelsFolder"
        >
          <FolderOpen class="size-3.5" /> Open models folder
        </button>
      </div>
      <section v-for="group in groupedFiles" :key="group.category" class="mb-5">
        <h2 class="mb-1 text-[13px] font-medium">
          {{ group.label }}
          <span class="font-normal text-muted-foreground">{{ group.files.length }}</span>
        </h2>
        <ul class="divide-y divide-border">
          <li v-for="file in group.files" :key="file.name" class="flex items-center gap-3 py-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" :title="file.name">
                {{ modelLabel(file.name) }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ formatSize(file.size) }}
                <template v-if="group.category === 'diffusion' && inferFamily(file.name)">
                  · {{ inferFamily(file.name)?.name }}
                </template>
              </p>
            </div>
            <button
              v-if="group.category === 'diffusion' && inferFamily(file.name)"
              type="button"
              class="inline-flex h-7 shrink-0 items-center rounded-full border border-border/70 px-3 text-xs font-medium hover:bg-accent"
              @click="useFile(file)"
            >
              Use
            </button>
          </li>
        </ul>
      </section>
      <p
        v-if="!filesLoading && !groupedFiles.length"
        class="py-16 text-center text-sm text-muted-foreground"
      >
        {{
          files.length
            ? 'No files match.'
            : 'No model files yet — download a family from the Catalog.'
        }}
      </p>
    </div>

    <!-- Add from URL -->
    <div v-else class="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <form class="mx-auto max-w-xl space-y-4" @submit.prevent="addFromUrl">
        <div>
          <h2 class="text-lg font-semibold">Add a model from a link</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Paste a direct download link (Hugging Face “resolve” links, Civitai downloads…). It is
            saved into the folder you pick so every model picker finds it.
          </p>
        </div>
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Download link</span>
          <input
            v-model="urlForm.url"
            type="url"
            required
            placeholder="https://huggingface.co/owner/repo/resolve/main/model.gguf"
            class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/25"
          />
          <span v-if="urlError" class="mt-1 block text-xs text-destructive">{{ urlError }}</span>
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-medium">Type</span>
            <Select v-model="urlForm.category" :options="categoryOptions" />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-medium">Save as</span>
            <input
              v-model="urlForm.filename"
              required
              placeholder="file-name.safetensors"
              class="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/25"
            />
          </label>
        </div>
        <button
          type="submit"
          :disabled="
            !urlForm.url.trim() ||
            !urlForm.filename.trim() ||
            !!urlError ||
            downloads.busy.value ||
            isRemote
          "
          class="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-40"
        >
          <Download class="size-4" /> Download
        </button>
        <p v-if="isRemote" class="text-xs text-muted-foreground">
          Downloads can only be started on the desktop app.
        </p>
      </form>
    </div>
  </div>
</template>
