/**
 * Map sd-cli log lines to coarse generation phases (cold load → sampling → decode).
 * Pure helpers — unit-tested without spawning CLI.
 */

export type GenerationPhase =
  | 'starting'
  | 'loading_encoder'
  | 'loading_diffusion'
  | 'loading_vae'
  | 'conditioning'
  | 'sampling'
  | 'decoding'
  | 'saving'

const PHASE_ORDER: GenerationPhase[] = [
  'starting',
  'loading_encoder',
  'loading_diffusion',
  'loading_vae',
  'conditioning',
  'sampling',
  'decoding',
  'saving'
]

export const PHASE_LABELS: Record<GenerationPhase, string> = {
  starting: 'Starting',
  loading_encoder: 'Loading text encoder',
  loading_diffusion: 'Loading diffusion',
  loading_vae: 'Loading VAE',
  conditioning: 'Encoding prompt',
  sampling: 'Generating',
  decoding: 'Decoding',
  saving: 'Saving'
}

function phaseIndex(phase: GenerationPhase): number {
  return PHASE_ORDER.indexOf(phase)
}

/** Detect phase from a single log line (may return null). */
export function detectPhaseFromLine(line: string): GenerationPhase | null {
  const text = line.trim()
  if (!text) return null

  // Sampling steps often look like: | 10/20 - 1.2it/s
  if (/\|\s*\d+\s*\/\s*\d+/.test(text) || /sampling using|generating image/i.test(text)) {
    return 'sampling'
  }

  if (/decoding|vae decoder|decode/i.test(text) && !/loading vae/i.test(text)) {
    return 'decoding'
  }

  if (/saving|write.*output|saved/i.test(text)) {
    return 'saving'
  }

  if (
    /get_learned_condition|computing condition|conditioner|parse '.*' to \[/i.test(text) ||
    /tokenize|bpe_tokenizer|qwen2_tokenizer/i.test(text)
  ) {
    return 'conditioning'
  }

  if (/loading (?:llm|t5|clip|text encoder)|loading llm from|clip_l|clip_g|t5xxl/i.test(text)) {
    return 'loading_encoder'
  }

  if (/loading diffusion|diffusion model from|diffusion_model/i.test(text)) {
    return 'loading_diffusion'
  }

  if (/loading vae|load.*vae from/i.test(text)) {
    return 'loading_vae'
  }

  if (/loading tensors|model_loader|init from|load_backend|Weight type/i.test(text)) {
    // generic tensor load — prefer encoder if llm/gguf path, else diffusion-ish
    if (/llm|t5|clip|qwen/i.test(text)) return 'loading_encoder'
    if (/vae|ae\.sft/i.test(text)) return 'loading_vae'
    if (/diffusion|gguf/i.test(text)) return 'loading_diffusion'
    return 'loading_encoder'
  }

  return null
}

/**
 * Only advance (or stay) — never go backwards through the pipeline.
 */
export function advancePhase(
  current: GenerationPhase,
  candidate: GenerationPhase | null
): GenerationPhase {
  if (!candidate) return current
  if (phaseIndex(candidate) >= phaseIndex(current)) return candidate
  return current
}

export function phaseLabel(phase: GenerationPhase): string {
  return PHASE_LABELS[phase] || phase
}
