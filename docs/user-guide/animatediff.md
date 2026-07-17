# AnimateDiff (SD 1.5)

AnimateDiff injects a **motion module** into a frozen SD 1.5 UNet so text-to-image checkpoints produce short animations. Flaxeo uses [stable-diffusion.cpp AnimateDiff](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/animatediff.md).

## Requirements

1. Backend with `--motion-module` (upgrade stable-diffusion.cpp if the Video picker stays disabled).
2. Motion module under `models/animatediff/` (e.g. `mm_sd15_v3.safetensors`).
3. Any **SD 1.5** checkpoint in `models/diffusion/` with **standard** load mode.

SDXL motion modules are **not** supported by sd.cpp yet.

## Model Hub

**Hub → AnimateDiff v3** downloads the recommended stack from sd.cpp docs:

| File | Folder |
|------|--------|
| `Realistic_Vision_V6.0_NV_B1_fp16.safetensors` | `models/diffusion/` (SD1.5 fp16 base, ~2.1 GB) |
| `mm_sd15_v3.safetensors` | `models/animatediff/` |
| `mm_sd15_v3_adapter.safetensors` (optional) | `models/loras/` |

Apply the pack to set Video defaults (512², CFG 8, euler, 16 frames, motion module + standard model selected). Any other SD1.5 checkpoint also works if you swap the base.

## Generate

1. Open **Video**.
2. Settings → **AnimateDiff motion module** → choose `mm_sd15_v3`.
3. Confirm **standard** load + SD1.5 in the model panel.
4. Recommended: **512×512**, **16 frames**, **8 FPS**, CFG **8**, sampler **euler**, scheduler **discrete**.
5. T2V: prompt only. I2V: reference image + **img2video strength** (~0.75).

Optional adapter in the prompt:

```text
your prompt <lora:mm_sd15_v3_adapter:1.0>
```

## Low VRAM

Docs verify ~2 GiB with `--max-vram` + stream layers. Use **Low VRAM** profile, or lower to 384² / 8 frames.

## Vs Wan / LTX

| | AnimateDiff | Wan / LTX |
|--|-------------|-----------|
| Base | SD 1.5 + motion module | Dedicated video DiT stacks |
| Load mode | **standard** (`-m`) | **split** |
| Flow-shift | Off | On |
| Typical size | 512², 8–16 frames | 832×480, 33+ frames |

Clear the motion module select to return to Wan/LTX controls (flow-shift, high-noise, VACE).
