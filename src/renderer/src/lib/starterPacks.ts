export interface HubFile {
  label: string
  category: string
  filename: string
  url: string
  required?: boolean
}

export interface HubModel {
  id: string
  name: string
  description: string
  presetId: string
  docsUrl: string
  files: HubFile[]
}

export const hubModels: HubModel[] = [
  {
    id: 'sdxl',
    name: 'SDXL',
    description:
      'Classic checkpoint workflow. Downloads the SDXL base checkpoint plus recommended VAE.',
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
      {
        label: 'SD3.5 Large diffusion',
        category: 'diffusion',
        filename: 'sd3.5_large.safetensors',
        required: true,
        url: 'https://huggingface.co/stabilityai/stable-diffusion-3.5-large/resolve/main/sd3.5_large.safetensors'
      },
      {
        label: 'CLIP-L',
        category: 'clip',
        filename: 'clip_l.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/clip_l.safetensors'
      },
      {
        label: 'CLIP-G',
        category: 'clipG',
        filename: 'clip_g.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/clip_g.safetensors'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/t5xxl_fp16.safetensors'
      }
    ]
  },
  {
    id: 'flux1-dev',
    name: 'FLUX.1 Dev',
    description: 'FLUX split workflow with AE, CLIP-L, T5XXL, low CFG, and flash attention.',
    presetId: 'builtin-flux-dev',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux.md',
    files: [
      {
        label: 'FLUX.1 Dev diffusion GGUF Q8',
        category: 'diffusion',
        filename: 'flux1-dev-q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/FLUX.1-dev-gguf/resolve/main/flux1-dev-q8_0.gguf'
      },
      {
        label: 'CLIP-L',
        category: 'clip',
        filename: 'clip_l.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/ae.safetensors'
      }
    ]
  },
  {
    id: 'flux2',
    name: 'FLUX.2',
    description:
      'FLUX.2 uses an LLM text encoder and Flux2 VAE format. Includes a Dev GGUF diffusion option and Flux2 VAE.',
    presetId: 'builtin-flux2-dev',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md',
    files: [
      {
        label: 'FLUX.2 Dev diffusion GGUF Q4_K_S',
        category: 'diffusion',
        filename: 'flux2-dev-Q4_K_S.gguf',
        required: true,
        url: 'https://huggingface.co/city96/FLUX.2-dev-gguf/resolve/main/flux2-dev-Q4_K_S.gguf'
      },
      {
        label: 'Mistral Small 3.2 LLM GGUF Q4_K_M',
        category: 'llm',
        filename: 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf'
      },
      {
        label: 'Flux2 AE',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/black-forest-labs/FLUX.2-dev/resolve/main/ae.safetensors'
      }
    ]
  },
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    description:
      'Qwen Image split workflow with Qwen VAE, Qwen VL LLM, flow shift 3, and flash attention.',
    presetId: 'builtin-qwen-image',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image.md',
    files: [
      {
        label: 'Qwen Image diffusion GGUF Q8',
        category: 'diffusion',
        filename: 'qwen-image-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Qwen-Image-GGUF/resolve/main/qwen-image-Q8_0.gguf'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      }
    ]
  },
  {
    id: 'wan21',
    name: 'Wan2.1 Video',
    description:
      'Wan video preset with UMT5, Wan VAE, flow shift, and optional CLIP Vision for I2V/FLF2V.',
    presetId: 'builtin-wan21',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md',
    files: [
      {
        label: 'Wan2.1 T2V 1.3B diffusion',
        category: 'diffusion',
        filename: 'wan2.1_t2v_1.3B_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors'
      },
      {
        label: 'Wan2.1 VAE',
        category: 'vae',
        filename: 'wan_2.1_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors'
      },
      {
        label: 'UMT5 XXL fp16',
        category: 't5xxl',
        filename: 'umt5_xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors'
      },
      {
        label: 'CLIP Vision H',
        category: 'clip_vision',
        filename: 'clip_vision_h.safetensors',
        required: false,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors'
      }
    ]
  },
  {
    id: 'wan22',
    name: 'Wan2.2 Video',
    description:
      'Wan2.2 preset supports high-noise + low-noise diffusion pairs and Wan VAE variants.',
    presetId: 'builtin-wan22-a14b',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md',
    files: [
      {
        label: 'Wan2.2 T2V A14B Low Noise',
        category: 'diffusion',
        filename: 'Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Wan2.2-T2V-A14B-GGUF/resolve/main/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf'
      },
      {
        label: 'Wan2.2 T2V A14B High Noise',
        category: 'diffusion',
        filename: 'Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Wan2.2-T2V-A14B-GGUF/resolve/main/Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf'
      },
      {
        label: 'Wan2.2 VAE',
        category: 'vae',
        filename: 'wan2.2_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors'
      },
      {
        label: 'UMT5 XXL fp16',
        category: 't5xxl',
        filename: 'umt5_xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors'
      }
    ]
  },
  {
    id: 'ltx23',
    name: 'LTX-2.3 Video',
    description:
      'LTX-2.3 video preset with LLM, embeddings connectors, audio VAE, and temporal tiling args.',
    presetId: 'builtin-ltx23',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ltx2.md',
    files: [
      {
        label: 'LTX-2.3 Dev diffusion GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'ltx-2.3-22b-dev-UD-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/ltx-2.3-22b-dev-UD-Q4_K_M.gguf'
      },
      {
        label: 'Gemma 3 12B LLM GGUF Q4_K_XL',
        category: 'llm',
        filename: 'gemma-3-12b-it-qat-UD-Q4_K_XL.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-qat-UD-Q4_K_XL.gguf'
      },
      {
        label: 'LTX video VAE',
        category: 'vae',
        filename: 'ltx-2.3-22b-dev_video_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/vae/ltx-2.3-22b-dev_video_vae.safetensors'
      },
      {
        label: 'LTX audio VAE',
        category: 'audio_vae',
        filename: 'ltx-2.3-22b-dev_audio_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/vae/ltx-2.3-22b-dev_audio_vae.safetensors'
      },
      {
        label: 'Embeddings connectors',
        category: 'embeddings_connectors',
        filename: 'ltx-2.3-22b-dev_embeddings_connectors.safetensors',
        required: true,
        url: 'https://huggingface.co/unsloth/LTX-2.3-GGUF/resolve/main/text_encoders/ltx-2.3-22b-dev_embeddings_connectors.safetensors'
      },
      {
        label: 'LTX spatial upscaler',
        category: 'hires_upscalers',
        filename: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        required: false,
        url: 'https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-spatial-upscaler-x2-1.1.safetensors'
      }
    ]
  },
  {
    id: 'flux-kontext',
    name: 'FLUX Kontext',
    description:
      'Image edit workflow with multi-ref support. Uses Kontext diffusion, FLUX AE, CLIP-L, and T5XXL. CFG 1 recommended.',
    presetId: 'builtin-flux-kontext',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/kontext.md',
    files: [
      {
        label: 'FLUX.1 Kontext Dev GGUF Q8',
        category: 'diffusion',
        filename: 'flux1-kontext-dev-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/FLUX.1-Kontext-dev-GGUF/resolve/main/flux1-kontext-dev-Q8_0.gguf'
      },
      {
        label: 'CLIP-L',
        category: 'clip',
        filename: 'clip_l.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/ae.safetensors'
      }
    ]
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen Image Edit',
    description:
      'Instruction image editing with multi-ref. Includes Edit diffusion, Qwen VAE, and Qwen2.5-VL LLM. Use Edit workspace → Ref Edit.',
    presetId: 'builtin-qwen-image-edit',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_edit.md',
    files: [
      {
        label: 'Qwen Image Edit GGUF Q8',
        category: 'diffusion',
        filename: 'Qwen_Image_Edit-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/QuantStack/Qwen-Image-Edit-GGUF/resolve/main/Qwen_Image_Edit-Q8_0.gguf'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      }
    ]
  },
  {
    id: 'qwen-image-edit-2511',
    name: 'Qwen Image Edit 2511',
    description:
      'Newer Qwen edit variant. Enables qwen_image_zero_cond_t for quality. Use Edit → Ref Edit after applying the pack.',
    presetId: 'builtin-qwen-image-edit-2511',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_edit.md',
    files: [
      {
        label: 'Qwen Image Edit 2511 GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'qwen-image-edit-2511-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF/resolve/main/qwen-image-edit-2511-Q4_K_M.gguf'
      },
      {
        label: 'Qwen2.5-VL 7B LLM GGUF Q8',
        category: 'llm',
        filename: 'Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q8_0.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      }
    ]
  },
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    description:
      'Fast low-VRAM image model. Diffusion GGUF + Qwen3 4B LLM + FLUX AE. CFG 1, 8 steps recommended.',
    presetId: 'builtin-z-image-turbo',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/z_image.md',
    files: [
      {
        label: 'Z-Image Turbo GGUF Q4_0',
        category: 'diffusion',
        filename: 'z_image_turbo-Q4_0.gguf',
        required: true,
        url: 'https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_0.gguf'
      },
      {
        label: 'Qwen3 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors'
      }
    ]
  },
  {
    id: 'chroma',
    name: 'Chroma',
    description:
      'FLUX-family DiT with T5XXL + AE. CFG ~4. Disables DiT mask by default (matches chroma docs).',
    presetId: 'builtin-chroma',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/chroma.md',
    files: [
      {
        label: 'Chroma1-HD GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'Chroma1-HD-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/silveroxides/Chroma1-HD-GGUF/resolve/main/Chroma1-HD-Q4_K_M.gguf'
      },
      {
        label: 'T5XXL fp16',
        category: 't5xxl',
        filename: 't5xxl_fp16.safetensors',
        required: true,
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors'
      },
      {
        label: 'FLUX AE',
        category: 'vae',
        filename: 'ae.safetensors',
        required: true,
        url: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/ae.safetensors'
      }
    ]
  },
  {
    id: 'krea2',
    name: 'Krea2',
    description:
      'Krea2 diffusion + Wan2.1 VAE + Qwen3-VL 4B LLM. Flash attention and CPU offload recommended.',
    presetId: 'builtin-krea2',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/krea2.md',
    files: [
      {
        label: 'Krea2 Base GGUF Q4_K_M',
        category: 'diffusion',
        filename: 'Krea-2-Base-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/realrebelai/KREA-2_GGUFs/resolve/main/BASE/Krea-2-Base-Q4_K_M.gguf'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3-VL-4B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Wan2.1 VAE',
        category: 'vae',
        filename: 'wan_2.1_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors'
      }
    ]
  },
  {
    id: 'lens',
    name: 'Lens',
    description:
      'Lens diffusion + Flux2 VAE + GPT-OSS-20B LLM. Large download; prefer offload. Turbo preset is 4 steps / CFG 1.',
    presetId: 'builtin-lens',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/lens.md',
    files: [
      {
        label: 'Lens diffusion bf16',
        category: 'diffusion',
        filename: 'lens_bf16.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Lens/resolve/main/diffusion_models/lens_bf16.safetensors'
      },
      {
        label: 'GPT-OSS-20B GGUF Q4_K_M',
        category: 'llm',
        filename: 'gpt-oss-20b-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/gpt-oss-20b-GGUF/resolve/main/gpt-oss-20b-Q4_K_M.gguf'
      },
      {
        label: 'Flux2 AE',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/black-forest-labs/FLUX.2-dev/resolve/main/ae.safetensors'
      }
    ]
  },
  {
    id: 'ideogram4',
    name: 'Ideogram4',
    description:
      'Ideogram4 needs a main diffusion model, uncond diffusion model, Qwen3-VL LLM, and Flux2 VAE.',
    presetId: 'builtin-ideogram4',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ideogram4.md',
    files: [
      {
        label: 'Ideogram4 diffusion fp8',
        category: 'diffusion',
        filename: 'ideogram4_fp8.safetensors',
        required: true,
        url: 'https://huggingface.co/ideogram-ai/ideogram-4-fp8/resolve/main/transformer/diffusion_pytorch_model.safetensors'
      },
      {
        label: 'Ideogram4 uncond diffusion fp8',
        category: 'uncond_diffusion',
        filename: 'ideogram4_uncond_fp8.safetensors',
        required: true,
        url: 'https://huggingface.co/ideogram-ai/ideogram-4-fp8/resolve/main/unconditional_transformer/diffusion_pytorch_model.safetensors'
      },
      {
        label: 'Qwen3-VL 8B LLM GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-VL-8B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3-VL-8B-Instruct-Q4_K_M.gguf'
      },
      {
        label: 'Flux2 AE',
        category: 'vae',
        filename: 'flux2_ae.safetensors',
        required: true,
        url: 'https://huggingface.co/black-forest-labs/FLUX.2-dev/resolve/main/ae.safetensors'
      }
    ]
  },
  {
    id: 'anima',
    name: 'Anima',
    description:
      'Fast T2I with Qwen3-0.6B + Qwen image VAE. For edit: install optional Anima Edit LoRA (AnimeEditV2), open Edit → Ref Edit with a reference image, enable the LoRA at strength ~1. Flaxeo applies cosmos_reference automatically.',
    presetId: 'builtin-anima',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/anima.md',
    files: [
      {
        label: 'Anima diffusion (preview)',
        category: 'diffusion',
        filename: 'anima-preview.safetensors',
        required: true,
        url: 'https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-preview.safetensors'
      },
      {
        label: 'Qwen3 0.6B Base GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-0.6B-Base.Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/mradermacher/Qwen3-0.6B-Base-GGUF/resolve/main/Qwen3-0.6B-Base.Q4_K_M.gguf'
      },
      {
        label: 'Qwen Image VAE',
        category: 'vae',
        filename: 'qwen_image_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors'
      },
      {
        // Community Anima Edit LoRA v2 — https://civitai.com/models/2650553/anima-edit?modelVersionId=3089149
        label: 'Anima Edit LoRA v2 (AnimeEditV2) — optional, for Ref Edit',
        category: 'loras',
        filename: 'AnimeEditV2.safetensors',
        required: false,
        url: 'https://civitai.com/api/download/models/3089149'
      }
    ]
  },
  {
    id: 'lingbot-video',
    name: 'LingBot Video',
    description:
      'LingBot dense 1.3B T2V/I2V with Wan2.1 VAE and Qwen3-VL 4B. Use Video workspace (frames 33/49/81).',
    presetId: 'builtin-lingbot-video',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/lingbot_video.md',
    files: [
      {
        label: 'LingBot dense 1.3B (diffusion)',
        category: 'diffusion',
        filename: 'lingbot-video-dense-1.3b.safetensors',
        required: true,
        // Transformer shards are multi-file on HF; users may replace with a single merged weight.
        url: 'https://huggingface.co/robbyant/lingbot-video-dense-1.3b/resolve/main/transformer/diffusion_pytorch_model.safetensors'
      },
      {
        label: 'Wan2.1 VAE',
        category: 'vae',
        filename: 'wan_2.1_vae.safetensors',
        required: true,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors'
      },
      {
        label: 'Qwen3-VL 4B Instruct GGUF Q4_K_M',
        category: 'llm',
        filename: 'Qwen3-VL-4B-Instruct-Q4_K_M.gguf',
        required: true,
        url: 'https://huggingface.co/unsloth/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3-VL-4B-Instruct-Q4_K_M.gguf'
      }
    ]
  },
  {
    id: 'minit2i',
    name: 'MiniT2I',
    description: 'Compact DiT + flan-t5-large text encoder for lightweight T2I (512², many steps).',
    presetId: 'builtin-minit2i',
    docsUrl: 'https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/minit2i.md',
    files: [
      {
        label: 'MiniT2I diffusion (B-16)',
        category: 'diffusion',
        filename: 'minit2i_diffusion_pytorch_model.safetensors',
        required: true,
        url: 'https://huggingface.co/MiniT2I/MiniT2I/resolve/main/minit2i-b-16/transformer/diffusion_pytorch_model.safetensors'
      },
      {
        label: 'FLAN-T5 Large (T5XXL slot)',
        category: 't5xxl',
        filename: 'flan-t5-large.safetensors',
        required: true,
        url: 'https://huggingface.co/google/flan-t5-large/resolve/main/model.safetensors'
      }
    ]
  }
]

export type StarterPackId = 'sdxl' | 'flux1-dev' | 'wan21'

export const STARTER_PACK_IDS: StarterPackId[] = ['sdxl', 'flux1-dev', 'wan21']

export interface StarterPackMeta {
  sizeGb: number
  minVramGb: number
  blurb: string
  recommended?: boolean
}

export const STARTER_PACK_META: Record<StarterPackId, StarterPackMeta> = {
  sdxl: {
    sizeGb: 7,
    minVramGb: 8,
    blurb: 'The smallest starter pack. Works on most GPUs.'
  },
  'flux1-dev': {
    sizeGb: 24,
    minVramGb: 12,
    blurb: 'Best quality for still images.',
    recommended: true
  },
  wan21: {
    sizeGb: 14,
    minVramGb: 12,
    blurb: 'Generate short videos. Larger download, more VRAM.'
  }
}
