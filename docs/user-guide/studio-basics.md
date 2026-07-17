# Studio basics

## Image (Text2Image)

1. Choose a model (command strip or Model panel).
2. Write a **prompt** (optional negative).
3. Set size, steps, CFG (composer + gear).
4. Optional: **Preview** = Proj / TAE / VAE for live frames while generating.
5. Press **Generate**.

**Session strip** under the stage lists this session’s images. While generating, the stage stays on live preview — click a past thumb to open it in the **fullscreen viewer** (does not interrupt the run). **Clear** blanks the workspace strip/stage but keeps files in Gallery. **Delete** removes the current file from disk.

**Seeds:** lock to reproduce; dice for random.  
**Batch:** multiple images per job.  
**Queue:** next Generate enqueues while a job runs.

**Advanced tools:** Img2Img (`-i`), Reference multi-ref (`-r`) — same ref processing presets as Edit → Ref Edit.

## Edit

| Mode         | What it does                                                      |
| ------------ | ----------------------------------------------------------------- |
| **Inpaint**  | Mask areas to change. Size always follows the source image.       |
| **Img2Img**  | Transform whole image with strength. Studio size or match source. |
| **Ref Edit** | Multi-reference edit (`-r`). Studio size or match ref.            |

Shared with Image: steps, CFG, seed, **live preview**.  
On Img2Img / Ref Edit: resolution chip, size policy, optional fit-to-target crop when adding an image.

Models & packs: see [Models & hardware](./models-hardware.md).

## Gallery

Browse outputs, fullscreen, **reuse seed** or **reuse all settings**, **upscale** when a model is in `models/upscale`.

## Video

**T2V**, **I2V**, **FLF2V**. Resolution chips + FPS. Models from Hub video packs.

## Queue

One generation at a time. Open **Queue** to reorder, remove waiting jobs, pause, or cancel. See [queue.md](./queue.md).
