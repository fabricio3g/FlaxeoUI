# Models & hardware

## Model Hub

Open the Model panel → Hub for **starter packs** (SDXL, FLUX, Z-Image, Wan, edit packs, …).  
Packs show **on-disk** status when required files are installed.

## Quantize

**Quantize** converts or quantizes models to GGUF formats supported by sd.cpp. Use after downloading larger weights if you need smaller VRAM.

## Profiles

- **Low VRAM** — offload, stream layers, max VRAM auto, flash attention where available.  
- **Cache presets** — EasyCache, UCache, and other sd.cpp caching recipes (Advanced).  

## CLI vs Server

| Mode | Best for |
|------|----------|
| **CLI** | Default. All modes (edit, video, batch, uploads). |
| **Server** | Warm multi-gen for simple T2I. Advanced jobs fall back to CLI with a notice. |

## Capabilities

Flaxeo probes `sd-cli --help` and soft-gates unsupported controls so the UI matches your backend build.
