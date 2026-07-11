# Studio basics

## Image (Text2Image)

1. Choose a model in the command strip or Model panel.  
2. Write a **prompt** (and optional negative).  
3. Set size, steps, CFG, sampler as needed (Simple vs Advanced density in config).  
4. Press **Generate**.  

**Seeds:** lock to reproduce; dice for a new random; copy to clipboard.  
**Batch:** increase batch count for multiple images in one job (uses CLI multi-output naming).

## Queue

While a job runs, Generate **enqueues** the next job instead of blocking. Open **Queue** to reorder, remove waiting jobs, pause, or cancel the current run. See [queue.md](./queue.md).

## Gallery

Browse outputs, open fullscreen, **reuse seed** or **reuse all settings**, and **upscale** when an upscale model is available.

## Edit

Modes: **Inpaint**, **Ref Edit** (multi-reference), **Img2Img**. Upload a base image and follow the mode tips in the panel.

## Video

Modes: **T2V**, **I2V**, **FLF2V**. Use resolution chips and FPS controls; video models come from Model Hub video packs.
