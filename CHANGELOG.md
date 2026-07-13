# Changelog

All notable changes to Flaxeo Image are documented in this file.

## Unreleased

### Security

- Removed the built-in Ngrok and Cloudflare tunnel integrations and their binary dependencies.
- Bind the desktop API to localhost only; optional LAN access uses a selected private interface, one-time QR pairing, expiring sessions, permission profiles, and either recommended HTTPS or temporary generation-only HTTP.
- Restrict generation, upscale, model, and file-serving paths to configured storage roots with canonical path checks.
- Updated Electron, Electron Builder, Multer, tar, and Vite to patched releases; multipart uploads now have explicit resource limits.
- Added a configurable models root while preserving per-category folder overrides, and fixed nested/custom LoRA validation.

## 0.7.6 — 2026-07-12

### LoRA / CLI reliability

- Preflight check that LoRA files exist under `models/loras` (case-sensitive on Linux) with clear errors instead of vague `write EPIPE`
- Pass absolute `--lora-model-dir`; ensure `sd-cli` is executable on Linux before spawn
- Ignore console EPIPE when logging after a dead CLI process; humanize EPIPE / LoRA load failures in the UI

## 0.7.5 — 2026-07-12

### Linux packaging (AppImage / deb)

- Packaged Linux uses **writable** `userData/data` for models, output, temp, and backend downloads (AppImage `resources/` is read-only)
- Opening Models / Gallery / Custom folders no longer crashes the main process on `mkdir` failure
- Windows packaged paths unchanged (`resources/`)

### CI / tooling

- Force LF line endings (Prettier + `.gitattributes`) so `lint:ci` is consistent on Linux runners

## 0.7.4 — 2026-07-11

### Linux packaging

- Initial attempt at writable data paths on Linux (superseded by 0.7.5 release packaging)

## 0.7.3 — 2026-07-11

### Branding

- Product name: **Flaxeo Image** (window title, installer, docs)
- New black & white app icon: abstract modular glyph on full-bleed black (no white tile / corners)
- Wordmark: **Flaxeo** hard (`font-black`) + **Image** slim (`font-extralight`); ambient **square** field animation (not dots) on large empty states; README header SVG matches

## 0.7.2 — 2026-07-11

### Capability recipes (content)

- Built-in recipes for **surfaces** (base color, roughness look, normal style, tileable), **objects/icons**, **frames** (wide/tall/empty-state/interface mock), and **mood multi-seed**
- Help workflows: Surfaces & maps, Frames & mockups, Batch & queue (no new chrome — use Recipes + Queue + History)

### Output & production tools

- Resolution menu: power-of-two squares (`512²`…`2048²`) + standard frames (`16:9`, `9:16`, …)
- Gallery / viewer: **Copy image** (clipboard pixels), **Save** with clearer filenames
- Generation settings: **Queue 4 seed variants** (four queued jobs, distinct seeds)
- Optional **Queue upscale after success**; Gallery one-click queue upscale

### Viewer inspection

- Fullscreen viewer: **2×2 / 3×3 tile** preview and **Gray** (grayscale) toggle
- **Save / Copy** always in the viewer header (not only when metadata exists)
- Robust blob download for Save (Electron-friendly)

### Setup & UI

- Setup wizard is **optional** — skip permanently; only blocks when backend/models missing
- Getting started strip dismiss is permanent
- Custom confirm dialog (delete, etc.) — text-only chrome, no trash badge icon
- Advanced tools float panel; History float; queue upscale helpers

## 0.7.1 — 2026-07-11

### Fixes

- **Try sample / Generate sample** applies prompt on keep-alive Text2Image (live event + `onActivated`)
- **Setup wizard** closes after finish in dev (no longer forced open by `isDev`)
- **Recipes** and **Prompt presets** use distinct icons (Bookmark vs FileText); each appears once (composer only)

### History

- Generation history is a **float panel** (command strip **History**, Gallery icon) — scroll, re-run, remove, clear
- Removed Gallery horizontal history strip

### Recipes UI

- Larger panel and `text-sm` type for names, previews, and controls

## 0.7.0 — 2026-07-11

### Help & guide

- In-app **Help** view (sidebar + mobile): searchable offline topics
- User guide under `docs/user-guide/` (Getting started, Studio, Recipes, Queue, Models, Troubleshoot, Community)
- Deep links: `#/help?topic=recipes` (and other topic ids)
- Context **?** on Queue panel → Help · Queue

### Recipes (templates)

- Full-settings **recipes**: prompts + config snapshot (not just prompt text)
- Built-in starters (portrait, landscape, product, draft, anime, square)
- Save / apply / import / export `.flaxeo-recipe.json`
- Schema: `docs/schemas/recipe.schema.json`
- **Recipes** control on Text2Image next to prompt presets

### Icons

- Animated **Help** (BookText), **Bookmark** (recipes), **CircleHelp**, **Sparkles**

## 0.6.0 — 2026-07-11

### Local job queue (flagship)

- Generate while busy **enqueues** instead of blocking
- Queue panel: running job, pending list (reorder / remove), recent results, pause/resume, cancel current, **Clear** recent (done / failed / cancelled)
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
