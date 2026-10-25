/**
 * Command palette catalog — jump to screens, settings, and folder actions.
 */
import type { Component } from 'vue'
import { Binary, Cpu, Database, FolderOpen, Settings, Share2 } from '@/lib/icons'
import { NAV_FOOTER, NAV_ITEMS } from '@/lib/tools'

export type CommandGroup = 'Navigate' | 'Settings' | 'Actions'

export type CommandAction =
  | { type: 'tab'; tab: string }
  | { type: 'settings'; category?: string }
  | { type: 'folder'; which: 'models' | 'gallery' }

export interface CommandItem {
  id: string
  label: string
  subtitle?: string
  keywords: string[]
  group: CommandGroup
  icon: Component
  action: CommandAction
}

const NAV_KEYWORDS: Record<string, string[]> = {
  create: ['image', 'edit', 'video', 'generate', 'session', 'inpaint', 'img2img', 'prompt'],
  workflows: ['pipeline', 'chain', 'nodes', 'graph', 'automation'],
  assets: ['gallery', 'outputs', 'images', 'history'],
  models: ['download', 'hub', 'lora', 'vae', 'checkpoint'],
  settings: ['preferences', 'options', 'config'],
  help: ['docs', 'guide', 'manual', 'how']
}

export const COMMAND_PALETTE_ITEMS: CommandItem[] = [
  ...[...NAV_ITEMS, ...NAV_FOOTER]
    .filter((item) => item.id !== 'settings')
    .map((item) => ({
      id: `nav-${item.id}`,
      label: item.label,
      subtitle: item.description,
      keywords: NAV_KEYWORDS[item.id] || [],
      group: 'Navigate' as const,
      icon: item.icon,
      action: { type: 'tab' as const, tab: item.id }
    })),
  {
    id: 'nav-quantize',
    label: 'Convert a model',
    subtitle: 'Quantize to GGUF',
    keywords: ['gguf', 'quantize', 'convert'],
    group: 'Navigate',
    icon: Binary,
    action: { type: 'tab', tab: 'quantization' }
  },
  {
    id: 'settings-general',
    label: 'General',
    subtitle: 'Settings · Name, theme, version',
    keywords: ['theme', 'dark', 'light', 'name', 'version', 'about'],
    group: 'Settings',
    icon: Settings,
    action: { type: 'settings', category: 'general' }
  },
  {
    id: 'settings-engine',
    label: 'Engine & performance',
    subtitle: 'Settings · sd.cpp, GPUs, memory',
    keywords: ['sd-cli', 'install', 'release', 'gpu', 'vram', 'offload', 'rpc', 'device'],
    group: 'Settings',
    icon: Cpu,
    action: { type: 'settings', category: 'engine' }
  },
  {
    id: 'settings-sharing',
    label: 'Sharing',
    subtitle: 'Settings · Other devices on your network',
    keywords: ['lan', 'remote', 'pair', 'share', 'phone', 'qr'],
    group: 'Settings',
    icon: Share2,
    action: { type: 'settings', category: 'sharing' }
  },
  {
    id: 'settings-storage',
    label: 'Storage',
    subtitle: 'Settings · Folders',
    keywords: ['folder', 'disk', 'models root', 'output', 'path'],
    group: 'Settings',
    icon: FolderOpen,
    action: { type: 'settings', category: 'storage' }
  },
  {
    id: 'action-models-folder',
    label: 'Open models folder',
    subtitle: 'Show models on disk',
    keywords: ['models', 'directory', 'explorer', 'finder'],
    group: 'Actions',
    icon: Database,
    action: { type: 'folder', which: 'models' }
  },
  {
    id: 'action-gallery-folder',
    label: 'Open output folder',
    subtitle: 'Show your images on disk',
    keywords: ['outputs', 'directory', 'explorer', 'finder'],
    group: 'Actions',
    icon: FolderOpen,
    action: { type: 'folder', which: 'gallery' }
  }
]

export function filterCommandItems(query: string): CommandItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return COMMAND_PALETTE_ITEMS
  return COMMAND_PALETTE_ITEMS.filter((item) => {
    const hay = [item.label, item.subtitle || '', ...item.keywords, item.group]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function groupCommandItems(
  items: CommandItem[]
): { group: CommandGroup; items: CommandItem[] }[] {
  const order: CommandGroup[] = ['Navigate', 'Settings', 'Actions']
  return order
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0)
}
