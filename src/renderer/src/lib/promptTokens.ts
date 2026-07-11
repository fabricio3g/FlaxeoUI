export type LoraNoiseTarget = 'default' | 'high_noise'

export interface PromptLora {
  path: string
  strength: number
  /**
   * Wan2.2 and similar MoE stacks can target the high-noise branch via
   * `<lora:|high_noise|name:strength>` (see stable-diffusion.cpp Wan docs).
   */
  target?: LoraNoiseTarget
}

function tokenNameFromPath(value: string): string {
  const filename = value.split(/[\\/]/).pop()?.trim() || ''
  return filename.replace(/\.(gguf|safetensors|pt)$/i, '')
}

export function formatLoraPromptToken(lora: PromptLora): string {
  const name = tokenNameFromPath(lora.path)
  if (!name) return ''
  const strength = Number.isFinite(Number(lora.strength)) ? Number(lora.strength) : 1
  if (lora.target === 'high_noise') {
    return `<lora:|high_noise|${name}:${strength}>`
  }
  return `<lora:${name}:${strength}>`
}

export function appendLoraPromptTokens(prompt: string, loras: PromptLora[]): string {
  const tokens = loras.map(formatLoraPromptToken).filter(Boolean)
  return [prompt.trim(), ...tokens].filter(Boolean).join(' ')
}
