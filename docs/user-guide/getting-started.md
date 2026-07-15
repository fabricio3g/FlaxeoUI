# Getting started

## First run

1. Open Flaxeo Image.
2. Complete the **setup wizard**: install or select an **sd.cpp** backend (`sd-cli`).
3. **Models (optional now):** download a **starter pack**, or **Skip download** and add models later from the Hub or folders.
4. Optionally enable **Low VRAM** if you have a smaller GPU.
5. Finish → **Generate sample**, or open Image and write your own prompt.

If you skip the wizard, a quiet **Getting started** strip stays until your first successful image.

## Where models live

- Default: app data → `models/` (subfolders like `diffusion/`, `vae/`, `loras/`).
- Change root or open folders: **Settings → Storage**.
- Full folder map: [Models & hardware](./models-hardware.md).

## Checklist

- **Backend** — `sd-cli` present and valid in Settings
- **Models** — at least one diffusion model (and VAE / encoders if the pack needs them)
- **First image** — successful Text2Image run

## Tips

- Prefer **CLI** mode until you are comfortable; **Server** is best for warm simple T2I.
- Open **Help** anytime from the sidebar (works offline).
