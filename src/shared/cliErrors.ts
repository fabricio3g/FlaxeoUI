/**
 * Map raw sd-cli / server errors into short, user-facing messages.
 */

export interface HumanizedError {
  title: string
  detail: string
  /** Hint for logs / next action */
  hint?: string
}

export function humanizeCliError(raw: unknown): HumanizedError {
  const text = normalizeErrorText(raw)

  if (/GENERATION_BUSY|already running|CLI busy/i.test(text)) {
    return {
      title: 'Already generating',
      detail: 'Another CLI job is running (generate, edit, video, upscale, or convert).',
      hint: 'Wait for it to finish, or cancel from the progress control.'
    }
  }

  if (/MODEL_REQUIRED|No model selected|diffusionModel/i.test(text)) {
    return {
      title: 'No model selected',
      detail: 'Choose a diffusion model or checkpoint in the model panel.',
      hint: 'Open Config → Models, or pick a Model Hub pack.'
    }
  }

  if (/UPSCALE_MODEL_REQUIRED|upscale model required|models[/\\]upscale/i.test(text)) {
    return {
      title: 'Upscale model missing',
      detail: 'Place an ESRGAN model in models/upscale and select it.',
      hint: 'Gallery → Upscale → choose a model.'
    }
  }

  if (/out of memory|CUDA out of memory|failed to allocate|GGML_ASSERT.*alloc|oom/i.test(text)) {
    return {
      title: 'Out of memory',
      detail: 'The model or resolution needs more VRAM/RAM than is available.',
      hint: 'Try Config → Hardware → Apply Low VRAM profile, lower resolution, or a smaller quant.'
    }
  }

  if (/vae.*(not found|missing|failed to load)|failed to load.*vae/i.test(text)) {
    return {
      title: 'VAE missing or failed',
      detail: 'This model needs a VAE file that was not found or could not load.',
      hint: 'Set VAE in Config → Models, or download the AE from the Model Hub pack.'
    }
  }

  if (/t5xxl|clip_l|clip_g|llm.*(not found|missing)|failed to load.*(clip|t5|llm)/i.test(text)) {
    return {
      title: 'Text encoder missing',
      detail: 'A required CLIP, T5, or LLM file is missing for this split model setup.',
      hint: 'Use Model Hub or Config → Models (split mode) to attach the encoders.'
    }
  }

  if (
    /No such file|ENOENT|not found|cannot find/i.test(text) &&
    /model|gguf|safetensors/i.test(text)
  ) {
    return {
      title: 'Model file not found',
      detail: 'A selected model path no longer exists on disk.',
      hint: 'Refresh models and re-select files under the models/ folders.'
    }
  }

  if (/Cancelled|SIGTERM|killed/i.test(text)) {
    return {
      title: 'Cancelled',
      detail: 'Generation was stopped before completion.'
    }
  }

  if (/sd-cli|backend binary|not found.*cli|active backend/i.test(text)) {
    return {
      title: 'Backend not ready',
      detail: 'The sd-cli binary is missing or invalid for the active backend.',
      hint: 'Open Settings → Backend and install or select a release.'
    }
  }

  // Child process died mid-run; often LoRA load / OOM. EPIPE is a Node pipe symptom.
  if (/EPIPE|write EPIPE|broken pipe/i.test(text)) {
    return {
      title: 'Backend process died',
      detail:
        'sd-cli closed while generating (often while loading a LoRA or running out of memory).',
      hint: 'Check LoRA matches the base model, try LoRA apply mode “Immediately” or “Auto”, move the file into models/loras, or enable Low VRAM. Open Logs for the last sd-cli lines.'
    }
  }

  if (/lora|LoRA/i.test(text) && /fail|error|not found|missing|crash|assert/i.test(text)) {
    return {
      title: 'LoRA load failed',
      detail: 'A LoRA could not be applied to the current model.',
      hint: 'Use a LoRA trained for this checkpoint family, ensure the file is under models/loras, and try apply mode Auto/Immediately if At runtime crashes.'
    }
  }

  // Strip huge stack dumps / JSON wrappers for display
  const short = text
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' ')
    .slice(0, 280)

  return {
    title: 'Generation failed',
    detail: short || 'An unknown error occurred.',
    hint: 'Open the log panel for the full sd-cli output.'
  }
}

export function formatHumanizedError(error: HumanizedError): string {
  return error.hint
    ? `${error.title}: ${error.detail} ${error.hint}`
    : `${error.title}: ${error.detail}`
}

function normalizeErrorText(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return [parsed.message, parsed.error, parsed.detail].filter(Boolean).join(' ')
      }
    } catch {
      // plain string
    }
    return raw
  }
  if (raw instanceof Error) return raw.message
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    return [obj.message, obj.error, obj.detail].filter(Boolean).join(' ') || JSON.stringify(raw)
  }
  return String(raw)
}
