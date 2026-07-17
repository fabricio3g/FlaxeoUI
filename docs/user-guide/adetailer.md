# ADetailer

ADetailer runs a **YOLOv8** detector on an image, then does a **cropped inpaint** on each detection (faces, people, etc.). Flaxeo uses [stable-diffusion.cpp ADetailer](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/adetailer.md).

## Requirements

1. A **recent** `sd-cli` build that advertises `--ad-model` / mode `adetailer` (upgrade backend in Settings if controls stay disabled).
2. A **converted** detector: YOLOv8 **detection** weights as `.safetensors` in `models/adetailer/`.
3. A diffusion model selected for the inpaint pass (same as normal generation).

Segmentation YOLO and MediaPipe are **not** supported by sd.cpp yet.

## Convert a detector

Ultralytics `.pt` files must be converted with the sd.cpp script (requires `ultralytics`, `torch`, `safetensors`):

```bash
python scripts/convert_yolov8_to_safetensors.py face_yolov8n.pt face_yolov8n.safetensors
```

Place the resulting file under:

```text
models/adetailer/face_yolov8n.safetensors
```

Common source: [Bingsu/adetailer](https://huggingface.co/Bingsu/adetailer) (e.g. `face_yolov8n.pt`). Only convert trusted `.pt` files (pickle).

Refresh models after adding files.

## After generate (Text2Image)

1. Open generation settings on **Image**.
2. Enable **ADetailer after generate**.
3. Choose a detector, optional AD prompt / negative, confidence, denoise, inpaint size.
4. Generate as usual — sd-cli runs detection + inpaint after the main image.

Prompt tips (sd.cpp):

- Empty AD prompt → inherits the main prompt.
- `[PROMPT]` inserts the main prompt.
- `[SEP]` splits prompts across masks; `[SKIP]` skips a mask.

## Repair an existing image (Gallery)

1. Open an image in **Gallery**.
2. Click the **ADetailer** (wand) action.
3. Uses your current detector settings + selected diffusion model (`-M adetailer`).

Output lands in the gallery like upscales.

## Settings map

| UI | CLI / extra-ad-args |
|----|---------------------|
| Detector | `--ad-model` |
| AD prompt / negative | `--ad-prompt` / `--ad-negative-prompt` |
| Confidence | `confidence` |
| Denoise | `denoising_strength` |
| Inpaint W/H | `inpaint_width` / `inpaint_height` |
| Padding / mask blur | `inpaint_padding` / `mask_blur` |
| Largest K | `mask_k_largest` (0 = all) |
| Mask mode | `mask_mode` |
| Extra args | free-form `key=value,key2=value2` |

Optional backend placement: `--backend "diffusion=cuda0,detector=cpu"` via backend assignment strings in Advanced hardware if needed.

## Troubleshoot

| Issue | What to try |
|-------|-------------|
| Controls disabled | Upgrade stable-diffusion.cpp; check Settings → Backend |
| No detector in list | Put `.safetensors` in `models/adetailer`, refresh models |
| No change in faces | Lower confidence slightly, raise denoise, check AD prompt |
| OOM | Lower inpaint size, enable Low VRAM, use smaller diffusion quant |
