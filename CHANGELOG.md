# Changelog

All notable changes to FlaxeoUI are documented in this file.

## 0.6.0 — 2026-07-11

### Local job queue (flagship)
- Generate while busy **enqueues** instead of blocking
- Queue panel: running job, pending list (reorder / remove), recent results, pause/resume, cancel current
- Works for Text2Image, Edit, Video, and Gallery upscale (FormData jobs snapshot files in memory)
- Progress chip shows current job label + pending count badge
- Command strip **Queue** button with live count

## 0.5.0 — 2026-07-11

### Trust sprint (path to best-in-class)
- **Phase-aware progress** from CLI logs: Loading text encoder → diffusion → VAE → encoding prompt → generating
- **Server mode honesty**: badge for warm T2I; advanced jobs (batch, uploads, edit paths) fall back to CLI with a toast
- **First-run checklist** in Setup finish: Backend · Models · First image
- Smoke checklist: `docs/SMOKE.md`
- Version `0.5.0`

### UI (from 0.4.x train)
- Simpler load/live-preview chip; larger preview canvas
- Icon click border fix; T2I batch grid + seed lock/dice/copy

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

### Performance
- Debounced config localStorage persist (400ms) to avoid full JSON stringify on every keystroke
- Shared singleton `useModels` with in-flight dedupe + short client TTL
- Server model list cache (8s TTL), invalidated after Hub download / convert
- `/api/status` returns log tail only (150 lines); server log buffer hard-capped
- Live preview: size+mtime gate, ETag/304, poll only while generating

### Standards
- CI runs `lint:ci` (ESLint errors fail the build)
- Broader capability soft-gates: cache mode, live preview, flash attn, CPU offload
- `useGeneration` owns claim/busy/cancel only; views own payload HTTP path
- Prettier `endOfLine: auto` (Windows CRLF noise)

### Depth (0.5 foundations)
- Generation history **Re-run** restores compact `configSnapshot` + prompts
- History stores wall-clock **duration** on jobs
- Model Hub **on-disk install checks** (per-file + pack ready badge)
- Gallery media filters: All / Images / Videos / Upscales
- Progress ETA prefers CLI it/s (better for long video runs); video status shows step/ETA

### UI polish + batch/seed (T2I)
- Fixed sticky **icon click border** (`.aui-icon-button` focus/ring; motion icons no longer `animateOnTap`)
- Refreshed `sd-cli-help.txt` from live **master-769** binary
- Batch jobs use modern CLI `-o name_%03d.png` and collect multi-file outputs
- Text2Image: **batch count** (1–16), multi-result **grid view**, seed **lock / dice / copy**

## 0.3.x

Earlier Electron + Vue studio with Text2Image, Edit, Video, Gallery, Quantization, Model Hub, and dual CLI/server backend mode.
