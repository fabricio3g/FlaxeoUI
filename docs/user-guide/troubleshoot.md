# Troubleshoot

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
4. See [models-hardware.md](./models-hardware.md).

## Queue not advancing

- Ensure the queue is not **Paused**.
- Cancel a hung current job, then Resume.
