# Troubleshoot

## Out of memory (OOM)

- Enable **Low VRAM** in setup or Settings.
- Lower resolution, steps, or batch.
- Use a smaller quant (Q4 / Q5).
- Close other GPU apps.

## Missing model / VAE / encoder

- Open **Model Hub** and confirm pack files are **On disk**.
- Or place files in the correct folder under **Settings → Storage → Models** (e.g. `diffusion/`, `vae/`, `loras/`) and **Refresh models**.
- If you **skipped** setup download, install a pack from Hub or add files manually — see [models-hardware.md](./models-hardware.md).
- Select diffusion (and VAE / CLIP / T5 / LLM as required) in the Model panel.
- Toasts often include **Open logs** for the CLI tail.

## Wrong folder

Files only show up if they sit in the matching subfolder (e.g. LoRAs in `models/loras/`, not the root). Check the folder table in Models & hardware.

## Cancel stuck

- Press **Cancel** on generate or in the Queue panel.
- If the UI stays busy, open floating **Logs**, then restart the app as a last resort.

## Generation failed

1. Read the toast.
2. Open logs.
3. Confirm backend path in Settings.
4. See [models-hardware.md](./models-hardware.md).

## Queue not advancing

- Ensure the queue is not **Paused**.
- Cancel a hung current job, then Resume.
