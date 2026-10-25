/**
 * In-app Help catalog. Content mirrors docs/user-guide/*.md (keep in sync).
 */

export interface HelpTopic {
  id: string
  title: string
  section: string
  keywords: string[]
  body: string
}

export const HELP_SECTIONS = [
  'Getting started',
  'Create',
  'Workflows',
  'Power tools',
  'Models & hardware',
  'Troubleshoot',
  'Community'
] as const

export const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    section: 'Getting started',
    keywords: ['setup', 'wizard', 'first', 'install', 'engine', 'onboarding', 'skip'],
    body: `# Getting started

1. **Install the engine.** Flaxeo runs models with stable-diffusion.cpp. The title bar says
   **Install sd.cpp engine** until one is installed; **Settings → Engine & performance** installs it.
2. **Get a model.** Open **Models** and download a ready pack, or drop files into the models folder.
3. **Create.** Type a prompt in **Create** and press Enter.

The dot in the title bar tells you where things stand: green means the engine is ready,
amber means it is not installed, red means the local service stopped.

## Where files live

- Models: app data → \`models/\` (\`diffusion/\`, \`vae/\`, \`loras/\`…). Change it in **Settings → Storage**.
- Everything you make lands in **Assets** (the output folder).
`
  },
  {
    id: 'create',
    title: 'Create',
    section: 'Create',
    keywords: [
      'image',
      'edit',
      'video',
      'session',
      'prompt',
      'reference',
      'inpaint',
      'mask',
      'img2img'
    ],
    body: `# Create

One place for images, edits and video. Pick **Image**, **Edit** or **Video** in the prompt box.

## Sessions

Each generation becomes a row in the current session: the prompt, the model, size, seed and
the results. Start a new session from the column on the left. Sessions live on this computer,
so phones and laptops paired over your network see the same feed.

Hover a result to **edit** it, **animate** it, **upscale** it, use it as a **reference** or
download it. Hover a row to load its prompt and settings again, run it again or remove it
(the files stay in Assets).

## Attaching images

Drop images on the prompt box, paste them, or use the paperclip (from this device or from
Assets). Each image has a role you can change under its thumbnail:

| Mode | Roles |
|------|-------|
| Image | Reference (combine several), Start image (img2img), ControlNet, Style (IP-Adapter), Face (PhotoMaker) |
| Edit | Image to edit, Reference |
| Video | First frame, Last frame, Reference |

## Editing with a mask

Choose **Edit** on a result (or **Paint the area to change** after attaching one). Paint what
should change; leave it empty to edit the whole image. Reference-edit models (Kontext, Qwen
Image Edit…) receive the image as a reference automatically.

## Shortcuts

- **Enter** generates; **Shift+Enter** adds a line.
- Generating while something runs adds it to the queue.
`
  },
  {
    id: 'model-options',
    title: 'Model options',
    section: 'Create',
    keywords: [
      'options',
      'settings',
      'sampler',
      'steps',
      'cfg',
      'lora',
      'family',
      'recommended',
      'flags'
    ],
    body: `# Model options

**Options** in the prompt box opens every option of the selected model, grouped and searchable:
model files, LoRAs, sampling, size, image inputs, hi-res fix, face fix, video and advanced.

## Recommendations, not rules

Picking a model fills in its companion files (VAE, text encoders) from what is installed and
takes the recommended settings for its family only where you have not changed them. When your
values differ, the panel shows **Recommended for …** with **Apply**. Nothing is locked.

## New sd.cpp options

Flaxeo reads the installed engine's \`--help\`. Options it has no dedicated control for yet
appear under **More sd.cpp options**, so a new sd.cpp release is usable right away. Values are
checked against the engine before a run.
`
  },
  {
    id: 'workflows',
    title: 'Workflows',
    section: 'Workflows',
    keywords: ['nodes', 'graph', 'chain', 'comfy', 'lora', 'model', 'socket', 'bypass', 'batch'],
    body: `# Workflows

A node graph for chaining models: **Load model → LoRA → Generate image → Video → Output**.

## Sockets

Wires connect sockets of the same type; the color tells you which:
**Model** (lavender), **Text** (amber), **Image** (blue), **Video** (coral), **Number** (green).
Image sockets marked with ⋯ take several wires; their images are combined (for example several
references into one edit model).

- **Load model** holds a model with all its options (select it to edit them on the right).
- **LoRA** nodes add to the model passing through; chain as many as you like.
- Widgets left empty use the model's own value (shown as the placeholder).
- **Make input** on a widget (in the right panel) turns it into a socket, e.g. one **Number**
  node feeding the seed of several nodes.

## Editing

- Double-click the canvas, or drop a wire on empty space, to search for a node.
- Right-click a node: **Bypass** (passes its input through), **Duplicate**, **Delete**.
- **Ctrl+Z / Ctrl+Y** undo/redo, **Ctrl+C / Ctrl+V** copy/paste, **Ctrl+D** duplicate,
  **Ctrl+B** bypass, **Delete** removes, **Ctrl+S** saves, **Ctrl+Enter** runs.

## Running

**Run** checks the graph first and lists what is missing. **×N** queues the workflow N times.
Each node shows its progress and results; every file also lands in Assets.
`
  },
  {
    id: 'queue',
    title: 'Job queue',
    section: 'Create',
    keywords: ['queue', 'pause', 'cancel', 'waiting', 'batch', 'pending'],
    body: `# Job queue

Flaxeo runs one generation at a time. Anything you start while something runs waits in the
**Queue** (title bar), including workflow runs and jobs from other devices.

- **Pause** finishes the current job, then waits.
- **Cancel** stops the running job; the next one starts.
- Reorder waiting jobs before they start.
`
  },
  {
    id: 'sharing',
    title: 'Sharing on your network',
    section: 'Getting started',
    keywords: ['lan', 'phone', 'remote', 'pair', 'qr', 'share', 'network', 'devices', 'name'],
    body: `# Sharing on your network

Phones, tablets and other computers on the same network can use this computer's GPU.

1. **Settings → Sharing**: turn sharing on.
2. On the other device, scan the QR code or open the address and enter the pairing code.
3. Pick a name on that device; it shows on its generations and in the queue.

Paired devices use Create and Workflows; you choose what they may do (generate, browse Assets,
or full control). Revoke one device or all of them from the same page. Sharing stays inside
your local network.
`
  },
  {
    id: 'animatediff',
    title: 'AnimateDiff',
    section: 'Power tools',
    keywords: ['animatediff', 'motion', 'motion-module', 'sd15', 'video', 'animation', 'mm_sd15'],
    body: `# AnimateDiff

AnimateDiff adds a **motion module** to SD 1.5 for short animations via \`-M vid_gen --motion-module\`.

## Hub

**Model Hub → AnimateDiff v3** installs the recommended stack: **Realistic Vision V6.0 B1** (\`models/diffusion/\`) + \`mm_sd15_v3\` (\`models/animatediff/\`) + optional domain adapter LoRA. **Standard** load mode.

## Generate

1. Video workspace → settings → pick motion module.
2. 512×512, 16 frames, 8 FPS, CFG 8, euler + discrete (applied when you select a module).
3. T2V or I2V (img2video strength ~0.75).

Clear the motion module to use Wan/LTX stacks again (flow-shift, high-noise, VACE).

See \`docs/user-guide/animatediff.md\` and [sd.cpp animatediff.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/animatediff.md).
`
  },
  {
    id: 'adetailer',
    title: 'ADetailer',
    section: 'Power tools',
    keywords: ['adetailer', 'face', 'yolo', 'inpaint', 'detailer', 'detect', 'ad-model', 'repair'],
    body: `# ADetailer

ADetailer runs a **YOLOv8** detector, then a **cropped inpaint** on each detection. Powered by [stable-diffusion.cpp ADetailer](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/adetailer.md).

## Requirements

1. Backend that supports \`--ad-model\` / mode \`adetailer\` (upgrade in Settings if UI is disabled).
2. Converted detector \`.safetensors\` in \`models/adetailer/\` (not raw \`.pt\`).
3. Diffusion model selected for the inpaint pass.

## Convert a detector

\`\`\`bash
python scripts/convert_yolov8_to_safetensors.py face_yolov8n.pt face_yolov8n.safetensors
\`\`\`

Copy the \`.safetensors\` file into \`models/adetailer/\`, then refresh models.

## After generate

Image workspace → generation settings → **ADetailer after generate** → pick detector → generate.

- Empty AD prompt inherits the main prompt.
- \`[PROMPT]\` inserts the main prompt; \`[SEP]\` / \`[SKIP]\` control multi-mask prompts.

## Gallery repair

Open an image → **ADetailer** (wand) → queues \`-M adetailer\` with your current detector settings.

## Folders

| Path | Contents |
|------|----------|
| \`models/adetailer/\` | YOLOv8 detection \`.safetensors\` |

See also: full guide in the repo \`docs/user-guide/adetailer.md\`.
`
  },
  {
    id: 'cli-vs-server',
    title: 'Keeping the model loaded',
    section: 'Models & hardware',
    keywords: [
      'cli',
      'server',
      'sd-server',
      'sd-cli',
      'backend',
      'warm',
      'mode',
      'runtime',
      'start',
      'stop',
      't2i'
    ],
    body: `# Keep the model loaded

Flaxeo runs every model with **stable-diffusion.cpp**. By default each image starts \`sd-cli\`, which loads the model, generates and exits.

Turn on **Settings → Engine & performance → Keep the model loaded** to keep it in memory instead:

- The first image loads the model into \`sd-server\`; the next ones start right away.
- Picking another model (or other model files, like a VAE) reloads it on the next image.
- The setting lives on this computer, so **paired phones and tablets** use the loaded model too.
- Same settings either way: prompt, size, seed, sampler, scheduler, CFG, guidance, LoRAs, reference images, image-to-image and masked edits.
- Video, hi-res fix, face fix, ControlNet, identity and style references run through \`sd-cli\` as before. The loaded model is unloaded first so both never hold your GPU memory.
- **Unload** frees the memory right away. Builds older than sd-server's native API fall back to \`sd-cli\` and say so.
`
  },
  {
    id: 'models-hardware',
    title: 'Models & hardware',
    section: 'Models & hardware',
    keywords: [
      'hub',
      'vram',
      'quantize',
      'server',
      'cli',
      'cache',
      'pack',
      'folder',
      'path',
      'place',
      'loras',
      'gguf',
      'diffusion',
      'skip'
    ],
    body: `# Models & hardware

## Quick start

1. **Easiest:** Model panel → **Hub** → install a starter pack (files land in the right folders).
2. **Manual:** put weight files under \`models/\` (see below) → **Refresh models** → select diffusion (+ VAE / LLM / LoRAs as needed).
3. **Generate:** Image workspace → model selected → prompt → **Generate**.
4. **Edit packs:** Edit → Ref Edit or Img2Img with matching models.
5. **Video packs:** Video workspace + Hub video packs (Wan, LTX, LingBot, …).

Setup wizard can **skip** the starter download — install from Hub or folders anytime.

## Where files go

Default root: app **data** → \`models/\`  
Change it in **Settings → Storage → Models root** (and optional per-folder overrides).

| Folder under \`models/\` | Put here | Used for |
|------------------------|----------|----------|
| \`diffusion/\` | Main checkpoint / GGUF / DiT | Image, edit, most packs |
| \`uncond_diffusion/\` | High-noise / second stream | Dual-stream packs |
| \`vae/\` | VAE / AE | Many modern packs |
| \`clip/\` | CLIP text encoder | Split / modern stacks |
| \`t5xxl/\` | T5 encoder | FLUX-style packs |
| \`embeddings_connectors/\` | Connectors / embeds | Some DiT stacks |
| \`llm/\` | Language model GGUF | Qwen edit, some DiT |
| \`llm_vision/\` | Vision LLM | Multimodal edit |
| \`loras/\` | LoRA files | Strength in Model panel |
| \`controlnet/\` | ControlNet weights | Advanced tools |
| \`adetailer/\` | YOLOv8 ADetailer detectors (\`.safetensors\`) | ADetailer after gen / Gallery |
| \`animatediff/\` | AnimateDiff motion modules | Video SD1.5 motion |
| \`photomaker/\` | PhotoMaker | Identity |
| \`upscale/\` | ESRGAN etc. | Gallery / queue upscale |
| \`hires_upscalers/\` | Hires upscale models | Highres workflows |
| \`taesd/\` | Tiny AE | Faster live preview (TAE) |
| \`embeddings/\` | Textual inversion | Prompt embeds |
| \`clip_vision/\` | CLIP vision | Specialty packs |
| \`audio_vae/\` | Audio VAE | Audio-capable packs |

**Outputs** and **temp** are separate dirs under Settings → Storage (not inside \`models/\`).

After adding files manually, open the Model panel and **refresh** so Flaxeo sees them.

## How to pick models in the UI

| Load mode | When |
|-----------|------|
| **Standard** | Single-file / classic checkpoint workflow |
| **Split** | Diffusion + separate VAE / encoders / LLM (common for modern packs) |

Select each file from the dropdowns. Hub packs set these for you when you apply a pack.

## Model Hub

Open **Model Hub** from the titlebar or Config → Models. It is a **curated list** of packs based on [stable-diffusion.cpp documentation](https://github.com/leejet/stable-diffusion.cpp/tree/master/docs) — not a full marketplace. Browse **pack cards** with search and filters (Image / Edit / Video / Installed). Select a pack to download files, apply configuration, or open the pack’s docs. Status shows **Installed** or **N/M files on disk**.

## Low VRAM & profiles

- **Low VRAM** — offload, stream layers, max VRAM auto, flash attention where available.
- Prefer smaller quants (Q4 / Q5) on small GPUs.
- **Cache presets** — EasyCache, UCache, and other sd.cpp recipes (Advanced).

## Keep the model loaded

Off by default: each image loads the model. Turn it on in **Settings → Engine & performance** to keep the model in memory between images, for this computer and paired devices alike.

## Quantize

**Quantize** converts models to GGUF formats supported by sd.cpp.

## Capabilities

Flaxeo probes \`sd-cli --help\` and soft-gates unsupported controls so the UI matches your backend build.
`
  },
  {
    id: 'troubleshoot',
    title: 'Troubleshoot',
    section: 'Troubleshoot',
    keywords: ['oom', 'error', 'fail', 'cancel', 'stuck', 'logs', 'missing', 'folder'],
    body: `# Troubleshoot

## Out of memory (OOM)

- Enable **Low VRAM** in setup or Settings.
- Lower resolution, steps, or batch.
- Use a smaller quant (Q4 / Q5).
- Close other GPU apps.

## Missing model / VAE / encoder

- Open **Model Hub** and confirm pack files are **On disk**.
- Or place files in the correct folder under **Settings → Storage → Models** (e.g. \`diffusion/\`, \`vae/\`, \`loras/\`) and **Refresh models**.
- If you **skipped** setup download, install a pack from Hub or add files manually — see **Models & hardware**.
- Select diffusion (and VAE / CLIP / T5 / LLM as required) in the Model panel.
- Toasts often include **Open logs** for the CLI tail.

## Wrong folder

Files only show up if they sit in the matching subfolder (e.g. LoRAs in \`models/loras/\`, not the root).

## Cancel stuck

- Press **Cancel** on generate or in the Queue panel.
- If the UI stays busy, open floating **Logs**, then restart the app as a last resort.

## Generation failed

1. Read the toast.
2. Open logs.
3. Confirm backend path in Settings.
4. See **Models & hardware**.

## Queue not advancing

- Ensure the queue is not **Paused**.
- Cancel a hung current job, then Resume.
`
  },
  {
    id: 'community',
    title: 'Community',
    section: 'Community',
    keywords: ['share', 'contribute', 'github', 'export'],
    body: `# Community

Flaxeo grows through **shareable data**, not random code plugins (for trust and safety).

## Share recipes

1. Export a \`.flaxeo-recipe.json\` from Recipes — one file with settings and guide.
2. Send the file or open a PR with a recipe contribution.
3. Others **Import** the file — no install scripts.

## Packs

Model Hub packs list downloadable files. Suggest new packs via GitHub issues.

## Report bugs

Use GitHub Issues with: OS, GPU, backend tag (\`master-*\`), steps, and a log snippet.
`
  }
]

export function findHelpTopic(id: string): HelpTopic | undefined {
  return helpTopics.find((t) => t.id === id)
}

export function searchHelpTopics(query: string): HelpTopic[] {
  const q = query.trim().toLowerCase()
  if (!q) return helpTopics
  return helpTopics.filter((t) => {
    const hay = [t.title, t.section, t.id, ...t.keywords, t.body].join(' ').toLowerCase()
    return hay.includes(q)
  })
}
