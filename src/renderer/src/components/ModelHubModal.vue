<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, ExternalLink, Loader2, X } from 'lucide-vue-next'
import { useConfigStore } from '@/stores/config'
import { apiPost } from '@/services/api'

interface HubFile {
  label: string
  category: string
  filename: string
  url: string
  required?: boolean
}

interface HubModel {
  id: string
  name: string
  description: string
  presetId: string
  docsUrl: string
  files: HubFile[]
}

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()
const activeModelId = ref('flux1-dev')
const downloading = ref<string | null>(null)
const downloadStatus = ref<Record<string, string>>({})

const hubModels: HubModel[] = [
  {
    id: 'sdxl',
    name: 'SDXL',
    description: 'Classic checkpoint workflow. Downloads the SDXL base checkpoint plus recommended VAE.',
    presetId: 'builtin-sdxl',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/sd.md',
    files: [
      {
        label: 'SDXL Base 1.0 checkpoint',
        category: 'diffusion',
        filename: 'sd_xl_base_1.0.safetensors',
        required: true,
        url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors'
      },
      {
        label: 'SDXL VAE fp16 fix',
        category: 'vae',
        filename: 'sdxl_vae-fp16-fix.safetensors',
        required: false,
        url: 'https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors'
      }
    ]
  },
  {
    id: 'sd35',
    name: 'SD3 / SD3.5',
    description: 'Split text encoders with CLIP-L, CLIP-G, T5XXL, and SD3.5 diffusion model.',
    presetId: 'builtin-sd35',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/sd3.md',
    files: [
      { label: 'SD3.5 Large diffusion', category: 'diffusion', filename: 'sd3.5_large.safetensors', required: true, url: 'https://huggingface.co/stabilityai/stable-diffusion-3.5-large/resolve/main/sd3.5_large.safetensors' },
      { label: 'CLIP-L', category: 'clip', filename: 'clip_l.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/clip_l.safetensors' },
      { label: 'CLIP-G', category: 'clip', filename: 'clip_g.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/clip_g.safetensors' },
      { label: 'T5XXL fp16', category: 't5xxl', filename: 't5xxl_fp16.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/t5xxl_fp16.safetensors' }
    ]
  },
  {
    id: 'flux1-dev',
    name: 'FLUX.1 Dev',
    description: 'FLUX split workflow with AE, CLIP-L, T5XXL, low CFG, and flash attention.',
    presetId: 'builtin-flux-dev',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux.md',
    files: [
      { label: 'FLUX.1 Dev diffusion GGUF Q8', category: 'diffusion', filename: 'flux1-dev-q8_0.gguf', required: true, url: 'https://huggingface.co/leejet/FLUX.1-dev-gguf/resolve/main/flux1-dev-q8_0.gguf' },
      { label: 'CLIP-L', category: 'clip', filename: 'clip_l.safetensors', required: true, url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors' },
      { label: 'T5XXL fp16', category: 't5xxl', filename: 't5xxl_fp16.safetensors', required: true, url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors' },
      { label: 'FLUX AE', category: 'vae', filename: 'ae.safetensors', required: true, url: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/ae.safetensors' }
    ]
  },
  {
    id: 'flux2',
    name: 'FLUX.2',
    description: 'FLUX.2 uses an LLM text encoder and Flux2 VAE format. Includes a Dev GGUF diffusion option and Flux2 VAE.',
    presetId: 'builtin-flux2-dev',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md',
    files: [
      { label: 'FLUX.2 Dev diffusion GGUF Q4_K_S', category: 'diffusion', filename: 'flux2-dev-Q4_K_S.gguf', required: true, url: 'https://huggingface.co/city96/FLUX.2-dev-gguf/resolve/main/flux2-dev-Q4_K_S.gguf' },
      { label: 'Mistral Small 3.2 LLM GGUF Q4_K_M', category: 'llm', filename: 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf', required: true, url: 'https://huggingface.co/unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf' },
      { label: 'Flux2 AE', category: 'vae', filename: 'flux2_ae.safetensors', required: true, url: 'https://huggingface.co/black-forest-labs/FLUX.2-dev/resolve/main/ae.safetensors' }
    ]
  },
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    description: 'Qwen Image split workflow with Qwen VAE, Qwen VL LLM, flow shift 3, and flash attention.',
    presetId: 'builtin-qwen-image',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image.md',
    files: [
      { label: 'Qwen Image diffusion GGUF Q8', category: 'diffusion', filename: 'qwen-image-Q8_0.gguf', required: true, url: 'https://huggingface.co/QuantStack/Qwen-Image-GGUF/resolve/main/qwen-image-Q8_0.gguf' },
      { label: 'Qwen2.5-VL 7B LLM GGUF Q8', category: 'llm', filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf', required: true, url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf' },
      { label: 'Qwen Image VAE', category: 'vae', filename: 'qwen_image_vae.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors' }
    ]
  },
  {
    id: 'wan21',
    name: 'Wan2.1 Video',
    description: 'Wan video preset with UMT5, Wan VAE, flow shift, and optional CLIP Vision for I2V/FLF2V.',
    presetId: 'builtin-wan21',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md',
    files: [
      { label: 'Wan2.1 T2V 1.3B diffusion', category: 'diffusion', filename: 'wan2.1_t2v_1.3B_fp16.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors' },
      { label: 'Wan2.1 VAE', category: 'vae', filename: 'wan_2.1_vae.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors' },
      { label: 'UMT5 XXL fp16', category: 't5xxl', filename: 'umt5_xxl_fp16.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors' },
      { label: 'CLIP Vision H', category: 'clip_vision', filename: 'clip_vision_h.safetensors', required: false, url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors' }
    ]
  },
  {
    id: 'wan22',
    name: 'Wan2.2 Video',
    description: 'Wan2.2 preset supports high-noise + low-noise diffusion pairs and Wan VAE variants.',
    presetId: 'builtin-wan22-a14b',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md',
    files: [
      { label: 'Wan2.2 T2V A14B Low Noise', category: 'diffusion', filename: 'Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf', required: true, url: 'https://huggingface.co/QuantStack/Wan2.2-T2V-A14B-GGUF/resolve/main/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf' },
      { label: 'Wan2.2 T2V A14B High Noise', category: 'diffusion', filename: 'Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf', required: true, url: 'https://huggingface.co/QuantStack/Wan2.2-T2V-A14B-GGUF/resolve/main/Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf' },
      { label: 'Wan2.2 VAE', category: 'vae', filename: 'wan2.2_vae.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors' },
      { label: 'UMT5 XXL fp16', category: 't5xxl', filename: 'umt5_xxl_fp16.safetensors', required: true, url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors' }
    ]
  },
  {
    id: 'ltx23',
    name: 'LTX-2.3 Video',
    description: 'LTX-2.3 video preset with LLM, embeddings connectors, audio VAE, and temporal tiling args.',
    presetId: 'builtin-ltx23',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ltx2.md',
    files: [
      { label: 'LTX-2.3 Dev diffusion GGUF Q4_K_M', category: 'diffusion', filename: 'ltx-2.3-22b-dev-UD-Q4_K_M.gguf', required: true, url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/ltx-2.3-22b-dev-UD-Q4_K_M.gguf' },
      { label: 'Gemma 3 12B LLM GGUF Q4_K_XL', category: 'llm', filename: 'gemma-3-12b-it-qat-UD-Q4_K_XL.gguf', required: true, url: 'https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-qat-UD-Q4_K_XL.gguf' },
      { label: 'LTX video VAE', category: 'vae', filename: 'ltx-2.3-22b-dev_video_vae.safetensors', required: true, url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/vae/ltx-2.3-22b-dev_video_vae.safetensors' },
      { label: 'LTX audio VAE', category: 'audio_vae', filename: 'ltx-2.3-22b-dev_audio_vae.safetensors', required: true, url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/vae/ltx-2.3-22b-dev_audio_vae.safetensors' },
      { label: 'Embeddings connectors', category: 'embeddings_connectors', filename: 'ltx-2.3-22b-dev_embeddings_connectors.safetensors', required: true, url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/text_encoders/ltx-2.3-22b-dev_embeddings_connectors.safetensors' },
      { label: 'LTX spatial upscaler', category: 'hires_upscalers', filename: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors', required: false, url: 'https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-spatial-upscaler-x2-1.1.safetensors' }
    ]
  },
  {
    id: 'ideogram4',
    name: 'Ideogram4',
    description: 'Ideogram4 needs a main diffusion model, uncond diffusion model, Qwen3-VL LLM, and Flux2 VAE.',
    presetId: 'builtin-ideogram4',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ideogram4.md',
    files: [
      { label: 'Ideogram4 diffusion fp8', category: 'diffusion', filename: 'ideogram4_fp8.safetensors', required: true, url: 'https://huggingface.co/ideogram-ai/ideogram-4-fp8/resolve/main/transformer/diffusion_pytorch_model.safetensors' },
      { label: 'Ideogram4 uncond diffusion fp8', category: 'uncond_diffusion', filename: 'ideogram4_uncond_fp8.safetensors', required: true, url: 'https://huggingface.co/ideogram-ai/ideogram-4-fp8/resolve/main/unconditional_transformer/diffusion_pytorch_model.safetensors' },
      { label: 'Qwen3-VL 8B LLM GGUF Q4_K_M', category: 'llm', filename: 'Qwen3-VL-8B-Instruct-Q4_K_M.gguf', required: true, url: 'https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3-VL-8B-Instruct-Q4_K_M.gguf' },
      { label: 'Flux2 AE', category: 'vae', filename: 'flux2_ae.safetensors', required: true, url: 'https://huggingface.co/black-forest-labs/FLUX.2-dev/resolve/main/ae.safetensors' }
    ]
  }
]

const activeModel = computed(() => hubModels.find((model) => model.id === activeModelId.value) || hubModels[0])

function applyPreset(model = activeModel.value): void {
  configStore.applyPreset(model.presetId)
}

async function downloadFile(file: HubFile): Promise<void> {
  const key = `${file.category}/${file.filename}`
  downloading.value = key
  downloadStatus.value[key] = 'Downloading...'
  try {
    await apiPost('/api/models/download', file)
    downloadStatus.value[key] = 'Downloaded'
  } catch (error) {
    downloadStatus.value[key] = error instanceof Error ? error.message : 'Download failed'
  } finally {
    downloading.value = null
  }
}

async function downloadPack(): Promise<void> {
  applyPreset()
  for (const file of activeModel.value.files) {
    await downloadFile(file)
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm titlebar-no-drag">
      <div class="flex max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <aside class="w-56 shrink-0 border-r border-border/70 bg-muted/30 p-3">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">Model Hub</h2>
          <button class="metal-icon-button p-1.5 text-muted-foreground hover:text-foreground" @click="emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
        <button
          v-for="model in hubModels"
          :key="model.id"
          class="mb-1 w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
          :class="activeModelId === model.id ? 'primary-metal-button' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeModelId = model.id"
        >
          {{ model.name }}
        </button>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col">
        <div class="border-b border-border/70 p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-semibold">{{ activeModel.name }}</h3>
              <p class="mt-1 max-w-2xl text-sm text-muted-foreground">{{ activeModel.description }}</p>
            </div>
            <a :href="activeModel.docsUrl" target="_blank" class="metal-icon-button flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
              Docs
              <ExternalLink class="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <div class="mb-4 flex flex-wrap gap-2">
            <button class="primary-metal-button rounded-lg px-4 py-2 text-xs font-medium" @click="applyPreset()">
              Apply Configuration
            </button>
            <button
              class="rounded-lg bg-muted px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="activeModel.files.length === 0 || !!downloading"
              @click="downloadPack"
            >
              Download Listed Files + Apply
            </button>
          </div>

          <div v-if="activeModel.files.length === 0" class="rounded-xl border border-border/70 bg-muted/25 p-4 text-sm text-muted-foreground">
            This model family has gated or variable filenames in the docs. Apply the configuration, then download the listed weights from the docs into the shown folders manually.
          </div>

          <div v-else class="space-y-2">
            <div v-for="file in activeModel.files" :key="`${file.category}/${file.filename}`" class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 truncate text-sm font-medium">
                  <span class="truncate">{{ file.label }}</span>
                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    :class="file.required ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
                  >
                    {{ file.required ? 'Required' : 'Optional' }}
                  </span>
                </div>
                <div class="truncate text-xs text-muted-foreground">models/{{ file.category }}/{{ file.filename }}</div>
                <div v-if="downloadStatus[`${file.category}/${file.filename}`]" class="mt-1 truncate text-[11px] text-muted-foreground">
                  {{ downloadStatus[`${file.category}/${file.filename}`] }}
                </div>
              </div>
              <button
                class="metal-icon-button flex shrink-0 items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!!downloading"
                @click="downloadFile(file)"
              >
                <Loader2 v-if="downloading === `${file.category}/${file.filename}`" class="h-3.5 w-3.5 animate-spin" />
                <Download v-else class="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  </Teleport>
</template>
