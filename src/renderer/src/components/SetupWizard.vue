<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Download,
  ExternalLink,
  Film,
  ImageIcon,
  Loader2,
  Sparkles,
  Video,
  Wand2,
  X
} from '@/lib/icons'
import { useConfigStore } from '@/stores/config'
import { useBackend } from '@/composables/useBackend'
import { useRuntimeStatus } from '@/composables/useRuntimeStatus'
import { apiPost } from '@/services/api'
import {
  hubModels,
  STARTER_PACK_IDS,
  STARTER_PACK_META,
  type HubFile,
  type HubModel
} from '@/lib/starterPacks'
import Select from '@/components/ui/Select.vue'
import type { Release, ReleaseAsset } from '@/composables/useBackend'

type Step = 'welcome' | 'runtime' | 'model' | 'finish'

const emit = defineEmits<{
  done: []
  skip: []
}>()

const configStore = useConfigStore()
const backend = useBackend()
const { backendValid } = useRuntimeStatus()

const step = ref<Step>('welcome')
const selectedPackId = ref<string>('flux1-dev')
const runtimePoll = ref<number | null>(null)
const runtimeDownloading = ref(false)
const runtimeError = ref('')
const modelDownloading = ref(false)
const modelDownloadStatus = ref<Record<string, string>>({})
const modelDownloadProgress = ref<Record<string, number>>({})
const packDownloadPoll = ref<number | null>(null)
const selectedReleaseTag = ref<string>('')
const selectedAssetName = ref<string>('')

const selectedPack = computed(
  () => hubModels.find((model) => model.id === selectedPackId.value) || hubModels[0]
)

const selectedRelease = computed<Release | null>(() => {
  if (!selectedReleaseTag.value) return backend.releases.value[0] || null
  return backend.releases.value.find((r) => r.tag === selectedReleaseTag.value) || null
})

const releaseOptions = computed(() =>
  backend.releases.value.map((r) => ({
    label: `${r.name || r.tag}`,
    value: r.tag
  }))
)

const assetOptions = computed(() =>
  (selectedRelease.value?.assets || []).map((asset) => ({
    label: asset.name,
    value: asset.name
  }))
)

const selectedAsset = computed<ReleaseAsset | null>(() => {
  const assets = selectedRelease.value?.assets || []
  if (!selectedAssetName.value) return assets[0] || null
  return assets.find((asset) => asset.name === selectedAssetName.value) || null
})

const releaseDate = computed<string>(() => {
  const release = selectedRelease.value
  if (!release?.published) return ''
  try {
    return new Date(release.published).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return release.published
  }
})

const stepIndex = computed(() => {
  const map: Record<Step, number> = { welcome: 0, runtime: 1, model: 2, finish: 3 }
  return map[step.value]
})

function fileKey(file: HubFile): string {
  return `${file.category}/${file.filename}`
}

async function loadReleases(): Promise<void> {
  runtimeError.value = ''
  try {
    await backend.fetchReleases()
    if (backend.releases.value.length === 0) {
      runtimeError.value = 'No releases found. You may be rate-limited by GitHub or offline.'
    } else if (!selectedReleaseTag.value) {
      selectedReleaseTag.value = backend.releases.value[0]?.tag || ''
      selectedAssetName.value = backend.releases.value[0]?.assets[0]?.name || ''
    }
  } catch (e) {
    runtimeError.value = e instanceof Error ? e.message : 'Failed to fetch releases.'
  }
}

async function startRuntimeInstall(): Promise<void> {
  runtimeError.value = ''
  runtimeDownloading.value = true

  if (backend.releases.value.length === 0) {
    await loadReleases()
  }

  const release = selectedRelease.value
  const asset = selectedAsset.value
  if (!release || !asset) {
    runtimeDownloading.value = false
    runtimeError.value = 'No downloadable release is available right now.'
    return
  }

  try {
    await backend.downloadRelease(release, asset)
    await backend.fetchConfig()
    if (backendValid.value) {
      runtimeDownloading.value = false
      step.value = 'model'
      return
    }
  } catch (e) {
    runtimeError.value = e instanceof Error ? e.message : 'Runtime install failed.'
    runtimeDownloading.value = false
    return
  }

  runtimePoll.value = window.setInterval(async () => {
    await backend.fetchConfig()
    if (backendValid.value) {
      stopRuntimePoll()
      runtimeDownloading.value = false
      step.value = 'model'
    }
  }, 1500)
}

function stopRuntimePoll(): void {
  if (runtimePoll.value) {
    clearInterval(runtimePoll.value)
    runtimePoll.value = null
  }
}

async function downloadFile(file: HubFile): Promise<void> {
  const key = fileKey(file)
  modelDownloadStatus.value[key] = 'Downloading...'
  try {
    await apiPost('/api/models/download', file)
    modelDownloadStatus.value[key] = 'Downloaded'
  } catch (error) {
    modelDownloadStatus.value[key] = error instanceof Error ? error.message : 'Failed'
  }
}

async function startModelDownload(): Promise<void> {
  modelDownloading.value = true
  configStore.applyPreset(selectedPack.value.presetId)
  for (const file of selectedPack.value.files) {
    if (!modelDownloading.value) return
    await downloadFile(file)
  }
  modelDownloading.value = false
  step.value = 'finish'
}

function cancelModelDownload(): void {
  modelDownloading.value = false
}

async function finish(): Promise<void> {
  emit('done')
}

function skip(): void {
  emit('skip')
}

function next(): void {
  if (step.value === 'welcome') step.value = 'runtime'
  else if (step.value === 'runtime') step.value = 'model'
  else if (step.value === 'model') step.value = 'finish'
}

function back(): void {
  if (step.value === 'runtime') step.value = 'welcome'
  else if (step.value === 'model') step.value = 'runtime'
  else if (step.value === 'finish') step.value = 'model'
}

onMounted(async () => {
  await backend.fetchConfig()
  await loadReleases()
  if (backendValid.value) {
    step.value = 'model'
  }
})

watch(backendValid, (valid) => {
  if (valid && step.value === 'runtime' && runtimeDownloading.value) {
    stopRuntimePoll()
    runtimeDownloading.value = false
    step.value = 'model'
  }
})

watch(selectedRelease, (release) => {
  selectedAssetName.value = release?.assets[0]?.name || ''
})
</script>

<template>
  <Teleport to="body">
    <div
      class="aui-dialog-backdrop fade-in animate-in fixed inset-0 z-[200] flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm duration-200 motion-reduce:animate-none titlebar-no-drag sm:p-5"
    >
      <div
        class="aui-dialog-surface fade-in zoom-in-95 animate-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-foreground/10 duration-200 motion-reduce:animate-none"
      >
        <!-- Header -->
        <header
          class="flex items-center justify-between gap-4 border-b border-border/80 px-5 py-4 sm:px-6"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-sm font-semibold tracking-tight">Setup Wizard</h2>
              <span
                class="aui-status-badge rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {{ stepIndex + 1 }} / 4
              </span>
            </div>
            <p class="mt-0.5 text-[11px] text-muted-foreground">Configure your local workspace</p>
          </div>
          <div class="ml-auto hidden items-center gap-1.5 sm:flex" aria-hidden="true">
            <div
              v-for="i in 4"
              :key="i"
              class="h-1 w-7 rounded-full transition-colors duration-200"
              :class="i <= stepIndex + 1 ? 'bg-foreground/80' : 'bg-border'"
            ></div>
          </div>
          <button
            type="button"
            class="aui-icon-button inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            @click="skip"
            aria-label="Skip setup wizard"
          >
            <X class="h-4 w-4" />
          </button>
        </header>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-5 sm:p-6 md:p-7">
          <!-- Welcome -->
          <div v-if="step === 'welcome'" class="space-y-6 text-center">
            <div
              class="mx-auto flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/40 text-foreground shadow-sm"
            >
              <Wand2 class="h-6 w-6" />
            </div>
            <div>
              <h3 class="text-2xl font-semibold tracking-tight">Welcome to Flaxeo</h3>
              <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Let's get you ready to generate. The wizard will install the runtime, download a
                starter model, and configure the app for you.
              </p>
            </div>

            <div
              class="mx-auto max-w-lg overflow-hidden rounded-xl border border-border/80 bg-muted/15 text-left shadow-sm"
            >
              <div class="flex items-center gap-3 px-4 py-3.5">
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
                >
                  <Download class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium">Install the runtime</p>
                  <p class="text-xs text-muted-foreground">
                    Downloads the latest sd-cli backend for your platform.
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3 border-t border-border/70 px-4 py-3.5">
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
                >
                  <ImageIcon class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium">Pick a starter model</p>
                  <p class="text-xs text-muted-foreground">SDXL, FLUX.1 Dev, or Wan2.1 video.</p>
                </div>
              </div>
              <div class="flex items-center gap-3 border-t border-border/70 px-4 py-3.5">
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
                >
                  <Check class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium">Start generating</p>
                  <p class="text-xs text-muted-foreground">
                    Preset applied automatically. You're set.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Runtime -->
          <div v-else-if="step === 'runtime'" class="space-y-5">
            <div>
              <p
                class="aui-label text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Runtime
              </p>
              <h3 class="mt-1 text-xl font-semibold tracking-tight">Install the runtime</h3>
              <p class="mt-1 text-sm text-muted-foreground">
                Flaxeo needs the
                <code class="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs"
                  >sd-cli</code
                >
                backend to run inference. Pick a release below, then install it.
              </p>
            </div>

            <div class="rounded-xl border border-border/80 bg-muted/15 p-4 shadow-sm">
              <div class="space-y-2">
                <div class="flex items-start gap-3 sm:items-center">
                  <div
                    class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
                  >
                    <Download class="h-4 w-4" />
                  </div>
                  <div
                    class="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <Select
                      v-model="selectedReleaseTag"
                      :options="releaseOptions"
                      placeholder="No release available"
                      size="sm"
                      class="aui-field h-8"
                      :disabled="
                        runtimeDownloading ||
                        backend.isDownloading.value ||
                        backendValid ||
                        backend.releases.value.length === 0
                      "
                    />
                    <Select
                      v-model="selectedAssetName"
                      :options="assetOptions"
                      placeholder="Select variant"
                      size="sm"
                      class="aui-field h-8"
                      :disabled="
                        runtimeDownloading ||
                        backend.isDownloading.value ||
                        backendValid ||
                        assetOptions.length === 0
                      "
                    />
                    <button
                      type="button"
                      class="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      :disabled="
                        runtimeDownloading ||
                        backend.isDownloading.value ||
                        backendValid ||
                        !selectedRelease ||
                        !selectedAsset
                      "
                      @click="startRuntimeInstall"
                    >
                      <Loader2
                        v-if="runtimeDownloading || backend.isDownloading.value"
                        class="h-3.5 w-3.5 animate-spin"
                      />
                      <Check v-else-if="backendValid" class="h-3.5 w-3.5" />
                      <Download v-else class="h-3.5 w-3.5" />
                      {{
                        backendValid
                          ? 'Installed'
                          : runtimeDownloading
                            ? 'Installing...'
                            : 'Install'
                      }}
                    </button>
                  </div>
                </div>
                <p class="truncate pl-11 text-[11px] text-muted-foreground">
                  <template v-if="selectedRelease">
                    {{ selectedRelease.tag }}
                    <span v-if="releaseDate"> · {{ releaseDate }}</span>
                    <span v-if="selectedAsset"> · {{ selectedAsset.name }}</span>
                  </template>
                  <template v-else>fetching...</template>
                </p>
              </div>

              <div v-if="runtimeDownloading || backendValid" class="mt-4">
                <div class="mb-2 flex items-center justify-between text-[11px]">
                  <span class="text-muted-foreground">{{
                    backendValid ? 'Ready' : 'Downloading & verifying...'
                  }}</span>
                  <span class="text-muted-foreground">{{
                    backendValid ? '100%' : 'in progress'
                  }}</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :class="
                      backendValid
                        ? 'w-full bg-emerald-500/80'
                        : 'w-2/3 animate-pulse bg-foreground/70'
                    "
                  ></div>
                </div>
              </div>
            </div>

            <div
              v-if="runtimeError"
              class="aui-alert rounded-xl border border-destructive/25 border-l-2 border-l-destructive bg-destructive/5 px-3.5 py-3 text-xs text-destructive"
            >
              {{ runtimeError }}
            </div>

            <div
              v-else-if="!backendValid && !runtimeDownloading"
              class="aui-alert rounded-xl border border-amber-500/25 border-l-2 border-l-amber-500 bg-amber-500/5 px-3.5 py-3 text-xs text-amber-700 dark:text-amber-300"
            >
              If the download is taking a while, you can skip and finish setup later from Settings.
            </div>
          </div>

          <!-- Model -->
          <div v-else-if="step === 'model'" class="space-y-5">
            <div>
              <p
                class="aui-label text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Model preset
              </p>
              <h3 class="mt-1 text-xl font-semibold tracking-tight">Choose a starter model</h3>
              <p class="mt-1 text-sm text-muted-foreground">
                Pick one pack to download now. You can always get more from the Model Hub later.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <button
                v-for="packId in STARTER_PACK_IDS"
                :key="packId"
                type="button"
                class="relative flex flex-col items-start gap-2 rounded-xl border border-border/80 bg-background p-4 text-left transition-all duration-150 hover:border-foreground/25 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                :class="
                  selectedPackId === packId
                    ? 'border-foreground/30 bg-muted/40 shadow-sm ring-1 ring-foreground/10'
                    : ''
                "
                @click="selectedPackId = packId"
              >
                <span
                  v-if="STARTER_PACK_META[packId].recommended"
                  class="aui-status-badge absolute right-3 top-3 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  Recommended
                </span>
                <div
                  class="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/35 text-muted-foreground"
                >
                  <component
                    :is="packId === 'wan21' ? Video : packId === 'flux1-dev' ? Sparkles : ImageIcon"
                    class="h-5 w-5"
                  />
                </div>
                <div>
                  <p class="text-sm font-semibold">
                    {{ hubModels.find((m) => m.id === packId)?.name }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ STARTER_PACK_META[packId].blurb }}
                  </p>
                </div>
                <div
                  class="mt-auto flex w-full items-center justify-between pt-3 text-xs text-muted-foreground"
                >
                  <span>≈ {{ STARTER_PACK_META[packId].sizeGb }} GB</span>
                  <span>≥ {{ STARTER_PACK_META[packId].minVramGb }} GB VRAM</span>
                </div>
              </button>
            </div>

            <div class="rounded-xl border border-border/80 bg-muted/15 p-4 shadow-sm">
              <p class="mb-3 text-sm font-medium">Files to download</p>
              <div class="overflow-hidden rounded-lg border border-border/70 bg-background">
                <div
                  v-for="file in selectedPack.files"
                  :key="fileKey(file)"
                  class="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-xs last:border-b-0"
                >
                  <span class="truncate">{{ file.label }}</span>
                  <span
                    class="aui-status-badge shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                    :class="
                      file.required
                        ? 'border-foreground/15 bg-muted text-foreground'
                        : 'border-border bg-background text-muted-foreground'
                    "
                  >
                    {{ file.required ? 'Required' : 'Optional' }}
                  </span>
                </div>
              </div>

              <div v-if="modelDownloading" class="mt-4">
                <div class="mb-2 flex items-center justify-between text-[11px]">
                  <span class="text-muted-foreground">Downloading pack...</span>
                  <span class="text-muted-foreground">in progress</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div class="h-full w-2/3 animate-pulse rounded-full bg-foreground/70"></div>
                </div>
              </div>

              <div class="mt-4 flex gap-2">
                <button
                  type="button"
                  class="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  :disabled="modelDownloading"
                  @click="startModelDownload"
                >
                  <Loader2 v-if="modelDownloading" class="h-3.5 w-3.5 animate-spin" />
                  <Download v-else class="h-3.5 w-3.5" />
                  {{ modelDownloading ? 'Downloading...' : 'Download selected pack' }}
                </button>
                <button
                  v-if="modelDownloading"
                  type="button"
                  class="inline-flex h-8 items-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  @click="cancelModelDownload"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <!-- Finish -->
          <div v-else-if="step === 'finish'" class="space-y-6 text-center">
            <div
              class="mx-auto flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 shadow-sm dark:text-emerald-400"
            >
              <Check class="h-6 w-6" />
            </div>
            <div>
              <h3 class="text-2xl font-semibold tracking-tight">You're all set</h3>
              <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                The <strong>{{ selectedPack.name }}</strong> preset has been applied. You can start
                generating now or change models anytime from the Model Hub.
              </p>
            </div>

            <div class="mx-auto flex max-w-xs flex-col gap-2">
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                @click="finish"
              >
                Start generating
                <ArrowRight class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="inline-flex h-8 items-center justify-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                @click="skip"
              >
                Open Model Hub instead
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer
          class="flex items-center justify-between gap-3 border-t border-border/80 bg-muted/15 px-5 py-3.5 sm:px-6"
        >
          <button
            v-if="step !== 'welcome' && step !== 'finish'"
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            :disabled="modelDownloading || runtimeDownloading"
            @click="back"
          >
            <ChevronLeft class="h-3.5 w-3.5" />
            Back
          </button>
          <div v-else></div>

          <div class="flex items-center gap-2">
            <button
              v-if="step === 'welcome'"
              type="button"
              class="inline-flex h-8 items-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              @click="skip"
            >
              Skip for now
            </button>
            <button
              v-if="step === 'welcome'"
              type="button"
              class="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              @click="next"
            >
              Get started
              <ArrowRight class="h-3.5 w-3.5" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
