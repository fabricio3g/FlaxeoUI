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
  'Studio basics',
  'Power tools',
  'Workflows',
  'Models & hardware',
  'Troubleshoot',
  'Community'
] as const

export const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    section: 'Getting started',
    keywords: ['setup', 'wizard', 'first', 'install', 'backend', 'onboarding', 'skip'],
    body: `# Getting started

## First run

1. Open Flaxeo Image.
2. Complete the **setup wizard**: install or select an **sd.cpp** backend (\`sd-cli\`).
3. **Models (optional now):** download a **starter pack**, or **Skip download** and add models later from the Hub or folders.
4. Optionally enable **Low VRAM** if you have a smaller GPU.
5. Finish → **Generate sample**, or open Image and write your own prompt.

If you skip the wizard, a quiet **Getting started** strip stays until your first successful image.

## Where models live

- Default: app data → \`models/\` (subfolders like \`diffusion/\`, \`vae/\`, \`loras/\`).
- Change root or open folders: **Settings → Storage**.
- Full folder map: Help → **Models & hardware**.

## Checklist

- **Backend** — \`sd-cli\` present and valid in Settings
- **Models** — at least one diffusion model (and VAE / encoders if the pack needs them)
- **First image** — successful Text2Image run

## Tips

- Prefer **CLI** mode until you are comfortable; **Server** is best for warm simple T2I.
- Open **Help** anytime from the sidebar (works offline).
`
  },
  {
    id: 'studio-basics',
    title: 'Studio basics',
    section: 'Studio basics',
    keywords: ['text2image', 'image', 'edit', 'video', 'gallery', 'seed', 'batch', 'preview'],
    body: `# Studio basics

## Image (Text2Image)

1. Choose a model (command strip or Model panel).
2. Write a **prompt** (optional negative).
3. Set size, steps, CFG (composer + gear).
4. Optional: **Preview** = Proj / TAE / VAE for live frames while generating.
5. Press **Generate**.

**Seeds:** lock to reproduce; dice for random.  
**Batch:** multiple images per job.  
**Queue:** next Generate enqueues while a job runs.

**Advanced tools:** Img2Img (\`-i\`), Reference multi-ref (\`-r\`) — same ref processing presets as Edit → Ref Edit.

## Edit

| Mode | What it does |
|------|----------------|
| **Inpaint** | Mask areas to change. Size always follows the source image. |
| **Img2Img** | Transform whole image with strength. Studio size or match source. |
| **Ref Edit** | Multi-reference edit (\`-r\`). Studio size or match ref. |

Shared with Image: steps, CFG, seed, **live preview**.  
On Img2Img / Ref Edit: resolution chip, size policy, optional fit-to-target crop when adding an image.

Models & packs: see **Models & hardware**.

## Gallery

Browse outputs, fullscreen, **reuse seed** or **reuse all settings**, **upscale** when a model is in \`models/upscale\`.

## Video

**T2V**, **I2V**, **FLF2V**. Resolution chips + FPS. Models from Hub video packs.

## Queue

One generation at a time. Open **Queue** to reorder, remove waiting jobs, pause, or cancel.
`
  },
  {
    id: 'queue',
    title: 'Job queue',
    section: 'Studio basics',
    keywords: ['queue', 'pause', 'cancel', 'waiting', 'batch', 'pending'],
    body: `# Job queue

Flaxeo runs **one** generation at a time (sd-cli single-flight). The queue lets you line up more work safely.

## Basics

- **Generate while busy** → job goes to **Waiting**.
- **Queue** button (command strip) shows count badge.
- **Pause** finishes the current job then stops starting more.
- **Cancel current** aborts the running job; the next waiting job starts.
- **Clear** under Recent removes done / failed / cancelled entries in the panel (not gallery files).

## Tips

- Reorder with ↑↓ before a job starts.
- Form jobs (Edit / Video with uploads) keep file snapshots in memory until the app restarts.
- Progress chip shows phase (loading encoder → diffusion → VAE, etc.).
`
  },
  {
    id: 'recipes',
    title: 'Recipes',
    section: 'Power tools',
    keywords: ['recipe', 'template', 'preset', 'export', 'import', 'share'],
    body: `# Recipes

A **recipe** is a full look: prompts plus generation settings (and model hints), not just saved prompt text.

## Use a recipe

1. Open **Image**.
2. Open the **Recipes** control near the prompt.
3. Pick a built-in or saved recipe → **Apply**.

Built-ins are starting points; change anything after apply.

## Save a recipe

1. Dial in models, size, steps, prompt, etc.
2. Open Recipes → name it → **Save current**.
3. Recipes are stored locally in the app.

## Share

- **Export** writes a \`.flaxeo-recipe.json\` file you can send offline.
- **Import** loads a recipe file into your library.

## Prompt presets vs recipes

| | Prompt presets | Recipes |
|--|----------------|---------|
| Stores | Positive / negative text | Full config snapshot + prompts |
| Best for | Reusing wording | Reusing a whole look |

## Built-in families

Search in Recipes by tag:

- **surface** — base color, roughness look, normal style, tileable
- **object** / **icon** — hero props, solid-bg icons
- **wide** / **tall** / **illustration** / **interface** — frames and mocks
- **mood** / **batch** — multi-seed cohesive sets

Map-style recipes are **looks** for iteration, not authored PBR channel bakes.
`
  },
  {
    id: 'surfaces-maps',
    title: 'Surfaces & map looks',
    section: 'Workflows',
    keywords: [
      'surface',
      'tile',
      'seamless',
      'albedo',
      'roughness',
      'normal',
      'material',
      'texture',
      '1024'
    ],
    body: `# Surfaces & map looks

Use **Recipes** tagged \`surface\` for material-style stills.

## Suggested loop

1. Apply **Surface · tileable** or **Surface · base color** (usually 1024×1024).
2. Generate; lock seed if you like the structure.
3. Optionally **Upscale** from Gallery for 2K handoff.
4. Open the gallery folder and drop files into your project tree.

## Map-style recipes

| Recipe | Intent |
|--------|--------|
| Base color | Flat-lit color, even lighting |
| Roughness look | Grayscale map *style* |
| Normal style | Technical purple/blue *look* |
| Tileable | Edge-friendly repeating prompt |

These are **prompted looks** for concepts and basing. True tangent-space normals and graph-authored maps belong in a DCC or specialist tool.

## Tips

- Prefer square power-of-two sizes (512 / 1024 / 2048 via resolution menu).
- Batch or queue several seeds, then re-run winners from **History**.
- Img2Img can refine a surface without losing overall layout.
`
  },
  {
    id: 'frames-mockups',
    title: 'Frames & mockups',
    section: 'Workflows',
    keywords: [
      'hero',
      'banner',
      'story',
      'mock',
      'interface',
      'empty',
      'illustration',
      'wide',
      'tall'
    ],
    body: `# Frames & mockups

Recipes for presentation frames and comps — not a separate app mode.

## Common picks

| Recipe | Frame |
|--------|--------|
| Wide · hero banner | ~16:9 covers and headers |
| Tall · story frame | ~9:16 full-bleed |
| Square · social | 1:1 thumbs |
| Illustration · empty state | Soft art with space |
| Interface · mock screen | Abstract UI illustration |
| Object · hero on ground | Single product/prop |
| Icon · solid background | Keyable solid bg |

## Loop

1. Apply a frame recipe.
2. Edit the prompt subject; keep size/steps from the recipe.
3. Use **batch** or **Mood · multi-seed set** for a small set.
4. History → **Re-run** the winner with a locked seed.

**Interface · mock screen** is illustration for comps, not production UI widgets.
`
  },
  {
    id: 'batch-queue-workflow',
    title: 'Batch & queue',
    section: 'Workflows',
    keywords: ['batch', 'queue', 'variants', 'overnight', 'seed', 'production'],
    body: `# Batch & queue

## Batch

Increase **batch count** in generation settings (or apply **Mood · multi-seed set**) to produce several images in one job when the backend supports multi-output.

## Queue

While a job runs, **Generate** adds the next job to the queue:

- Reorder waiting jobs
- Pause the queue
- Cancel only the current run

Use this for multi-look nights: tileable surface → base color → object hero, each as its own queued job.

## History

**History** (command strip) stores recent jobs. **Re-run** restores settings and prompts so you can refine winners without retyping.

## Variants & upscale

- Generation settings → **Queue 4 seed variants** enqueues four jobs with different seeds.
- Optional **Queue upscale after success** runs an upscale job when generation finishes (first model in \`models/upscale\`).
- Gallery: scale icon queues upscale; **…** opens upscale options.

## Viewer tools

Fullscreen image viewer:

- **2×2 / 3×3** — tile preview to check seams
- **Gray** — grayscale inspection for map-style stills
- **Copy image** / **Save** — clipboard and download
`
  },
  {
    id: 'prompt-assistant',
    title: 'Prompt Assistant (coming soon)',
    section: 'Power tools',
    keywords: ['llm', 'llama', 'assistant', 'expand', 'rewrite', 'complete'],
    body: `# Prompt Assistant (coming soon)

A dedicated **local** helper powered by **llama.cpp** (\`llama-server\`) will expand, rewrite, and complete prompts using GGUF models in \`models/llm/\`.

- Separate process from image generation (can pause when VRAM is needed)
- No cloud key required for the core path
- Apply is always explicit — never silent overwrite

This chapter will expand when the feature ships. See the product roadmap in the repo.
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

Open the Model panel → **Hub** for starter packs (SDXL, FLUX, Z-Image, Wan, Anima, Qwen edit, …).  
Packs show **on-disk** status when required files are installed.

## Low VRAM & profiles

- **Low VRAM** — offload, stream layers, max VRAM auto, flash attention where available.
- Prefer smaller quants (Q4 / Q5) on small GPUs.
- **Cache presets** — EasyCache, UCache, and other sd.cpp recipes (Advanced).

## CLI vs Server

| Mode | Best for |
|------|----------|
| **CLI** | Default. Edit, video, batch, uploads — full features. |
| **Server** | Warm multi-gen for simple Text2Image. Advanced jobs fall back to CLI. |

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
    keywords: ['share', 'contribute', 'github', 'export', 'extension'],
    body: `# Community

Flaxeo grows through **shareable data**, not random code plugins (for trust and safety).

## Share recipes

1. Export a \`.flaxeo-recipe.json\` from Recipes.
2. Send the file or open a PR with a recipe contribution.
3. Others **Import** the file — no install scripts.

## Packs

Model Hub packs list downloadable files. Suggest new packs via GitHub issues.

## Report bugs

Use GitHub Issues with: OS, GPU, backend tag (\`master-*\`), steps, and a log snippet.

## Extensions (planned)

Data-only packs (recipes + models + theme variables) — **no arbitrary code** in v1.
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
