export interface PromptLora {
  path: string
  strength: number
}

function tokenNameFromPath(value: string): string {
  const filename = value.split(/[\\/]/).pop()?.trim() || ''
  return filename.replace(/\.(gguf|safetensors|pt)$/i, '')
}

export function appendLoraPromptTokens(prompt: string, loras: PromptLora[]): string {
  const tokens = loras
    .map((lora) => {
      const name = tokenNameFromPath(lora.path)
      if (!name) return ''

      const strength = Number.isFinite(Number(lora.strength)) ? Number(lora.strength) : 1
      return `<lora:${name}:${strength}>`
    })
    .filter(Boolean)

  return [prompt.trim(), ...tokens].filter(Boolean).join(' ')
}
