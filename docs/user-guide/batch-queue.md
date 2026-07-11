# Batch & queue

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
- Optional **Queue upscale after success** runs an upscale job when generation finishes (first model in `models/upscale`).
- Gallery: scale icon queues upscale; **…** opens upscale options.

## Viewer tools

Fullscreen image viewer:

- **2×2 / 3×3** — tile preview to check seams
- **Gray** — grayscale inspection for map-style stills
- **Copy image** / **Save** — clipboard and download
