# Models & hardware

## Quick start

1. **Easiest:** open **Model Hub** (titlebar or Config) → search/filter packs → download → apply.
2. **Manual:** put weight files under `models/` (see below) → **Refresh models** → select diffusion (+ VAE / LLM / LoRAs as needed).
3. **Generate:** Image workspace → model selected → prompt → **Generate**.
4. **Edit packs:** Edit → Ref Edit or Img2Img with matching models.
5. **Video packs:** Video workspace + Hub video packs (Wan, LTX, LingBot, …).

Setup wizard can **skip** the starter download — install from Hub or folders anytime.

## Model Hub

A **curated list** based on the [stable-diffusion.cpp documentation](https://github.com/leejet/stable-diffusion.cpp/tree/master/docs) — not a full marketplace. Browse **pack cards** with search and chips (All / Image / Edit / Video / Installed). Recommended packs appear first. Select a pack for description, VRAM/size, file list, **Download pack** or **Apply configuration**, and the pack’s docs link. Status shows **Installed** or **N/M files on disk**. Downloads go into the correct `models/` folders.

## Where files go

Default root: app **data** → `models/`  
Change it in **Settings → Storage → Models root** (and optional per-folder overrides).

| Folder under `models/` | Put here | Used for |
|------------------------|----------|----------|
| `diffusion/` | Main checkpoint / GGUF / DiT | Image, edit, most packs |
| `uncond_diffusion/` | High-noise / second stream | Dual-stream packs |
| `vae/` | VAE / AE | Many modern packs |
| `clip/` | CLIP text encoder | Split / modern stacks |
| `t5xxl/` | T5 encoder | FLUX-style packs |
| `embeddings_connectors/` | Connectors / embeds | Some DiT stacks |
| `llm/` | Language model GGUF | Qwen edit, some DiT |
| `llm_vision/` | Vision LLM | Multimodal edit |
| `loras/` | LoRA files | Strength in Model panel |
| `controlnet/` | ControlNet weights | Advanced tools |
| `photomaker/` | PhotoMaker | Identity |
| `upscale/` | ESRGAN etc. | Gallery / queue upscale |
| `hires_upscalers/` | Hires upscale models | Highres workflows |
| `taesd/` | Tiny AE | Faster live preview (TAE) |
| `embeddings/` | Textual inversion | Prompt embeds |
| `clip_vision/` | CLIP vision | Specialty packs |
| `audio_vae/` | Audio VAE | Audio-capable packs |

**Outputs** and **temp** are separate dirs under Settings → Storage (not inside `models/`).

After adding files manually, open the Model panel and **refresh** so Flaxeo sees them.

## How to pick models in the UI

| Load mode | When |
|-----------|------|
| **Standard** | Single-file / classic checkpoint workflow |
| **Split** | Diffusion + separate VAE / encoders / LLM (common for modern packs) |

Select each file from the dropdowns (diffusion, VAE, CLIP, T5, LLM, LoRAs). Hub packs set these for you when you apply a pack.

## Low VRAM & profiles

- **Low VRAM** — offload, stream layers, max VRAM auto, flash attention where available (setup checkbox or Settings).
- Prefer smaller quants (Q4 / Q5) on small GPUs.
- **Cache presets** — EasyCache, UCache, and other sd.cpp recipes (Advanced).

## CLI vs Server

| Mode | Best for |
|------|----------|
| **CLI** | Default. Edit, video, batch, uploads — full features. |
| **Server** | Warm multi-gen for simple Text2Image. Advanced jobs fall back to CLI. |

## Quantize

**Quantize** converts models to GGUF formats supported by sd.cpp. Use after downloading larger weights if you need less VRAM.

## Capabilities

Flaxeo probes `sd-cli --help` and soft-gates unsupported controls so the UI matches your backend build.
