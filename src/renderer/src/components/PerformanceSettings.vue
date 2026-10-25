<script setup lang="ts">
/**
 * Machine settings: how this computer runs sd.cpp. Kept out of model setups so
 * workflows and presets shared with a team never carry another machine's GPU layout.
 */
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Cpu, Loader2, Zap } from '@/lib/icons'
import Select from '@/components/ui/Select.vue'
import { apiGet } from '@/services/api'
import { useConfigStore } from '@/stores/config'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import { useToast } from '@/composables/useToast'

const configStore = useConfigStore()
const { config } = storeToRefs(configStore)
const { hasFlag, capabilities } = useBackendCapabilities()
const toast = useToast()

const devices = ref<Array<{ name: string; description: string }>>([])
const devicesError = ref('')
const devicesLoading = ref(false)

async function detectDevices(): Promise<void> {
  devicesLoading.value = true
  try {
    const data = await apiGet<{
      devices: Array<{ name: string; description: string }>
      error?: string
    }>('/api/backend/devices')
    devices.value = data.devices || []
    devicesError.value = data.error || (devices.value.length ? '' : 'No devices reported')
  } catch (e) {
    devicesError.value = e instanceof Error ? e.message : 'Device listing failed'
  } finally {
    devicesLoading.value = false
  }
}

function useDevice(name: string): void {
  config.value.autoFit = false
  config.value.backendAssignment = name
}

function lowVram(): void {
  configStore.applyLowVramProfile()
  toast.success('Low-VRAM profile applied')
}

function unsupported(flag: string): boolean {
  return capabilities.value.probed && !hasFlag(flag)
}

const TOGGLES: Array<{
  key: keyof typeof config.value
  label: string
  hint: string
  flag?: string
}> = [
  {
    key: 'flashAttention',
    label: 'Flash attention',
    hint: 'Faster and lighter on most GPUs',
    flag: '--diffusion-fa'
  },
  {
    key: 'cpuOffload',
    label: 'Offload weights to CPU',
    hint: 'Keeps big models in RAM until needed',
    flag: '--offload-to-cpu'
  },
  { key: 'vaeTiling', label: 'VAE tiling', hint: 'Decode large images in tiles' },
  { key: 'clipOnCpu', label: 'Text encoders on CPU', hint: 'Frees VRAM for the diffusion model' },
  { key: 'vaeOnCpu', label: 'VAE on CPU', hint: 'Slow, but saves VRAM' },
  { key: 'controlNetOnCpu', label: 'ControlNet on CPU', hint: '' },
  {
    key: 'streamLayers',
    label: 'Stream layers',
    hint: 'Fit models larger than VRAM',
    flag: '--stream-layers'
  },
  { key: 'diffusionConvDirect', label: 'Direct conv (diffusion)', hint: 'Can be faster on Vulkan' },
  { key: 'vaeConvDirect', label: 'Direct conv (VAE)', hint: '' },
  { key: 'forceSDXLVaeConvScale', label: 'SDXL VAE conv scale', hint: 'Fixes some SDXL VAEs' },
  { key: 'mmap', label: 'Memory-map model files', hint: 'Faster loading from SSD' },
  { key: 'eagerLoad', label: 'Eager load', hint: 'Load everything up front', flag: '--eager-load' },
  { key: 'disableImageMetadata', label: 'No PNG metadata', hint: 'Do not embed prompts in files' }
]

const inputClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/25 disabled:opacity-50'
</script>

<template>
  <div class="space-y-7">
    <div class="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 p-3">
      <Zap class="size-4 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">Low-VRAM profile</p>
        <p class="text-xs text-muted-foreground">
          Offload, stream layers, automatic VRAM budget and flash attention — for 4–8 GB GPUs.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background"
        @click="lowVram"
      >
        Apply
      </button>
    </div>

    <section class="space-y-2">
      <p class="text-sm font-medium">Memory and speed</p>
      <div class="grid gap-1 sm:grid-cols-2">
        <label
          v-for="t in TOGGLES"
          :key="t.key"
          class="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-accent"
          :class="t.flag && unsupported(t.flag) ? 'opacity-50' : ''"
        >
          <input
            v-model="config[t.key]"
            type="checkbox"
            class="mt-0.5"
            :disabled="!!t.flag && unsupported(t.flag)"
          />
          <span class="min-w-0">
            <span class="block text-sm">{{ t.label }}</span>
            <span class="block text-xs text-muted-foreground">
              {{ t.flag && unsupported(t.flag) ? 'Not in this sd.cpp build' : t.hint }}
            </span>
          </span>
        </label>
      </div>
      <div class="grid gap-3 pt-2 sm:grid-cols-3">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-muted-foreground"
            >Max VRAM (GiB, -1 auto)</span
          >
          <input
            v-model.number="config.maxVram"
            type="number"
            step="0.5"
            :class="inputClass"
            :disabled="unsupported('--max-vram')"
          />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-muted-foreground"
            >CPU threads (-1 auto)</span
          >
          <input v-model.number="config.threads" type="number" :class="inputClass" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-muted-foreground"
            >VAE tile size (0 auto)</span
          >
          <input
            v-model.number="config.vaeTileSize"
            type="number"
            min="0"
            step="32"
            :class="inputClass"
          />
        </label>
      </div>
      <label class="block max-w-xs pt-1">
        <span class="mb-1 block text-xs font-medium text-muted-foreground"
          >Live preview while generating</span
        >
        <Select
          v-model="config.livePreviewMethod"
          size="sm"
          :options="[
            { label: 'Off', value: '' },
            { label: 'Fast projection', value: 'proj' },
            { label: 'TAESD', value: 'tae' },
            { label: 'Full VAE', value: 'vae' }
          ]"
        />
      </label>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium">GPUs and devices</p>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
          :disabled="devicesLoading"
          @click="detectDevices"
        >
          <Loader2 v-if="devicesLoading" class="size-3.5 animate-spin" />
          <Cpu v-else class="size-3.5" />
          {{ devices.length ? 'Refresh' : 'Detect devices' }}
        </button>
      </div>
      <div v-if="devices.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="device in devices"
          :key="device.name"
          type="button"
          class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
          :class="
            config.backendAssignment === device.name
              ? 'border-transparent bg-foreground text-background'
              : 'border-border/70 hover:bg-accent'
          "
          @click="useDevice(device.name)"
        >
          <span class="font-mono font-medium">{{ device.name }}</span>
          <span class="truncate opacity-70">{{ device.description }}</span>
        </button>
      </div>
      <p v-else-if="devicesError" class="text-xs text-muted-foreground">{{ devicesError }}</p>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="config.autoFit" type="checkbox" />
        Auto-fit — let sd.cpp place each part on a device
      </label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-muted-foreground">Runtime devices</span>
          <input
            v-model="config.backendAssignment"
            :disabled="config.autoFit"
            placeholder="cuda0 or diffusion=cuda0,te=cuda1,vae=cpu"
            :class="inputClass"
            class="font-mono"
          />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-muted-foreground"
            >Weights stored on</span
          >
          <input
            v-model="config.paramsBackendAssignment"
            :disabled="config.autoFit"
            placeholder="cpu or diffusion=gpu,te=cpu"
            :class="inputClass"
            class="font-mono"
          />
        </label>
      </div>
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-muted-foreground">
          RPC servers — offload to other machines running ggml rpc-server (trusted networks only)
        </span>
        <input
          v-model="config.rpcServers"
          placeholder="192.168.1.10:50052,192.168.1.11:50052"
          :class="inputClass"
          class="font-mono"
        />
        <span class="mt-1 block text-xs text-muted-foreground">
          Remote devices appear as RPC0, RPC1… — use them in Runtime devices. Needs an sd.cpp build
          with RPC.
        </span>
      </label>
    </section>
  </div>
</template>
