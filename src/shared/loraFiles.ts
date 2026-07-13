import fs from 'node:fs'
import path from 'node:path'

const LORA_EXTENSION = /\.(gguf|safetensors|pt)$/i

export function normalizeLoraName(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(LORA_EXTENSION, '')
}

export function listLoraFiles(root: string): string[] {
  const walk = (directory: string, relativeDirectory = ''): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = path.join(relativeDirectory, entry.name)
      if (entry.isDirectory()) return walk(path.join(directory, entry.name), relative)
      return entry.isFile() && LORA_EXTENSION.test(entry.name) ? [relative] : []
    })

  return walk(root).sort((a, b) => a.localeCompare(b))
}

export function loraLookupNames(files: string[]): Set<string> {
  const names = new Set<string>()
  for (const file of files) {
    const relative = normalizeLoraName(file)
    names.add(relative)
    names.add(relative.split('/').pop() || relative)
  }
  return names
}
