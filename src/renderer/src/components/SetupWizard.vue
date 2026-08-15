<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowRight, Check, ChevronLeft, Download, FolderOpen, Loader2, X } from '@/lib/icons'
import { useConfigStore } from '@/stores/config'
import { useBackend } from '@/composables/useBackend'
import { useRuntimeStatus } from '@/composables/useRuntimeStatus'
import { useSetup } from '@/composables/useSetup'
import { apiGet, apiPost } from '@/services/api'
import {
  hubModels,
  STARTER_PACK_IDS,
  STARTER_PACK_META,
  type HubFile,
  type HubModel
} from '@/lib/starterPacks'
import Select from '@/components/ui/Select.vue'
import type { Release, ReleaseAsset } from '@/composables/useBackend'
import {
  assetMatchesPlatform,
  backendVariantLabel,
  pickBestBackendAsset
} from '../../../shared/backendRelease'

type Step = 'welcome' | 'runtime' | 'model' | 'finish'

const emit = defineEmits<{
  done: [payload?: { action?: 'sample' | 'hub' | 'done' }]
  skip: []
}>()

const configStore = useConfigStore()
const backend = useBackend()
const { backendValid } = useRuntimeStatus()
const { checklist } = useSetup()

const welcomeSteps = [
  'Install the sd-cli runtime for your GPU.',
  'Download a starter model — SD 1.5, SDXL, FLUX.1 Dev, or Wan2.1.'
]

const step = ref<Step>('welcome')
const selectedPackId = ref<string>('flux1-dev')
const packRecommendReason = ref('')
const optimizeLowVram = ref(false)
const runtimePoll = ref<number | null>(null)
const runtimeDownloading = ref(false)
const runtimeError = ref('')
const modelDownloading = ref(false)
/** True when user left the model step without downloading a starter pack. */
const skippedModelDownload = ref(false)
const modelDownloadStatus = ref<Record<string, string>>({})
const modelDownloadProgress = ref<Record<string, number>>({})
const packDownloadPoll = ref<number | null>(null)
const selectedReleaseTag = ref<string>('')
const selectedAssetName = ref<string>('')

const selectedPack = computed(
  () => hubModels.find((model) => model.id === selectedPackId.value) || hubModels[0]
)

/** One-line stand-in for the old file table: required labels + optional count */
const packFileSummary = computed(() => {
  const files = selectedPack.value.files
  const required = files.filter((file) => file.required)
  const optional = files.length - required.length
  const head = (required.length > 0 ? required : files).map((file) => file.label).join(', ')
  if (optional === 0) return head
  return `${head} + ${optional} optional file${optional > 1 ? 's' : ''}`
})

const selectedRelease = computed<Release | null>(() => {
  if (!selectedReleaseTag.value) return backend.releases.value[0] || null
  return backend.releases.value.find((r) => r.tag === selectedReleaseTag.value) || null
})

const detectedPlatform = ref<string>(
  typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)
    ? 'win32'
    : typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
      ? 'darwin'
      : 'linux'
)
const detectHint = ref<string | null>(null)

const releaseOptions = computed(() =>
  backend.releases.value.map((r) => ({
    label: r.tag,
    value: r.tag
  }))
)

/** Every published binary for the tag — OS detection only seeds the default pick */
const assetOptions = computed(() =>
  (selectedRelease.value?.assets || []).map((asset) => ({
    label: `${backendVariantLabel(asset.name)}${
      assetMatchesPlatform(asset.name, detectedPlatform.value) ? '' : ' · not for your OS'
    } — ${asset.name}`,
    value: asset.name
  }))
)

/** Installing a foreign binary leaves a runtime that can never start */
const selectedAssetIsForeign = computed(
  () =>
    !!selectedAsset.value && !assetMatchesPlatform(selectedAsset.value.name, detectedPlatform.value)
)

function syncAssetForRelease(): void {
  const release = selectedRelease.value
  if (!release) {
    selectedAssetName.value = ''
    return
  }
  if (release.assets.some((a) => a.name === selectedAssetName.value)) return
  selectedAssetName.value =
    pickBestBackendAsset(release.assets, detectedPlatform.value, detectHint.value) ||
    release.assets[0]?.name ||
    ''
}

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

/** Open backend/custom so users can drop sd-cli / sd-server themselves */
function openCustomFolder(): void {
  window.electronAPI?.openCustomFolder()
}

async function loadReleases(): Promise<void> {
  runtimeError.value = ''
  try {
    await backend.fetchReleases()
    if (backend.releases.value.length === 0) {
      runtimeError.value = 'No releases found. You may be rate-limited by GitHub or offline.'
    } else if (!selectedReleaseTag.value) {
      selectedReleaseTag.value = backend.releases.value[0]?.tag || ''
      syncAssetForRelease()
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
  skippedModelDownload.value = false
  configStore.applyPreset(selectedPack.value.presetId)
  if (optimizeLowVram.value) {
    configStore.applyLowVramProfile()
  }
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

/** Continue setup without downloading a starter pack (Hub or manual files later). */
function skipModelDownload(): void {
  if (modelDownloading.value) return
  skippedModelDownload.value = true
  if (optimizeLowVram.value) {
    configStore.applyLowVramProfile()
  }
  // Do not apply pack preset — files may not be on disk yet
  step.value = 'finish'
}

async function recommendPackFromDetect(): Promise<void> {
  try {
    const data = await apiGet<{
      platform?: string
      variant?: string | null
      note?: string | null
    }>('/api/backend/detect')
    if (data.platform) detectedPlatform.value = data.platform
    detectHint.value = data.variant || null
    syncAssetForRelease()
    const note = `${data.variant || ''} ${data.note || ''}`.toLowerCase()
    const hasNvidia = /cuda|nvidia/.test(note)
    // Smaller pack for non-CUDA; FLUX when NVIDIA is advertised
    if (hasNvidia) {
      selectedPackId.value = 'flux1-dev'
      packRecommendReason.value = 'FLUX.1 Dev is preselected for NVIDIA — best still-image quality.'
    } else {
      selectedPackId.value = 'sd15'
      packRecommendReason.value =
        'SD 1.5 is preselected for your GPU — smallest, runs almost anywhere.'
      optimizeLowVram.value = true
    }
  } catch {
    selectedPackId.value = 'sd15'
    packRecommendReason.value = 'SD 1.5 is preselected — the smallest starter pack.'
    optimizeLowVram.value = true
  }
}

function finish(action: 'sample' | 'hub' | 'done' = 'done'): void {
  if (optimizeLowVram.value) {
    configStore.applyLowVramProfile()
  }
  emit('done', { action })
}

function skip(): void {
  emit('skip')
}

async function next(): Promise<void> {
  if (step.value === 'welcome') step.value = 'runtime'
  else if (step.value === 'runtime') {
    step.value = 'model'
    await recommendPackFromDetect()
  } else if (step.value === 'model') step.value = 'finish'
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
    await recommendPackFromDetect()
  }
})

watch(backendValid, async (valid) => {
  if (valid && step.value === 'runtime' && runtimeDownloading.value) {
    stopRuntimePoll()
    runtimeDownloading.value = false
    step.value = 'model'
    await recommendPackFromDetect()
  }
})

watch(selectedRelease, () => {
  syncAssetForRelease()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="aui-dialog-backdrop fade-in animate-in fixed inset-0 z-[200] flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm duration-200 motion-reduce:animate-none titlebar-no-drag sm:p-5"
    >
      <div
        class="aui-dialog-surface fade-in zoom-in-95 animate-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/15 duration-200 motion-reduce:animate-none dark:shadow-black/40"
      >
        <!-- Header — no border; gradient fade over scroll -->
        <header
          class="aui-scroll-header aui-scroll-header--popover flex items-center justify-between gap-4 bg-popover px-5 py-4 sm:px-6"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-sm font-semibold tracking-tight">Setup Wizard</h2>
              <span
                class="aui-status-badge rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {{ stepIndex + 1 }} / 4
              </span>
            </div>
            <p class="mt-0.5 text-xs text-muted-foreground">Configure your local workspace</p>
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
          <div class="aui-scroll-header__fade" aria-hidden="true" />
        </header>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-5 sm:p-6 md:p-7">
          <!-- Welcome -->
          <div v-if="step === 'welcome'" class="mx-auto max-w-md space-y-6">
            <div>
              <h3 class="text-2xl font-semibold tracking-[-0.02em]">Welcome to Flaxeo</h3>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                Two steps and you're generating.
              </p>
            </div>

            <ol class="space-y-3">
              <li
                v-for="(item, i) in welcomeSteps"
                :key="item"
                class="flex items-baseline gap-3 text-sm"
              >
                <span class="w-4 shrink-0 font-medium text-muted-foreground tabular-nums">
                  {{ i + 1 }}
                </span>
                <span class="leading-relaxed">{{ item }}</span>
              </li>
            </ol>
          </div>

          <!-- Runtime -->
          <div v-else-if="step === 'runtime'" class="space-y-6">
            <div>
              <h3 class="text-xl font-semibold tracking-[-0.02em]">Install the runtime</h3>
              <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Flaxeo runs inference through the sd-cli backend. Install a release below, or drop
                your own binaries into the custom folder.
              </p>
            </div>

            <div class="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-sm font-medium">Release tag</label>
                  <Select
                    v-model="selectedReleaseTag"
                    :options="releaseOptions"
                    placeholder="No release available"
                    size="md"
                    class="aui-field"
                    :disabled="
                      runtimeDownloading ||
                      backend.isDownloading.value ||
                      backendValid ||
                      backend.releases.value.length === 0
                    "
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium">Binary</label>
                  <Select
                    v-model="selectedAssetName"
                    :options="assetOptions"
                    placeholder="Select binary…"
                    size="md"
                    class="aui-field"
                    :disabled="
                      runtimeDownloading ||
                      backend.isDownloading.value ||
                      backendValid ||
                      assetOptions.length === 0
                    "
                  />
                </div>
              </div>

              <p class="mt-2.5 truncate text-sm text-muted-foreground">
                <template v-if="selectedRelease">
                  Published {{ releaseDate || 'recently' }}
                </template>
                <template v-else>Fetching releases…</template>
              </p>

              <p
                v-if="selectedAssetIsForeign"
                class="mt-2.5 text-sm leading-relaxed text-destructive"
              >
                This binary is built for another operating system and will not run here.
              </p>

              <button
                type="button"
                class="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
                  class="size-4 animate-spin"
                />
                <Check v-else-if="backendValid" class="size-4" />
                <Download v-else class="size-4" />
                {{ backendValid ? 'Installed' : runtimeDownloading ? 'Installing…' : 'Install' }}
              </button>

              <div v-if="runtimeDownloading || backendValid" class="mt-4">
                <div class="mb-2 flex items-center justify-between text-sm">
                  <span class="text-muted-foreground">{{
                    backendValid ? 'Ready' : 'Downloading and verifying…'
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

            <!-- Manual install path (same as Settings → Custom folder) -->
            <div class="space-y-1.5 border-t border-border/60 pt-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-foreground">Or use your own binaries</p>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:underline"
                  title="Open backend/custom folder"
                  @click="openCustomFolder"
                >
                  <FolderOpen class="size-4" />
                  Custom folder
                </button>
              </div>
              <p class="text-sm leading-relaxed text-muted-foreground">
                Place sd-cli and sd-server in the custom folder, then continue — the wizard detects
                them automatically. You can also skip this step and finish from Settings later.
              </p>
            </div>

            <div
              v-if="runtimeError"
              class="aui-alert rounded-xl border border-destructive/25 border-l-2 border-l-destructive bg-destructive/5 px-3.5 py-3 text-sm leading-relaxed text-destructive"
            >
              {{ runtimeError }}
            </div>
          </div>

          <!-- Model -->
          <div v-else-if="step === 'model'" class="space-y-6">
            <div>
              <h3 class="text-xl font-semibold tracking-[-0.02em]">Choose a starter model</h3>
              <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {{
                  packRecommendReason ||
                  'Pick one pack to download now, or skip and add models later.'
                }}
              </p>
            </div>

            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                v-for="packId in STARTER_PACK_IDS"
                :key="packId"
                type="button"
                class="rounded-lg border p-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                :class="
                  selectedPackId === packId
                    ? 'border-foreground/30 bg-muted/40'
                    : 'border-border/70 bg-background hover:bg-muted/25'
                "
                @click="selectedPackId = packId"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium">
                    {{ hubModels.find((m) => m.id === packId)?.name }}
                  </p>
                  <Check v-if="selectedPackId === packId" class="size-4 shrink-0 text-foreground" />
                </div>
                <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {{ STARTER_PACK_META[packId].blurb }}
                </p>
                <p class="mt-2 text-sm text-muted-foreground tabular-nums">
                  ≈{{ STARTER_PACK_META[packId].sizeGb }} GB ·
                  {{ STARTER_PACK_META[packId].minVramGb }} GB VRAM
                </p>
              </button>
            </div>

            <div class="space-y-3">
              <label class="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  v-model="optimizeLowVram"
                  type="checkbox"
                  class="size-4 rounded border-border accent-foreground"
                />
                Optimize for low VRAM
              </label>

              <p class="text-sm leading-relaxed text-muted-foreground">
                Downloads
                <span class="text-foreground">{{ packFileSummary }}</span>
                into your models folder. Skip if you already have weights or plan to use the Model
                Hub.
              </p>
            </div>

            <div v-if="modelDownloading">
              <div class="mb-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>Downloading pack…</span>
                <span>in progress</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div class="h-full w-2/3 animate-pulse rounded-full bg-foreground/70"></div>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                :disabled="modelDownloading"
                @click="startModelDownload"
              >
                <Loader2 v-if="modelDownloading" class="size-4 animate-spin" />
                <Download v-else class="size-4" />
                {{ modelDownloading ? 'Downloading…' : 'Download selected pack' }}
              </button>
              <button
                v-if="modelDownloading"
                type="button"
                class="inline-flex h-9 items-center rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                @click="cancelModelDownload"
              >
                Cancel
              </button>
              <button
                v-else
                type="button"
                class="inline-flex h-9 items-center justify-center rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                title="Continue without downloading — install from Hub or place files under models/"
                @click="skipModelDownload"
              >
                Skip download
              </button>
            </div>
          </div>

          <!-- Finish -->
          <div v-else-if="step === 'finish'" class="space-y-6 text-center">
            <div>
              <h3 class="text-2xl font-semibold tracking-[-0.02em]">You're all set</h3>
              <p
                v-if="skippedModelDownload"
                class="mx-auto mt-2 max-w-md text-sm text-muted-foreground"
              >
                You skipped the starter pack download. Add models from the
                <strong>Model Hub</strong>, or place files under
                <strong>Settings → Storage → Models</strong>
                (see Help → Models &amp; hardware for folder layout).
              </p>
              <p v-else class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                The <strong>{{ selectedPack.name }}</strong> preset has been applied. You can start
                generating now or change models anytime from the Model Hub.
              </p>
            </div>

            <ul class="mx-auto max-w-xs space-y-2 text-left">
              <li
                v-for="item in checklist"
                :key="item.id"
                class="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-sm"
              >
                <Check
                  class="size-4 shrink-0"
                  :class="
                    item.done
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground/40'
                  "
                />
                <span :class="item.done ? 'text-foreground' : 'text-muted-foreground'">
                  {{ item.label }}
                </span>
              </li>
            </ul>
            <p class="text-sm text-muted-foreground">
              Generate once to complete the checklist — then you are fully ready.
            </p>

            <div class="mx-auto flex max-w-xs flex-col gap-2">
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                @click="finish('sample')"
              >
                Generate sample
                <ArrowRight class="size-4" />
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                @click="finish('done')"
              >
                Start generating
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                @click="finish('hub')"
              >
                Open Model Hub
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
            class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            :disabled="modelDownloading || runtimeDownloading"
            @click="back"
          >
            <ChevronLeft class="size-4" />
            Back
          </button>
          <div v-else></div>

          <div class="flex items-center gap-2">
            <button
              v-if="step === 'welcome'"
              type="button"
              class="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              @click="skip"
            >
              Skip for now
            </button>
            <button
              v-if="step === 'welcome'"
              type="button"
              class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              @click="next"
            >
              Get started
              <ArrowRight class="size-4" />
            </button>

            <button
              v-if="step === 'runtime'"
              type="button"
              class="inline-flex h-9 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              :disabled="runtimeDownloading || backend.isDownloading.value"
              @click="next"
            >
              {{ backendValid ? 'Continue' : 'Skip the download' }}
              <ArrowRight class="size-4" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
