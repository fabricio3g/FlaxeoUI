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
  'Models & hardware',
  'Troubleshoot',
  'Community'
] as const

export const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    section: 'Getting started',
    keywords: ['setup', 'wizard', 'first', 'install', 'backend', 'onboarding'],
    body: `# Getting started

## First run

1. Open FlaxeoUI.
2. Complete the **setup wizard**: install or select an **sd.cpp** backend (\`sd-cli\`).
3. Download a **starter pack** matched to your GPU (or pick SDXL / Z-Image as a safe default).
4. Optionally enable **Low VRAM** if you have a smaller GPU.
5. Finish and press **Generate sample**, or open Image and write your own prompt.

If you skip the wizard, a quiet **Getting started** strip stays until your first successful image.

## Checklist

- **Backend** — \`sd-cli\` present and valid in Settings
- **Models** — at least one diffusion model (and VAE if required by the pack)
- **First image** — successful Text2Image run

## Tips

- Prefer **CLI** mode until you are comfortable; **Server** mode is best for warm simple T2I.
- Open **Help** anytime from the sidebar for this guide offline.
`
  },
  {
    id: 'studio-basics',
    title: 'Studio basics',
    section: 'Studio basics',
    keywords: ['text2image', 'image', 'edit', 'video', 'gallery', 'seed', 'batch'],
    body: `# Studio basics

## Image (Text2Image)

1. Choose a model in the command strip or Model panel.
2. Write a **prompt** (and optional negative).
3. Set size, steps, CFG, sampler as needed (Simple vs Advanced density in config).
4. Press **Generate**.

**Seeds:** lock to reproduce; dice for a new random; copy to clipboard.
**Batch:** increase batch count for multiple images in one job.

## Queue

While a job runs, Generate **enqueues** the next job instead of blocking. Open **Queue** to reorder, remove waiting jobs, pause, or cancel the current run.

## Gallery

Browse outputs, open fullscreen, **reuse seed** or **reuse all settings**, and **upscale** when an upscale model is available.

## Edit

Modes: **Inpaint**, **Ref Edit** (multi-reference), **Img2Img**. Upload a base image and follow the mode tips in the panel.

## Video

Modes: **T2V**, **I2V**, **FLF2V**. Use resolution chips and FPS controls; video models come from Model Hub video packs.
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
    keywords: ['hub', 'vram', 'quantize', 'server', 'cli', 'cache', 'pack'],
    body: `# Models & hardware

## Model Hub

Open the Model panel → Hub for **starter packs** (SDXL, FLUX, Z-Image, Wan, edit packs, …).
Packs show **on-disk** status when required files are installed.

## Quantize

**Quantize** converts or quantizes models to GGUF formats supported by sd.cpp.

## Profiles

- **Low VRAM** — offload, stream layers, max VRAM auto, flash attention where available.
- **Cache presets** — EasyCache, UCache, and other sd.cpp caching recipes (Advanced).

## CLI vs Server

| Mode | Best for |
|------|----------|
| **CLI** | Default. All modes (edit, video, batch, uploads). |
| **Server** | Warm multi-gen for simple T2I. Advanced jobs fall back to CLI with a notice. |

## Capabilities

Flaxeo probes \`sd-cli --help\` and soft-gates unsupported controls so the UI matches your backend build.
`
  },
  {
    id: 'troubleshoot',
    title: 'Troubleshoot',
    section: 'Troubleshoot',
    keywords: ['oom', 'error', 'fail', 'cancel', 'stuck', 'logs', 'missing'],
    body: `# Troubleshoot

## Out of memory (OOM)

- Enable **Low VRAM** in setup or Settings.
- Lower resolution, steps, or batch.
- Use a smaller quant (Q4 / Q5).
- Close other GPU apps.

## Missing model / VAE / encoder

- Open Model Hub and confirm pack files are **On disk**.
- Select diffusion (and VAE/CLIP/T5 as required) in the Model panel.
- Error toasts often include **Open logs** for the CLI tail.

## Cancel stuck

- Press **Cancel** on the generate control or in the Queue panel.
- If the UI stays busy, check floating **Logs** and restart the app as a last resort.

## Generation failed

1. Read the toast (humanized message when possible).
2. Open logs.
3. Confirm backend path in Settings.
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
