# Changelog

All notable changes to FlaxeoUI are documented in this file.

## 0.4.0 — 2026-07-11

### Pro studio fundamentals
- PNG generation metadata reuse (seed / all settings) in Gallery and ImageViewer
- Dedicated Gallery **Upscale** action (`sd-cli -M upscale`)
- Local generation history strip
- **Low VRAM** hardware profile (offload + stream layers + max VRAM auto + flash attention)
- Runtime `sd-cli --help` capability probe (soft-gates unsupported controls)

### Edit & video parity
- Edit modes: Inpaint | Ref Edit (multi `-r`) | Img2Img
- Video modes: T2V | I2V | FLF2V (start/end frames), FPS control
- High-noise MoE panel and VACE / control-video path
- Model Hub packs: FLUX Kontext, Qwen Image Edit (+2511)

### Model ecosystem
- Hub packs: Z-Image Turbo, Chroma, Krea2, Lens
- Caching presets (EasyCache, UCache, Spectrum, Cache-DIT, …)
- Wan high-noise LoRA branch target (`|high_noise|`)
- Expanded quant formats (K-quants)

### Polish & reliability
- Human-friendly CLI error messages (OOM, missing model/VAE, …)
- Unit tests for CLI arg builders, error mapping, LoRA tokens, cache presets
- Simple / Advanced config density toggle
- Honest experimental labeling for Ngrok / Cloudflare tunnels; improved Cloudflare wait
- Version `0.4.0` (dropped `-debug` suffix)

### Generation spine (reliability)
- Shared client payload builder for Text2Image / Edit / Video (`buildGenerationPayload`)
- Single-flight CLI: server returns **409** when a job is already running; client global busy across surfaces (incl. upscale)
- CLI failures attach recent log tail so OOM / missing files humanize correctly
- Error toasts include **Open logs** action; floating log panel listens app-wide
- Fixed Text2Image FormData success path (`apiPostForm` returns parsed JSON)
- Edit / Video use typed API helpers + toast errors (no raw JSON dumps)
- Golden multi-mode CLI arg tests (t2i / inpaint / video / upscale / Low VRAM)

## 0.3.x

Earlier Electron + Vue studio with Text2Image, Edit, Video, Gallery, Quantization, Model Hub, and dual CLI/server backend mode.
