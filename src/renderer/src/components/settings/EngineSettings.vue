<script setup lang="ts">
/**
 * Settings → Engine & performance: is sd.cpp ready, install or update it (best build for this
 * computer picked for you, any other build one click away), switch between installed builds,
 * keep a model loaded, and how this computer runs models.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { AlertTriangle, Check, Download, FolderOpen, Loader2, RefreshCw, Trash2 } from '@/lib/icons'
import Select from '@/components/ui/Select.vue'
import PerformanceSettings from '@/components/PerformanceSettings.vue'
import { useBackend, buildLabel, formatBytes, type ReleaseAsset } from '@/composables/useBackend'
import { useConnection, type LoadedModelStatus } from '@/composables/useConnection'
import { apiPost } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { requestConfirm } from '@/composables/useConfirm'
import {
  alternativeBackendAsset,
  assetMatchesPlatform,
  cudaRuntimeFor,
  isRuntimePackage
} from '../../../../shared/backendRelease'

const engine = useBackend()
const connection = useConnection()
const toast = useToast()

const chooserOpen = ref(false)
const chosenTag = ref('')
const chosenAsset = ref('')
const showOtherSystems = ref(false)

const cfg = computed(() => engine.config.value)
const ready = computed(() => cfg.value.activeBackendValid)
const platformName = computed(() => {
  const p = engine.system.value.platform || cfg.value.hostPlatform
  return p === 'win32' ? 'Windows' : p === 'darwin' ? 'macOS' : p === 'linux' ? 'Linux' : ''
})

const status = computed(() => {
  if (cfg.value.activeBackendPlatformMismatch)
    return {
      tone: 'bad',
      title: 'The installed build is for another system',
      detail: `It cannot run on ${platformName.value || 'this computer'}. Install a build for it below.`
    }
  if (!ready.value)
    return {
      tone: 'warn',
      title: 'sd.cpp is not installed',
      detail: 'Flaxeo runs every model with stable-diffusion.cpp. Install it once below.'
    }
  const active = engine.activeBuild.value
  return {
    tone: 'ok',
    title: 'Ready',
    detail:
      cfg.value.activeVersion === 'custom'
        ? 'Using your own build from the custom folder.'
        : [cfg.value.activeVersion, active?.asset ? buildLabel(active.asset) : '']
            .filter(Boolean)
            .join(' · ')
  }
})

/* ----------------------------- Choosing a build ---------------------------- */

const releaseOptions = computed(() =>
  engine.releases.value.map((r, index) => ({
    value: r.tag,
    label: `${r.tag}${index === 0 ? ' (newest)' : ''} · ${new Date(r.published).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }))
)
const chosenRelease = computed(
  () => engine.releases.value.find((r) => r.tag === chosenTag.value) || null
)
const platform = computed(() => engine.system.value.platform || cfg.value.hostPlatform || 'win32')
const builds = computed(() => {
  const assets = chosenRelease.value?.assets || []
  const engines = assets.filter((a) => !isRuntimePackage(a.name))
  const mine = engines.filter((a) => assetMatchesPlatform(a.name, platform.value))
  const other = engines.filter((a) => !assetMatchesPlatform(a.name, platform.value))
  return { mine, other }
})
/** For AMD GPUs: the other of Vulkan / ROCm, worth a note next to the pick. */
const altName = computed(() =>
  chosenRelease.value
    ? alternativeBackendAsset(
        chosenRelease.value.assets,
        platform.value,
        engine.system.value.variant
      ) || ''
    : ''
)
const altNote = computed(() =>
  /rocm/i.test(altName.value)
    ? 'Faster on AMD if your card supports ROCm and AMD’s HIP SDK is installed'
    : 'Runs on any AMD card'
)

/** Download size including the CUDA runtime a Windows CUDA build brings along. */
function totalSize(asset: ReleaseAsset): string {
  const runtime = chosenRelease.value
    ? cudaRuntimeFor(chosenRelease.value.assets, asset.name)
    : undefined
  const size = formatBytes(asset.size + (runtime?.size || 0))
  return runtime ? `${size} with CUDA runtime` : size
}

const bestName = computed(() => {
  const rec = engine.recommended.value
  return rec && rec.release.tag === chosenTag.value ? rec.asset.name : ''
})
const chosen = computed<ReleaseAsset | null>(
  () => chosenRelease.value?.assets.find((a) => a.name === chosenAsset.value) || null
)

/** Default the chooser to the newest release and the best build for this computer. */
function seedChoice(): void {
  const rec = engine.recommended.value
  if (!chosenTag.value && engine.releases.value[0]) chosenTag.value = engine.releases.value[0].tag
  if (rec && rec.release.tag === chosenTag.value) chosenAsset.value = rec.asset.name
  else if (!builds.value.mine.some((a) => a.name === chosenAsset.value))
    chosenAsset.value = builds.value.mine[0]?.name || ''
}

watch(() => [engine.releases.value.length, engine.system.value.variant], seedChoice)
watch(chosenTag, () => {
  chosenAsset.value = ''
  seedChoice()
})

async function installChosen(): Promise<void> {
  if (!chosenRelease.value || !chosen.value) return
  await runInstall(chosenRelease.value.tag, chosen.value)
}

async function installRecommended(): Promise<void> {
  const rec = engine.recommended.value
  if (rec) await runInstall(rec.release.tag, rec.asset)
}

async function runInstall(tag: string, asset: ReleaseAsset): Promise<void> {
  const release = engine.releases.value.find((r) => r.tag === tag)
  if (!release) return
  try {
    await engine.installBuild(release, asset)
    chooserOpen.value = false
    toast.success(`sd.cpp ${tag} is installed and in use`)
  } catch (e) {
    // The progress block shows the reason; a toast would repeat it.
    if (!engine.install.value) toast.error(e instanceof Error ? e.message : 'Install failed')
  }
}

const progress = computed(() => {
  const state = engine.install.value
  if (!state) return null
  const total = state.totalBytes || 0
  const percent = total ? Math.min(100, Math.round((state.receivedBytes / total) * 100)) : 0
  return {
    ...state,
    percent,
    label: buildLabel(state.asset),
    amount: total
      ? `${formatBytes(state.receivedBytes)} of ${formatBytes(total)}`
      : formatBytes(state.receivedBytes)
  }
})

/* ------------------------------ Installed builds ----------------------------- */

const builtAt = (time: number): string =>
  time
    ? new Date(time).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : ''

async function use(version: string): Promise<void> {
  try {
    await engine.setActiveVersion(version)
    toast.success(version === 'custom' ? 'Using your own build' : `Using ${version}`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not switch builds')
  }
}

async function remove(version: string): Promise<void> {
  const ok = await requestConfirm({
    title: `Remove ${version}?`,
    message: 'Its files are deleted from this computer. You can install it again later.',
    confirmLabel: 'Remove'
  })
  if (!ok) return
  try {
    await engine.removeBuild(version)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not remove the build')
  }
}

function openCustomFolder(): void {
  window.electronAPI?.openCustomFolder()
}

/* --------------------------- Keep the model loaded --------------------------- */

const keepLoaded = computed(() => connection.loadedModel.value !== null)
const loaded = computed(() => connection.loadedModel.value)
const switching = ref(false)

/** The service owns this setting, so paired LAN devices use the loaded model too. */
async function setKeepLoaded(enabled: boolean): Promise<void> {
  switching.value = true
  try {
    connection.setLoadedModel(await apiPost<LoadedModelStatus>('/api/loaded-model', { enabled }))
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not change the setting')
  } finally {
    switching.value = false
  }
}

async function unload(): Promise<void> {
  connection.setLoadedModel(await apiPost<LoadedModelStatus>('/api/stop', {}))
}

const loadedLine = computed(() => {
  const info = loaded.value
  if (!info) return ''
  if (info.unsupported) return info.error || 'This sd.cpp build cannot keep models loaded.'
  if (info.status === 'loading') return `Loading ${info.model}…`
  if (info.status === 'ready') return `${info.model} is loaded`
  if (info.status === 'failed')
    return info.error || 'The model could not be loaded; runs use sd-cli.'
  return 'Loads with your next image'
})

onMounted(async () => {
  await engine.refresh()
  seedChoice()
  if (!ready.value) chooserOpen.value = true
})
</script>

<template>
  <div class="space-y-10">
    <!-- Status -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="flex items-center gap-2 text-[15px] font-medium">
            <span
              class="size-2 shrink-0 rounded-full"
              :class="
                status.tone === 'ok'
                  ? 'bg-success'
                  : status.tone === 'warn'
                    ? 'bg-warning'
                    : 'bg-destructive'
              "
              aria-hidden="true"
            />
            {{ status.title }}
          </p>
          <p class="mt-1 text-sm text-muted-foreground">{{ status.detail }}</p>
        </div>
        <button
          v-if="ready && !engine.isInstalling.value"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] hover:bg-accent"
          @click="chooserOpen = !chooserOpen"
        >
          <Download class="size-3.5" /> {{ chooserOpen ? 'Close' : 'Install another build' }}
        </button>
      </div>

      <div
        v-if="
          engine.updateAvailable.value && !engine.isInstalling.value && engine.recommended.value
        "
        class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm"
      >
        <p>
          <span class="font-medium">{{ engine.recommended.value.release.tag }}</span>
          <span class="text-muted-foreground">
            is out · {{ buildLabel(engine.recommended.value.asset.name) }} ·
            {{ formatBytes(engine.recommended.value.asset.size) }}</span
          >
        </p>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          @click="installRecommended"
        >
          Update
        </button>
      </div>
    </section>

    <!-- Keep the model loaded -->
    <section class="flex flex-wrap items-start gap-4" :class="!ready && 'opacity-60'">
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-medium">Keep the model loaded</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          The model stays in memory between images, so the next one starts right away. Works for
          paired devices too. Video, hi-res fix, face fix and ControlNet still load it each run.
          <template v-if="!ready"> Available once sd.cpp is installed.</template>
        </p>
        <p v-if="keepLoaded" class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            class="size-2 shrink-0 rounded-full"
            :class="
              loaded?.status === 'ready'
                ? 'bg-success'
                : loaded?.status === 'failed' || loaded?.unsupported
                  ? 'bg-destructive'
                  : loaded?.status === 'loading'
                    ? 'animate-pulse bg-warning'
                    : 'bg-muted-foreground/50'
            "
            aria-hidden="true"
          />
          <span class="min-w-0 truncate">{{ loadedLine }}</span>
          <button
            v-if="loaded?.status === 'ready'"
            type="button"
            class="ml-1 shrink-0 font-medium text-foreground underline underline-offset-2"
            @click="unload"
          >
            Unload
          </button>
        </p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="keepLoaded"
        :disabled="!ready || switching"
        aria-label="Keep the model loaded"
        class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed"
        :class="keepLoaded ? 'bg-primary' : 'bg-input'"
        @click="setKeepLoaded(!keepLoaded)"
      >
        <span
          class="inline-block size-4 rounded-full bg-background transition-transform"
          :class="keepLoaded ? 'translate-x-[18px]' : 'translate-x-0.5'"
        />
      </button>
    </section>

    <!-- Install progress -->
    <section v-if="progress" class="space-y-2" aria-live="polite">
      <div class="flex items-center justify-between gap-3 text-sm">
        <p class="min-w-0 truncate">
          <span class="font-medium">
            {{
              progress.status === 'completed'
                ? 'Installed'
                : progress.status === 'failed'
                  ? 'Install failed'
                  : progress.status === 'cancelled'
                    ? 'Install cancelled'
                    : 'Installing'
            }}
            {{ progress.version }}</span
          >
          <span class="text-muted-foreground"> · {{ progress.label }}</span>
        </p>
        <button
          v-if="progress.status === 'downloading'"
          type="button"
          class="h-7 shrink-0 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="engine.cancelInstall()"
        >
          Cancel
        </button>
        <button
          v-else
          type="button"
          class="h-7 shrink-0 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="engine.dismissInstall()"
        >
          Dismiss
        </button>
      </div>
      <div
        v-if="progress.status === 'downloading'"
        class="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        :aria-valuenow="progress.percent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-300"
          :style="{ width: `${progress.totalBytes ? progress.percent : 35}%` }"
          :class="!progress.totalBytes && 'animate-pulse'"
        />
      </div>
      <p
        v-if="progress.status === 'downloading'"
        class="text-xs tabular-nums text-muted-foreground"
      >
        {{ progress.amount
        }}<template v-if="progress.totalBytes"> · {{ progress.percent }}%</template>
        <template v-if="progress.totalBytes && progress.receivedBytes >= progress.totalBytes">
          · unpacking…</template
        >
      </p>
      <p v-if="progress.status === 'failed'" class="text-sm text-destructive">
        {{ progress.error || 'Something went wrong.' }}
      </p>
    </section>

    <!-- Choose and install a build -->
    <section v-if="chooserOpen && !engine.isInstalling.value" class="space-y-4">
      <div>
        <h3 class="text-sm font-medium">
          {{ ready ? 'Install another build' : 'Install sd.cpp' }}
        </h3>
        <p class="mt-1 text-sm text-muted-foreground">
          The best build for this computer is selected<template v-if="engine.system.value.note"
            >: {{ engine.system.value.note }}</template
          ><template v-else>.</template>
        </p>
      </div>

      <div
        v-if="engine.releasesError.value"
        class="flex flex-wrap items-center gap-3 text-sm text-destructive"
      >
        <AlertTriangle class="size-4 shrink-0" />
        <span class="min-w-0 flex-1">{{ engine.releasesError.value }}</span>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] text-foreground hover:bg-accent"
          @click="engine.fetchReleases()"
        >
          <RefreshCw class="size-3.5" /> Try again
        </button>
      </div>
      <p
        v-else-if="engine.releasesLoading.value && !engine.releases.value.length"
        class="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 class="size-4 animate-spin" /> Looking up builds…
      </p>

      <template v-if="engine.releases.value.length">
        <label class="block max-w-sm">
          <span class="mb-1 block text-xs text-muted-foreground">Release</span>
          <Select v-model="chosenTag" :options="releaseOptions" size="sm" class="w-full" />
        </label>

        <div
          role="radiogroup"
          aria-label="Build"
          class="divide-y divide-border border-y border-border"
        >
          <label
            v-for="asset in [...builds.mine, ...(showOtherSystems ? builds.other : [])]"
            :key="asset.name"
            class="flex cursor-pointer items-center gap-3 py-2.5"
          >
            <input
              v-model="chosenAsset"
              type="radio"
              :value="asset.name"
              class="accent-[var(--primary)]"
              name="engine-build"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-sm">
                {{ buildLabel(asset.name) }}
                <span
                  v-if="asset.name === bestName"
                  class="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium"
                  >Recommended</span
                >
                <span
                  v-else-if="asset.name === altName"
                  class="ml-1.5 text-[11px] text-muted-foreground"
                  >{{ altNote }}</span
                >
              </span>
              <span
                class="block truncate text-xs"
                :class="
                  assetMatchesPlatform(asset.name, platform)
                    ? 'text-muted-foreground'
                    : 'text-destructive'
                "
              >
                {{
                  assetMatchesPlatform(asset.name, platform)
                    ? asset.name
                    : `Will not run on ${platformName} · ${asset.name}`
                }}
              </span>
            </span>
            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{
              totalSize(asset)
            }}</span>
          </label>
          <p v-if="!builds.mine.length" class="py-3 text-sm text-muted-foreground">
            This release has no build for {{ platformName || 'this system' }}.
          </p>
        </div>
        <button
          v-if="builds.other.length"
          type="button"
          class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          @click="showOtherSystems = !showOtherSystems"
        >
          {{ showOtherSystems ? 'Hide' : 'Show' }} builds for other systems ({{
            builds.other.length
          }})
        </button>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            :disabled="!chosen"
            @click="installChosen"
          >
            <Download class="size-4" />
            Install {{ chosenTag }}
          </button>
          <span v-if="chosen" class="text-xs text-muted-foreground"
            >{{ buildLabel(chosen.name) }} · {{ totalSize(chosen) }}</span
          >
        </div>
      </template>
    </section>

    <!-- Installed builds -->
    <section v-if="engine.installed.value.length || cfg.customBinaryExists" class="space-y-2">
      <h3 class="text-sm font-medium">On this computer</h3>
      <ul class="divide-y divide-border border-y border-border">
        <li
          v-for="build in engine.installed.value"
          :key="build.version"
          class="flex items-center gap-3 py-2.5"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ build.version }}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {{
                [buildLabel(build.asset), formatBytes(build.sizeBytes), builtAt(build.installedAt)]
                  .filter((part) => part && part !== 'Unknown build')
                  .join(' · ') || 'Installed'
              }}
            </span>
          </span>
          <span
            v-if="build.version === cfg.activeVersion"
            class="inline-flex shrink-0 items-center gap-1 text-xs font-medium"
          >
            <Check class="size-3.5" /> In use
          </span>
          <template v-else>
            <button
              type="button"
              class="h-7 shrink-0 rounded-md border border-border px-2.5 text-[13px] hover:bg-accent"
              @click="use(build.version)"
            >
              Use
            </button>
            <button
              type="button"
              class="aui-icon-button inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
              :aria-label="`Remove ${build.version}`"
              v-tip="'Remove from this computer'"
              @click="remove(build.version)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </template>
        </li>
        <li class="flex items-center gap-3 py-2.5">
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">Your own build</span>
            <span class="block truncate text-xs text-muted-foreground">
              {{
                cfg.customBinaryExists
                  ? 'sd-cli and sd-server found in the custom folder'
                  : 'Put sd-cli and sd-server in the custom folder to use a build you compiled'
              }}
            </span>
          </span>
          <span
            v-if="cfg.activeVersion === 'custom'"
            class="inline-flex shrink-0 items-center gap-1 text-xs font-medium"
          >
            <Check class="size-3.5" /> In use
          </span>
          <button
            v-else-if="cfg.customBinaryExists"
            type="button"
            class="h-7 shrink-0 rounded-md border border-border px-2.5 text-[13px] hover:bg-accent"
            @click="use('custom')"
          >
            Use
          </button>
          <button
            type="button"
            class="aui-icon-button inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Open the custom folder"
            v-tip="'Open the custom folder'"
            @click="openCustomFolder"
          >
            <FolderOpen class="size-3.5" />
          </button>
        </li>
      </ul>
      <p class="text-xs text-muted-foreground">
        Builds differ in what they support. If something stops working after switching, try the
        newest build.
      </p>
    </section>
    <section v-else-if="!chooserOpen" class="text-sm text-muted-foreground">
      Have your own build?
      <button
        type="button"
        class="font-medium text-foreground underline underline-offset-2"
        @click="openCustomFolder"
      >
        Open the custom folder
      </button>
      and put sd-cli and sd-server in it.
    </section>

    <!-- How this computer runs models -->
    <section class="space-y-3">
      <div>
        <h3 class="text-sm font-medium">Performance</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          GPUs, memory and offloading for this computer. Never shared with workflows.
        </p>
      </div>
      <PerformanceSettings />
    </section>
  </div>
</template>
